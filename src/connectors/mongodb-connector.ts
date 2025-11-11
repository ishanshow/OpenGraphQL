import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import { BaseConnector } from './base-connector';
import { EntitySchema, FieldDefinition, MongoDBConfig } from '../types';
import { TypeMapper } from '../utils/type-mapper';
import { Logger } from '../utils/logger';

export class MongoDBConnector extends BaseConnector {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  protected config: MongoDBConfig;

  constructor(config: MongoDBConfig) {
    super(config);
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      this.client = new MongoClient(this.config.uri);
      await this.client.connect();
      this.db = this.client.db(this.config.database);
      Logger.success(`Connected to MongoDB: ${this.config.database}`);
    } catch (error) {
      Logger.error('Failed to connect to MongoDB', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = null;
      this.db = null;
      Logger.info('Disconnected from MongoDB');
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      await this.db!.admin().ping();
      await this.disconnect();
      return true;
    } catch (error) {
      return false;
    }
  }

  async introspect(): Promise<EntitySchema[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const allEntities: EntitySchema[] = [];
    
    // Get collections to introspect
    const collectionsToIntrospect = this.config.collections || 
      (await this.db.listCollections().toArray()).map(c => c.name);

    Logger.info(`Introspecting ${collectionsToIntrospect.length} collections...`);

    for (const collectionName of collectionsToIntrospect) {
      try {
        const collection = this.db.collection(collectionName);
        const result = await this.introspectCollection(collection, collectionName);
        
        // Add main entity
        allEntities.push(result.mainEntity);
        
        // Add nested types
        allEntities.push(...result.nestedTypes);
        
        const totalFields = result.mainEntity.fields.length;
        const nestedCount = result.nestedTypes.length;
        Logger.success(
          `Introspected collection: ${collectionName} (${totalFields} fields, ${nestedCount} nested types)`
        );
      } catch (error) {
        Logger.warning(`Failed to introspect collection ${collectionName}: ${error}`);
      }
    }

    return allEntities;
  }

  private async introspectCollection(
    collection: Collection,
    collectionName: string
  ): Promise<{ mainEntity: EntitySchema; nestedTypes: EntitySchema[] }> {
    // Sample MORE documents to get better schema coverage
    const sampleSize = 500;
    const documents = await collection.find().limit(sampleSize).toArray();

    if (documents.length === 0) {
      Logger.warning(`Collection ${collectionName} is empty, creating minimal schema`);
      return {
        mainEntity: {
          name: TypeMapper.toPascalCase(TypeMapper.singularize(collectionName)),
          fields: [
            {
              name: '_id',
              type: 'ID',
              isArray: false,
              isNullable: false,
              isRequired: true,
            },
          ],
          description: `Collection: ${collectionName}`,
        },
        nestedTypes: [],
      };
    }

    Logger.info(`Analyzing ${documents.length} documents from ${collectionName}...`);
    
    // Debug: Show a sample document structure
    if (documents.length > 0) {
      const sampleKeys = Object.keys(documents[0]);
      Logger.debug(`Sample document has ${sampleKeys.length} keys:`, sampleKeys);
    }

    // Use singular form for the type name
    const typeName = TypeMapper.toPascalCase(TypeMapper.singularize(collectionName));

    // Track nested types discovered during analysis
    const nestedTypes = new Map<string, EntitySchema>();

    // Aggregate all fields from all documents with occurrence tracking
    const fieldMap = new Map<string, FieldDefinition & { occurrences: number }>();

    // Always include _id
    fieldMap.set('_id', {
      name: '_id',
      type: 'ID',
      isArray: false,
      isNullable: false,
      isRequired: true,
      occurrences: documents.length,
    });

    // Analyze all documents to discover fields and nested types
    for (const doc of documents) {
      this.analyzeDocumentWithNesting(doc, fieldMap, documents.length, typeName, '', nestedTypes);
    }

    Logger.debug(`Field map after analysis has ${fieldMap.size} fields`);
    Logger.debug(`Discovered ${nestedTypes.size} nested types`);

    // Convert to final schema, removing occurrence tracking
    const fields = Array.from(fieldMap.values()).map(({ occurrences, ...field }) => {
      // Fields are nullable by default
      // Only mark as non-nullable if field appears in ALL documents (100%)
      if (occurrences === documents.length && !field.isNullable) {
        field.isNullable = false;
      } else {
        field.isNullable = true;
      }
      return field;
    });

    Logger.info(`Final schema has ${fields.length} fields, ${nestedTypes.size} nested types`);

    return {
      mainEntity: {
        name: typeName,
        fields,
        description: `Collection: ${collectionName} (sampled ${documents.length} documents, ${fields.length} unique fields)`,
      },
      nestedTypes: Array.from(nestedTypes.values()),
    };
  }

  /**
   * Analyzes a document and creates nested types for objects
   */
  private analyzeDocumentWithNesting(
    doc: any,
    fieldMap: Map<string, FieldDefinition & { occurrences: number }>,
    totalDocs: number,
    parentTypeName: string,
    currentPath: string,
    nestedTypes: Map<string, EntitySchema>
  ): void {
    if (!doc || typeof doc !== 'object') {
      return;
    }

    for (const [key, value] of Object.entries(doc)) {
      // Skip _id at root level (already handled)
      if (key === '_id' && !currentPath) {
        continue;
      }

      // Skip internal MongoDB fields
      if (key.startsWith('__') || key.startsWith('$')) {
        continue;
      }

      const sanitizedName = TypeMapper.sanitizeFieldName(key);

      if (value === null || value === undefined) {
        // Mark as nullable if we see null values
        if (fieldMap.has(sanitizedName)) {
          const field = fieldMap.get(sanitizedName)!;
          field.isNullable = true;
        } else {
          fieldMap.set(sanitizedName, {
            name: sanitizedName,
            type: 'String',
            isArray: false,
            isNullable: true,
            occurrences: 1,
          });
        }
        continue;
      }

      const isArray = Array.isArray(value);
      const valueToAnalyze = isArray && value.length > 0 ? value[0] : value;

      // Determine the GraphQL type
      let type: string;
      let shouldCreateNestedType = false;

      if (isArray && value.length === 0) {
        type = 'JSON'; // Unknown array type
      } else if (
        typeof valueToAnalyze === 'object' && 
        !(valueToAnalyze instanceof Date) && 
        valueToAnalyze.constructor?.name !== 'ObjectId'
      ) {
        // This is an object - create a nested type for it
        const objectKeys = Object.keys(valueToAnalyze);
        
        if (objectKeys.length > 0) {
          // Create a nested type
          const nestedTypeName = `${parentTypeName}${TypeMapper.toPascalCase(key)}`;
          type = nestedTypeName;
          shouldCreateNestedType = true;

          // Create or update the nested type
          if (!nestedTypes.has(nestedTypeName)) {
            // Initialize nested type
            const nestedFieldMap = new Map<string, FieldDefinition & { occurrences: number }>();
            
            // Analyze the nested object
            this.analyzeDocumentWithNesting(
              valueToAnalyze,
              nestedFieldMap,
              totalDocs,
              nestedTypeName,
              `${currentPath}${currentPath ? '.' : ''}${key}`,
              nestedTypes
            );

            // Convert to EntitySchema
            // Fields in nested types are nullable by default
            // Only mark as non-nullable if field appears in ALL occurrences
            const nestedFields = Array.from(nestedFieldMap.values()).map(({ occurrences, ...field }) => {
              // For nested types, we need to track how many times the parent appeared
              // For now, make all nested fields nullable by default
              field.isNullable = true;
              return field;
            });

            nestedTypes.set(nestedTypeName, {
              name: nestedTypeName,
              fields: nestedFields,
              description: `Nested type from ${parentTypeName}.${key}`,
              isNested: true,
            });
          } else {
            // Update existing nested type by analyzing this instance
            const existingType = nestedTypes.get(nestedTypeName)!;
            const nestedFieldMap = new Map<string, FieldDefinition & { occurrences: number }>();
            
            // Convert existing fields back to map
            for (const field of existingType.fields) {
              nestedFieldMap.set(field.name, { ...field, occurrences: 1 });
            }

            // Analyze this instance
            this.analyzeDocumentWithNesting(
              valueToAnalyze,
              nestedFieldMap,
              totalDocs,
              nestedTypeName,
              `${currentPath}${currentPath ? '.' : ''}${key}`,
              nestedTypes
            );

            // Update the nested type
            const updatedFields = Array.from(nestedFieldMap.values()).map(({ occurrences, ...field }) => field);
            nestedTypes.set(nestedTypeName, {
              ...existingType,
              fields: updatedFields,
            });
          }
        } else {
          type = 'JSON'; // Empty object
        }
      } else {
        type = TypeMapper.mapMongoDBType(valueToAnalyze);
      }

      // Add or update field in the current field map
      if (!fieldMap.has(sanitizedName)) {
        fieldMap.set(sanitizedName, {
          name: sanitizedName,
          type,
          isArray,
          isNullable: true, // Default to nullable, will be set to false later if always present
          occurrences: 1,
        });
      } else {
        const existingField = fieldMap.get(sanitizedName)!;
        existingField.occurrences++;

        // Handle type conflicts
        if (existingField.type !== type) {
          // If one is a nested type and the other isn't, keep the nested type
          if (shouldCreateNestedType) {
            existingField.type = type;
          } else if (type === 'JSON' || existingField.type === 'JSON') {
            existingField.type = 'JSON';
          } else if (type === 'String' || existingField.type === 'String') {
            existingField.type = 'String';
          } else if ((type === 'Float' && existingField.type === 'Int') ||
                     (type === 'Int' && existingField.type === 'Float')) {
            existingField.type = 'Float';
          } else {
            existingField.type = 'JSON';
          }
        }

        // Handle array inconsistency
        if (isArray !== existingField.isArray) {
          existingField.isArray = true;
          existingField.isNullable = true;
        }
      }
    }
  }

  private analyzeDocument(
    doc: any,
    fieldMap: Map<string, FieldDefinition & { occurrences: number }>,
    prefix: string = '',
    totalDocs: number
  ): void {
    if (!doc || typeof doc !== 'object') {
      return;
    }

    for (const [key, value] of Object.entries(doc)) {
      // Skip _id at root level (already handled)
      if (key === '_id' && !prefix) {
        continue;
      }

      // Skip internal MongoDB fields
      if (key.startsWith('__') || key.startsWith('$')) {
        continue;
      }

      const fieldName = prefix ? `${prefix}_${key}` : key;
      const sanitizedName = TypeMapper.sanitizeFieldName(fieldName);

      if (value === null || value === undefined) {
        // Mark as nullable if we see null values
        if (fieldMap.has(sanitizedName)) {
          const field = fieldMap.get(sanitizedName)!;
          field.isNullable = true;
        } else {
          fieldMap.set(sanitizedName, {
            name: sanitizedName,
            type: 'String',
            isArray: false,
            isNullable: true,
            occurrences: 1,
          });
        }
        continue;
      }

      const isArray = Array.isArray(value);
      const valueToAnalyze = isArray && value.length > 0 ? value[0] : value;
      
      // Determine the GraphQL type
      let type: string;
      let shouldFlatten = false;

      if (isArray && value.length === 0) {
        type = 'JSON'; // Unknown array type
      } else if (typeof valueToAnalyze === 'object' && 
                 !(valueToAnalyze instanceof Date) && 
                 valueToAnalyze.constructor?.name !== 'ObjectId') {
        // Check if it's a simple object with few fields (can be flattened)
        const objectKeys = Object.keys(valueToAnalyze);
        if (!isArray && objectKeys.length > 0 && objectKeys.length <= 5 && !prefix) {
          shouldFlatten = true;
          // Flatten this object into the parent
          this.analyzeDocument(valueToAnalyze, fieldMap, fieldName, totalDocs);
          continue;
        } else {
          type = 'JSON'; // Complex nested object
        }
      } else {
        type = TypeMapper.mapMongoDBType(valueToAnalyze);
      }

      if (!fieldMap.has(sanitizedName)) {
        fieldMap.set(sanitizedName, {
          name: sanitizedName,
          type,
          isArray,
          isNullable: false,
          occurrences: 1,
        });
      } else {
        // Field exists, update it
        const existingField = fieldMap.get(sanitizedName)!;
        existingField.occurrences++;

        // Handle type conflicts
        if (existingField.type !== type) {
          // If types conflict, use the more general type
          if (type === 'JSON' || existingField.type === 'JSON') {
            existingField.type = 'JSON';
          } else if (type === 'String' || existingField.type === 'String') {
            existingField.type = 'String';
          } else if ((type === 'Float' && existingField.type === 'Int') ||
                     (type === 'Int' && existingField.type === 'Float')) {
            existingField.type = 'Float'; // Use Float for numeric conflicts
          } else {
            existingField.type = 'JSON'; // Fallback to JSON for other conflicts
          }
        }

        // Handle array inconsistency
        if (isArray !== existingField.isArray) {
          existingField.isArray = true;
          existingField.isNullable = true;
        }
      }
    }
  }

  async getData(entityName: string, args?: any): Promise<any[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const collectionName = this.findCollectionName(entityName);
    const collection = this.db.collection(collectionName);

    const filter = args?.filter || {};
    const limit = args?.limit || 100;
    const skip = args?.skip || args?.offset || 0;

    const documents = await collection
      .find(filter)
      .limit(limit)
      .skip(skip)
      .toArray();

    return documents.map(doc => this.convertDocument(doc));
  }

  async getById(entityName: string, id: string): Promise<any> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    const collectionName = this.findCollectionName(entityName);
    const collection = this.db.collection(collectionName);

    let objectId: ObjectId;
    try {
      objectId = new ObjectId(id);
    } catch {
      // If not a valid ObjectId, try as string
      const doc = await collection.findOne({ _id: id } as any);
      return doc ? this.convertDocument(doc) : null;
    }

    const doc = await collection.findOne({ _id: objectId });
    return doc ? this.convertDocument(doc) : null;
  }

  private convertDocument(doc: any): any {
    if (!doc) return doc;

    const converted = { ...doc };
    
    // Convert ObjectId to string
    if (converted._id) {
      converted._id = converted._id.toString();
    }

    // Convert nested ObjectIds and Dates
    for (const [key, value] of Object.entries(converted)) {
      if (value && typeof value === 'object') {
        if (value.constructor?.name === 'ObjectId') {
          converted[key] = value.toString();
        } else if (value instanceof Date) {
          converted[key] = value.toISOString();
        } else if (Array.isArray(value)) {
          converted[key] = value.map(item => {
            if (item && typeof item === 'object' && item.constructor?.name === 'ObjectId') {
              return item.toString();
            }
            if (item instanceof Date) {
              return item.toISOString();
            }
            return item;
          });
        }
      }
    }

    return converted;
  }

  private findCollectionName(entityName: string): string {
    // Convert PascalCase entity name back to collection name (pluralized)
    // If entityName is "Movie", collection should be "movies"
    return TypeMapper.pluralize(entityName.toLowerCase());
  }
}
