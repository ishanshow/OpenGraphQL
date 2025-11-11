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

    Logger.info(`Introspecting ${this.config.endpoints.length} endpoints...`);

    for (const endpoint of this.config.endpoints) {
      try {
        const entitySchema = await this.introspectEndpoint(endpoint);
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

    return entities;
  }

  private async introspectEndpoint(endpoint: any): Promise<EntitySchema> {
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

    // Analyze the response structure
    const fields = this.analyzeResponseStructure(responseData);

    return {
      name: TypeMapper.toPascalCase(endpoint.queryName),
      fields,
      description: `Endpoint: ${endpoint.method} ${endpoint.path}`,
    };
  }

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
      const response = await this.client.request({
        method: endpoint.method,
        url: endpoint.path,
        params: args?.params,
        data: args?.body,
      });

      // Normalize response to array
      if (Array.isArray(response.data)) {
        return response.data;
      } else if (response.data && typeof response.data === 'object') {
        // Check common patterns for nested arrays
        const dataKeys = Object.keys(response.data);
        for (const key of ['data', 'results', 'items', entityName.toLowerCase()]) {
          if (dataKeys.includes(key) && Array.isArray(response.data[key])) {
            return response.data[key];
          }
        }
        // Return as single item array
        return [response.data];
      }

      return [];
    } catch (error) {
      Logger.error(`Failed to fetch data for ${entityName}`, error);
      return [];
    }
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

