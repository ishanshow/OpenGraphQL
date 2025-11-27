import axios, { AxiosInstance } from 'axios';
import { BaseConnector } from './base-connector';
import { EntitySchema, FieldDefinition, RESTConfig } from '../types';
import { TypeMapper } from '../utils/type-mapper';
import { Logger } from '../utils/logger';

export class RESTConnector extends BaseConnector {
  private client: AxiosInstance | null = null;
  protected config: RESTConfig;

  constructor(config: RESTConfig) {
    super(config);
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...(this.config.headers || {}),
      };

      if (this.config.authToken) {
        headers['Authorization'] = `Bearer ${this.config.authToken}`;
      }

      this.client = axios.create({
        baseURL: this.config.baseUrl,
        headers,
        timeout: 30000,
      });

      Logger.success(`Connected to REST API: ${this.config.baseUrl}`);
    } catch (error) {
      Logger.error('Failed to connect to REST API', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    this.client = null;
    Logger.info('Disconnected from REST API');
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      // Try to fetch the first endpoint as a test
      if (this.config.endpoints.length > 0) {
        const endpoint = this.config.endpoints[0];
        await this.client!.request({
          method: endpoint.method,
          url: endpoint.path,
        });
      }
      return true;
    } catch (error) {
      Logger.warning('REST API test connection failed, but continuing...');
      return true; // REST APIs might not have a test endpoint
    }
  }

  async introspect(): Promise<EntitySchema[]> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    const entities: EntitySchema[] = [];
    const nestedTypes: Map<string, EntitySchema> = new Map();

    Logger.info(`Introspecting ${this.config.endpoints.length} endpoints...`);

    for (const endpoint of this.config.endpoints) {
      try {
        const entitySchema = await this.introspectEndpoint(endpoint, nestedTypes);
        entities.push(entitySchema);
        Logger.success(`Introspected endpoint: ${endpoint.queryName}`);
      } catch (error) {
        Logger.warning(`Failed to introspect endpoint ${endpoint.path}: ${error}`);
        
        // Create a basic schema even if introspection fails
        entities.push({
          name: TypeMapper.toPascalCase(endpoint.queryName),
          fields: [
            {
              name: 'data',
              type: 'JSON',
              isArray: false,
              isNullable: true,
            },
          ],
          description: `Endpoint: ${endpoint.method} ${endpoint.path}`,
        });
      }
    }

    // Add all discovered nested types to the entities array
    entities.push(...Array.from(nestedTypes.values()));

    return entities;
  }

  private async introspectEndpoint(endpoint: any, nestedTypes: Map<string, EntitySchema>): Promise<EntitySchema> {
    let responseData: any;

    // If response schema is provided, use it
    if (endpoint.responseSchema) {
      responseData = endpoint.responseSchema;
    } else {
      // Try to fetch a sample response
      try {
        const response = await this.client!.request({
          method: endpoint.method,
          url: endpoint.path,
        });
        responseData = response.data;
      } catch (error) {
        Logger.warning(`Could not fetch sample data for ${endpoint.path}`);
        throw error;
      }
    }

    const entityName = TypeMapper.toPascalCase(endpoint.queryName);
    
    // If response is an array, analyze all items additively
    let samplesToAnalyze: any[] = [];
    if (Array.isArray(responseData)) {
      samplesToAnalyze = responseData;
      Logger.info(`Found ${samplesToAnalyze.length} items to analyze for ${endpoint.queryName}`);
    } else if (responseData && typeof responseData === 'object') {
      // Check for nested array patterns
      for (const key of ['data', 'results', 'items']) {
        if (responseData[key] && Array.isArray(responseData[key])) {
          samplesToAnalyze = responseData[key];
          Logger.info(`Found ${samplesToAnalyze.length} items in '${key}' field for ${endpoint.queryName}`);
          break;
        }
      }
      // If no array found, treat the response as a single sample
      if (samplesToAnalyze.length === 0) {
        samplesToAnalyze = [responseData];
      }
    } else {
      samplesToAnalyze = [responseData];
    }

    // Analyze all samples additively to discover all possible fields
    const fieldMap = new Map<string, FieldDefinition>();
    
    for (const sample of samplesToAnalyze) {
      this.analyzeResponseStructureAdditively(
        sample,
        entityName,
        '',
        nestedTypes,
        fieldMap
      );
    }

    // Convert field map to array
    const fields = Array.from(fieldMap.values());
    
    Logger.success(`Discovered ${fields.length} unique fields for ${endpoint.queryName}`);

    return {
      name: entityName,
      fields,
      description: `Endpoint: ${endpoint.method} ${endpoint.path}`,
    };
  }

  /**
   * Analyzes response structure additively with support for nested types
   * Merges fields from multiple samples to discover all possible fields
   */
  private analyzeResponseStructureAdditively(
    data: any,
    parentTypeName: string,
    currentPath: string,
    nestedTypes: Map<string, EntitySchema>,
    fieldMap: Map<string, FieldDefinition>
  ): void {
    if (data === null || data === undefined) {
      return;
    }

    // If it's an array, analyze the first item
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return;
      }
      // Analyze all items in the array to discover all possible fields
      for (const item of data) {
        this.analyzeResponseStructureAdditively(item, parentTypeName, currentPath, nestedTypes, fieldMap);
      }
      return;
    }

    // If it's not an object, we can't extract fields
    if (typeof data !== 'object') {
      return;
    }

    for (const [key, value] of Object.entries(data)) {
      const sanitizedName = TypeMapper.sanitizeFieldName(key);
      const isArray = Array.isArray(value);
      const valueToAnalyze = isArray && value.length > 0 ? value[0] : value;

      // Skip if we've already seen this field
      if (fieldMap.has(sanitizedName)) {
        // Field already exists, but we might need to update the nested type
        if (typeof valueToAnalyze === 'object' && 
            valueToAnalyze !== null && 
            !(valueToAnalyze instanceof Date) &&
            Object.keys(valueToAnalyze).length > 0) {
          const nestedTypeName = `${parentTypeName}${TypeMapper.toPascalCase(key)}`;
          
          // Update nested type with fields from this sample
          if (nestedTypes.has(nestedTypeName)) {
            const existingType = nestedTypes.get(nestedTypeName)!;
            const existingFieldMap = new Map<string, FieldDefinition>();
            
            // Convert existing fields to map
            for (const field of existingType.fields) {
              existingFieldMap.set(field.name, field);
            }
            
            // Analyze this instance and merge fields
            if (isArray && Array.isArray(value)) {
              for (const arrayItem of value) {
                if (arrayItem && typeof arrayItem === 'object') {
                  this.analyzeResponseStructureAdditively(
                    arrayItem,
                    nestedTypeName,
                    `${currentPath}${currentPath ? '.' : ''}${key}`,
                    nestedTypes,
                    existingFieldMap
                  );
                }
              }
            } else {
              this.analyzeResponseStructureAdditively(
                valueToAnalyze,
                nestedTypeName,
                `${currentPath}${currentPath ? '.' : ''}${key}`,
                nestedTypes,
                existingFieldMap
              );
            }
            
            // Update the nested type with merged fields
            existingType.fields = Array.from(existingFieldMap.values());
          }
        }
        continue;
      }

      let type: string;
      
      if (valueToAnalyze === null || valueToAnalyze === undefined) {
        type = 'String';
      } else if (
        typeof valueToAnalyze === 'object' &&
        !(valueToAnalyze instanceof Date)
      ) {
        // Check if it's a non-empty object
        const objectKeys = Object.keys(valueToAnalyze);
        
        if (objectKeys.length > 0) {
          // Create a nested type for this object
          const nestedTypeName = `${parentTypeName}${TypeMapper.toPascalCase(key)}`;
          type = nestedTypeName;

          // Create or update the nested type
          if (!nestedTypes.has(nestedTypeName)) {
            // Initialize nested field map
            const nestedFieldMap = new Map<string, FieldDefinition>();
            
            // Analyze all items if it's an array
            if (isArray && Array.isArray(value)) {
              for (const arrayItem of value) {
                if (arrayItem && typeof arrayItem === 'object') {
                  this.analyzeResponseStructureAdditively(
                    arrayItem,
                    nestedTypeName,
                    `${currentPath}${currentPath ? '.' : ''}${key}`,
                    nestedTypes,
                    nestedFieldMap
                  );
                }
              }
            } else {
              // Recursively analyze the nested object
              this.analyzeResponseStructureAdditively(
                valueToAnalyze,
                nestedTypeName,
                `${currentPath}${currentPath ? '.' : ''}${key}`,
                nestedTypes,
                nestedFieldMap
              );
            }

            nestedTypes.set(nestedTypeName, {
              name: nestedTypeName,
              fields: Array.from(nestedFieldMap.values()),
              description: `Nested type from ${parentTypeName}.${key}`,
              isNested: true,
            });
          }
        } else {
          // Empty object, use JSON
          type = 'JSON';
        }
      } else {
        type = TypeMapper.inferTypeFromValue(valueToAnalyze);
      }

      // Since we're analyzing multiple samples, we should be conservative
      // and mark all fields as nullable by default. A field might not appear in all samples.
      // Exception: 'id' fields are commonly required, so we keep those non-nullable
      const isIdField = sanitizedName.toLowerCase() === 'id' || 
                        sanitizedName.toLowerCase().endsWith('_id') ||
                        sanitizedName.toLowerCase().endsWith('id');
      
      fieldMap.set(sanitizedName, {
        name: sanitizedName,
        type,
        isArray,
        isNullable: !isIdField, // All fields nullable except id fields
      });
    }
  }

  /**
   * Legacy method kept for backwards compatibility
   * @deprecated Use analyzeResponseStructureAdditively instead
   */
  private analyzeResponseStructureWithNesting(
    data: any,
    parentTypeName: string,
    currentPath: string,
    nestedTypes: Map<string, EntitySchema>
  ): FieldDefinition[] {
    const fieldMap = new Map<string, FieldDefinition>();
    this.analyzeResponseStructureAdditively(data, parentTypeName, currentPath, nestedTypes, fieldMap);
    return Array.from(fieldMap.values());
  }

  /**
   * Legacy method kept for backwards compatibility
   * @deprecated Use analyzeResponseStructureWithNesting instead
   */
  private analyzeResponseStructure(data: any, maxDepth: number = 2, currentDepth: number = 0): FieldDefinition[] {
    const fields: FieldDefinition[] = [];

    if (data === null || data === undefined) {
      return fields;
    }

    // If it's an array, analyze the first item
    if (Array.isArray(data)) {
      if (data.length === 0) {
        return fields;
      }
      return this.analyzeResponseStructure(data[0], maxDepth, currentDepth);
    }

    // If it's not an object, we can't extract fields
    if (typeof data !== 'object') {
      return fields;
    }

    for (const [key, value] of Object.entries(data)) {
      const sanitizedName = TypeMapper.sanitizeFieldName(key);
      const isArray = Array.isArray(value);
      const valueToAnalyze = isArray && value.length > 0 ? value[0] : value;

      let type: string;
      
      if (valueToAnalyze === null || valueToAnalyze === undefined) {
        type = 'String';
      } else if (typeof valueToAnalyze === 'object' && currentDepth < maxDepth) {
        // For nested objects, use JSON type
        type = 'JSON';
      } else {
        type = TypeMapper.inferTypeFromValue(valueToAnalyze);
      }

      fields.push({
        name: sanitizedName,
        type,
        isArray,
        isNullable: value === null || value === undefined,
      });
    }

    return fields;
  }

  async getData(entityName: string, args?: any): Promise<any[]> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    const endpoint = this.findEndpoint(entityName);
    if (!endpoint) {
      throw new Error(`Endpoint not found for entity: ${entityName}`);
    }

    try {
      // Merge filter into query parameters
      const queryParams = {
        ...(args?.params || {}),
        ...(args?.filter || {}),
      };

      const response = await this.client.request({
        method: endpoint.method,
        url: endpoint.path,
        params: queryParams,
        data: args?.body,
      });

      // Normalize response to array
      let dataArray: any[] = [];
      if (Array.isArray(response.data)) {
        dataArray = response.data;
      } else if (response.data && typeof response.data === 'object') {
        // Check common patterns for nested arrays
        const dataKeys = Object.keys(response.data);
        for (const key of ['data', 'results', 'items', entityName.toLowerCase()]) {
          if (dataKeys.includes(key) && Array.isArray(response.data[key])) {
            dataArray = response.data[key];
            break;
          }
        }
        // If no nested array found, return as single item array
        if (dataArray.length === 0) {
          dataArray = [response.data];
        }
      }

      // Apply client-side filtering if filter is provided
      // This ensures filtering works even if the REST API doesn't support it
      if (args?.filter && Object.keys(args.filter).length > 0) {
        dataArray = this.applyClientSideFilter(dataArray, args.filter);
      }

      // Apply limit and offset if provided
      const offset = args?.offset || 0;
      const limit = args?.limit;
      
      if (offset > 0 || limit !== undefined) {
        dataArray = dataArray.slice(offset, limit ? offset + limit : undefined);
      }

      return dataArray;
    } catch (error) {
      Logger.error(`Failed to fetch data for ${entityName}`, error);
      return [];
    }
  }

  /**
   * Applies client-side filtering to the data array
   * This is a fallback for REST APIs that don't support filtering via query parameters
   */
  private applyClientSideFilter(data: any[], filter: Record<string, any>): any[] {
    return data.filter(item => {
      for (const [key, value] of Object.entries(filter)) {
        // Handle nested keys (e.g., "user.name")
        const itemValue = this.getNestedValue(item, key);
        
        // Null/undefined check
        if (value === null || value === undefined) {
          if (itemValue !== value) return false;
        }
        // String comparison (case-insensitive)
        else if (typeof value === 'string' && typeof itemValue === 'string') {
          if (itemValue.toLowerCase() !== value.toLowerCase()) return false;
        }
        // Exact match for other types
        else if (itemValue !== value) {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Gets a nested value from an object using dot notation
   */
  private getNestedValue(obj: any, path: string): any {
    return path.split('.').reduce((current, key) => current?.[key], obj);
  }

  async getById(entityName: string, id: string): Promise<any> {
    if (!this.client) {
      throw new Error('Client not connected');
    }

    const endpoint = this.findEndpoint(entityName);
    if (!endpoint) {
      throw new Error(`Endpoint not found for entity: ${entityName}`);
    }

    try {
      // Try appending ID to the path
      const pathWithId = endpoint.path.endsWith('/') ? `${endpoint.path}${id}` : `${endpoint.path}/${id}`;
      
      const response = await this.client.request({
        method: 'GET',
        url: pathWithId,
      });

      return response.data;
    } catch (error) {
      Logger.warning(`Failed to fetch by ID for ${entityName}:${id}`);
      return null;
    }
  }

  private findEndpoint(entityName: string): any {
    return this.config.endpoints.find(
      ep => TypeMapper.toPascalCase(ep.queryName) === entityName ||
            TypeMapper.toCamelCase(ep.queryName) === entityName ||
            ep.queryName === entityName
    );
  }
}

