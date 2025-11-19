import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import { BaseConnector } from './base-connector';
import { EntitySchema, FieldDefinition, MongoDBConfig } from '../types';
import { TypeMapper } from '../utils/type-mapper';
import { Logger } from '../utils/logger';

export class MongoDBConnector extends BaseConnector {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  protected config: MongoDBConfig;
  private entityToCollectionMap: Map<string, string> = new Map(); // Maps entity name to collection name

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

        // Store the mapping from entity name to collection name
        this.entityToCollectionMap.set(result.mainEntity.name, collectionName);

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

  /**
   * Dynamic sampling algorithm that continues sampling until no new fields are discovered
   * Uses random sampling with replacement to ensure diverse document coverage
   */
  private async dynamicSampling(
    collection: Collection,
    collectionName: string
  ): Promise<{
    documents: any[];
    totalSampled: number;
    uniqueFieldCount: number;
  }> {
    const INITIAL_BATCH_SIZE = 50;
    const SUBSEQUENT_BATCH_SIZE = 100;
    const MAX_SAMPLES = 5000; // Safety limit to prevent excessive scanning
    const STABLE_ITERATIONS = 2; // Number of iterations with no new fields before stopping
    
    // Get total document count for random sampling
    const totalDocCount = await collection.countDocuments();
    Logger.info(`Collection ${collectionName} has ${totalDocCount} total documents`);
    
    if (totalDocCount === 0) {
      return { documents: [], totalSampled: 0, uniqueFieldCount: 0 };
    }
    
    const allDocuments: any[] = [];
    const seenFieldPaths = new Set<string>();
    let totalSampled = 0;
    let iterationsWithoutNewFields = 0;
    let iteration = 0;
    
    Logger.info(`Starting dynamic sampling for ${collectionName}...`);
    
    while (totalSampled < MAX_SAMPLES && iterationsWithoutNewFields < STABLE_ITERATIONS) {
      iteration++;
      const batchSize = iteration === 1 ? INITIAL_BATCH_SIZE : SUBSEQUENT_BATCH_SIZE;
      const remainingSamples = Math.min(batchSize, MAX_SAMPLES - totalSampled);
      
      if (remainingSamples <= 0) {
        break;
      }
      
      // Perform random sampling using aggregation pipeline
      const batch = await collection.aggregate([
        { $sample: { size: Math.min(remainingSamples, totalDocCount) } }
      ]).toArray();
      
      if (batch.length === 0) {
        break;
      }
      
      // Track fields before processing this batch
      const fieldCountBefore = seenFieldPaths.size;
      
      // Extract all field paths from the batch
      for (const doc of batch) {
        this.extractFieldPaths(doc, '', seenFieldPaths);
      }
      
      const newFieldsFound = seenFieldPaths.size - fieldCountBefore;
      allDocuments.push(...batch);
      totalSampled += batch.length;
      
      Logger.debug(
        `Iteration ${iteration}: sampled ${batch.length} docs, ` +
        `found ${newFieldsFound} new fields (total: ${seenFieldPaths.size} unique fields)`
      );
      
      if (newFieldsFound === 0) {
        iterationsWithoutNewFields++;
        Logger.debug(`No new fields found. Stability counter: ${iterationsWithoutNewFields}/${STABLE_ITERATIONS}`);
      } else {
        iterationsWithoutNewFields = 0; // Reset counter when new fields are found
      }
      
      // Early exit if we've sampled a significant portion of the collection
      if (totalSampled >= totalDocCount * 0.8) {
        Logger.info(`Sampled 80% of collection, stopping early`);
        break;
      }
    }
    
    if (totalSampled >= MAX_SAMPLES) {
      Logger.warning(`Reached maximum sample limit of ${MAX_SAMPLES} documents`);
    } else if (iterationsWithoutNewFields >= STABLE_ITERATIONS) {
      Logger.info(`Schema stabilized after ${iteration} iterations`);
    }
    
    return {
      documents: allDocuments,
      totalSampled,
      uniqueFieldCount: seenFieldPaths.size,
    };
  }
  
  /**
   * Recursively extracts all field paths from a document
   * Tracks nested field paths using dot notation
   */
  private extractFieldPaths(
    obj: any,
    prefix: string,
    fieldPaths: Set<string>
  ): void {
    if (obj === null || obj === undefined) {
      return;
    }
    
    if (typeof obj !== 'object') {
      return;
    }
    
    // Handle arrays
    if (Array.isArray(obj)) {
      if (obj.length > 0) {
        // Sample the first element to detect array item type
        const fieldPath = prefix || 'array';
        fieldPaths.add(`${fieldPath}[]`);
        this.extractFieldPaths(obj[0], `${fieldPath}[]`, fieldPaths);
      }
      return;
    }
    
    // Handle objects
    for (const [key, value] of Object.entries(obj)) {
      // Skip internal MongoDB fields
      if (key.startsWith('__') || key.startsWith('$')) {
        continue;
      }
      
      // Skip binary types
      if (this.isBinaryType(value)) {
        const fieldPath = prefix ? `${prefix}.${key}` : key;
        fieldPaths.add(fieldPath);
        continue;
      }
      
      const fieldPath = prefix ? `${prefix}.${key}` : key;
      fieldPaths.add(fieldPath);
      
      // Recursively process nested objects and arrays
      if (value !== null && typeof value === 'object') {
        this.extractFieldPaths(value, fieldPath, fieldPaths);
      }
    }
  }

  private async introspectCollection(
    collection: Collection,
    collectionName: string
  ): Promise<{ mainEntity: EntitySchema; nestedTypes: EntitySchema[] }> {
    // Check if smart_scan is enabled
    const smartScan = process.env.SMART_SCAN === 'true';
    
    let documents: any[];
    let totalSampled: number;
    
    if (smartScan) {
      Logger.info(`Smart scan enabled for ${collectionName}...`);
      const samplingResult = await this.dynamicSampling(collection, collectionName);
      documents = samplingResult.documents;
      totalSampled = samplingResult.totalSampled;
      Logger.info(`Smart scan completed: sampled ${totalSampled} documents, found ${samplingResult.uniqueFieldCount} unique fields`);
    } else {
      // Default fixed sampling
      const sampleSize = 500;
      documents = await collection.find().limit(sampleSize).toArray();
      totalSampled = documents.length;
      Logger.info(`Fixed sampling: analyzing ${documents.length} documents from ${collectionName}...`);
    }

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

    const scanMethod = smartScan ? 'smart scan' : 'fixed sampling';
    
    return {
      mainEntity: {
        name: typeName,
        fields,
        description: `Collection: ${collectionName} (sampled ${documents.length} documents, ${fields.length} unique fields)`,
        sourceName: collectionName, // Store original collection name for lookups
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
      } else if (this.isBinaryType(valueToAnalyze)) {
        // Binary/Buffer types should be treated as JSON or String, not expanded
        type = 'JSON';
      } else if (
        typeof valueToAnalyze === 'object' && 
        !(valueToAnalyze instanceof Date) && 
        valueToAnalyze.constructor?.name !== 'ObjectId'
      ) {
        // This is an object - create a nested type for it
        const objectKeys = Object.keys(valueToAnalyze);
        
        if (objectKeys.length > 0 && !this.isBinaryType(valueToAnalyze)) {
          // Create a nested type (but not for binary buffers)
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

  async getData(entityName: string, args?: any): Promise<any[]> {
    if (!this.db) {
      throw new Error('Database not connected');
    }

    // Use the mapping to get the actual collection name
    const collectionName = this.entityToCollectionMap.get(entityName);
    if (!collectionName) {
      Logger.error(`No collection mapping found for entity: ${entityName}`);
      throw new Error(`No collection mapping found for entity: ${entityName}`);
    }

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

    // Use the mapping to get the actual collection name
    const collectionName = this.entityToCollectionMap.get(entityName);
    if (!collectionName) {
      Logger.error(`No collection mapping found for entity: ${entityName}`);
      throw new Error(`No collection mapping found for entity: ${entityName}`);
    }

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

  /**
   * Detects if a value is a MongoDB Binary type or Buffer
   */
  private isBinaryType(value: any): boolean {
    if (!value || typeof value !== 'object') {
      return false;
    }

    // Check for MongoDB Binary type
    if (value._bsontype === 'Binary' || value.constructor?.name === 'Binary') {
      return true;
    }

    // Check for Node.js Buffer
    if (Buffer.isBuffer(value)) {
      return true;
    }

    // Check for objects that look like binary buffers (have numeric indices and length)
    // This catches cases where Binary.buffer is exposed
    if (typeof value.length === 'number' && value.length > 100) {
      const keys = Object.keys(value);
      const numericKeys = keys.filter(k => /^\d+$/.test(k));
      // If more than 50% of keys are numeric indices, it's likely a buffer
      if (numericKeys.length > keys.length * 0.5 && numericKeys.length > 50) {
        return true;
      }
    }

    return false;
  }
}
