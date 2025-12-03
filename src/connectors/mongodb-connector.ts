import { MongoClient, Db, Collection, ObjectId } from 'mongodb';
import { BaseConnector } from './base-connector';
import {
  EntitySchema,
  FieldDefinition,
  MongoDBConfig,
  SmartScanConfig,
  DEFAULT_SMART_SCAN_CONFIG,
  TypeHistogramEntry,
} from '../types';
import { TypeMapper, collectionNameToTypeName } from '../utils/type-mapper';
import { Logger } from '../utils/logger';
import { ConfigLoader } from '../core/config-loader';

export class MongoDBConnector extends BaseConnector {
  private client: MongoClient | null = null;
  private db: Db | null = null;
  protected config: MongoDBConfig;
  private entityToCollectionMap: Map<string, string> = new Map(); // Maps entity name to collection name
  private entitySchemas: Map<string, EntitySchema> = new Map(); // Maps entity name to its schema (for array normalization)

  // SMART_SCAN configuration and caches
  private smartScanConfig: SmartScanConfig;
  private arrayTypeCache: Map<string, string> = new Map(); // Caches array element types across documents
  private nestedStructureCache: Map<string, boolean> = new Map(); // Caches analyzed nested structures
  private fieldFrequency: Map<string, number> = new Map(); // Tracks field occurrence frequency
  private discoveredArrayElementFields: Map<string, Set<string>> = new Map(); // Tracks fields in array elements
  private typeNameMapping: Map<string, string> = new Map(); // Maps original type names to consolidated names

  constructor(config: MongoDBConfig) {
    super(config);
    this.config = config;
    // Load SMART_SCAN configuration from environment variables
    this.smartScanConfig = ConfigLoader.loadSmartScanConfig();
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

        // Store entity schema for data normalization during queries
        this.entitySchemas.set(result.mainEntity.name, result.mainEntity);
        for (const nestedType of result.nestedTypes) {
          this.entitySchemas.set(nestedType.name, nestedType);
        }

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
   * Progressive sampling algorithm using escalating sample sizes
   * Uses configurable sample sizes from SmartScanConfig for better field discovery
   */
  private async dynamicSampling(
    collection: Collection,
    collectionName: string
  ): Promise<{
    documents: any[];
    totalSampled: number;
    uniqueFieldCount: number;
    samplingTimeMs: number;
  }> {
    const startTime = Date.now();
    const config = this.smartScanConfig;
    const sampleSizes = config.sampleSizes; // e.g., [500, 1000, 2000, 5000]
    const earlyTermination = config.earlyTerminationThreshold;

    // Get total document count for sampling decisions
    const totalDocCount = await collection.countDocuments();
    Logger.info(`Collection ${collectionName} has ${totalDocCount} total documents`);

    if (totalDocCount === 0) {
      return { documents: [], totalSampled: 0, uniqueFieldCount: 0, samplingTimeMs: 0 };
    }

    const allDocuments: any[] = [];
    const seenFieldPaths = new Set<string>();
    const seenDocIds = new Set<string>(); // For deduplication
    let totalSampled = 0;
    let consecutiveEmptyIterations = 0;

    Logger.info(`Starting progressive sampling for ${collectionName} with sizes: [${sampleSizes.join(', ')}]`);

    for (let i = 0; i < sampleSizes.length; i++) {
      const targetSize = sampleSizes[i];
      const iterationStart = Date.now();

      // Calculate how many new documents we need (accounting for already sampled)
      const targetNewDocs = Math.min(targetSize, totalDocCount) - totalSampled;
      if (targetNewDocs <= 0) {
        continue;
      }

      // Over-sample slightly to account for potential duplicates
      const oversampleSize = Math.min(Math.ceil(targetNewDocs * 1.2), totalDocCount);

      // Perform random sampling
      const batch = await collection.aggregate([
        { $sample: { size: oversampleSize } }
      ]).toArray();

      if (batch.length === 0) {
        break;
      }

      // Deduplicate and track new documents
      const newDocs: any[] = [];
      for (const doc of batch) {
        const docId = doc._id?.toString();
        if (docId && !seenDocIds.has(docId)) {
          seenDocIds.add(docId);
          newDocs.push(doc);
        }
      }

      if (newDocs.length === 0) {
        Logger.debug(`Iteration ${i + 1}: no new unique documents found`);
        continue;
      }

      // Track fields before processing
      const fieldCountBefore = seenFieldPaths.size;
      const arrayFieldCountBefore = this.getTotalArrayElementFields();

      // Extract field paths and array element fields
      for (const doc of newDocs) {
        this.extractFieldPaths(doc, '', seenFieldPaths, 0);
        this.extractArrayElementFields(doc, '', 0);

        // Track field frequencies if enabled
        if (config.enableFieldTracking) {
          this.trackFieldFrequencies(doc, '');
        }
      }

      allDocuments.push(...newDocs);
      totalSampled += newDocs.length;

      const newFieldsFound = seenFieldPaths.size - fieldCountBefore;
      const newArrayFields = this.getTotalArrayElementFields() - arrayFieldCountBefore;
      const totalNewDiscoveries = newFieldsFound + newArrayFields;
      const iterationTime = Date.now() - iterationStart;

      Logger.debug(
        `Iteration ${i + 1}: sampled ${newDocs.length} new docs in ${iterationTime}ms, ` +
        `found ${newFieldsFound} new fields + ${newArrayFields} new array fields ` +
        `(total: ${seenFieldPaths.size} unique fields)`
      );

      // Check for convergence
      if (totalNewDiscoveries === 0) {
        consecutiveEmptyIterations++;
        Logger.debug(`No new discoveries. Stability counter: ${consecutiveEmptyIterations}/${earlyTermination}`);

        if (consecutiveEmptyIterations >= earlyTermination) {
          Logger.info(`Schema stabilized after ${i + 1} iterations (${earlyTermination} consecutive with no new fields)`);
          break;
        }
      } else {
        consecutiveEmptyIterations = 0;
      }

      // Early exit if we've sampled most of the collection
      if (totalSampled >= totalDocCount * 0.8) {
        Logger.info(`Sampled 80% of collection (${totalSampled}/${totalDocCount}), stopping early`);
        break;
      }
    }

    const samplingTimeMs = Date.now() - startTime;
    Logger.info(`Progressive sampling complete: ${totalSampled} documents, ${seenFieldPaths.size} unique fields in ${samplingTimeMs}ms`);

    return {
      documents: allDocuments,
      totalSampled,
      uniqueFieldCount: seenFieldPaths.size,
      samplingTimeMs,
    };
  }

  /**
   * Helper to count total array element fields across all tracked arrays
   */
  private getTotalArrayElementFields(): number {
    let total = 0;
    for (const fields of this.discoveredArrayElementFields.values()) {
      total += fields.size;
    }
    return total;
  }

  /**
   * Extracts fields found within array elements for polymorphic array detection
   * Tracks fields separately from top-level extraction
   */
  private extractArrayElementFields(
    obj: any,
    parentPath: string,
    depth: number
  ): void {
    if (!obj || typeof obj !== 'object' || depth >= this.smartScanConfig.maxDepth) {
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      if (key === '__v' || key === '_id') continue;
      if (this.isNumericKey(key)) continue;

      const currentPath = parentPath ? `${parentPath}.${key}` : key;

      if (Array.isArray(value)) {
        // Initialize tracking for this array path if not exists
        if (!this.discoveredArrayElementFields.has(currentPath)) {
          this.discoveredArrayElementFields.set(currentPath, new Set());
        }

        const elementFields = this.discoveredArrayElementFields.get(currentPath)!;

        // Analyze multiple elements to discover ALL possible fields (polymorphic arrays)
        const elementsToCheck = Math.min(value.length, this.smartScanConfig.maxArrayElements);
        for (let i = 0; i < elementsToCheck; i++) {
          const element = value[i];
          if (element && typeof element === 'object' && !Array.isArray(element) && !(element instanceof Date)) {
            // Collect all field names from this array element
            Object.keys(element).forEach(field => {
              if (field !== '__v' && field !== '_id' && !this.isNumericKey(field)) {
                elementFields.add(field);
              }
            });

            // Recursively check nested structures within array elements
            this.extractArrayElementFields(element, currentPath, depth + 1);
          }
        }
      } else if (value && typeof value === 'object' && !(value instanceof Date)) {
        // Recursively check nested objects
        this.extractArrayElementFields(value, currentPath, depth + 1);
      }
    }
  }

  /**
   * Tracks field occurrence frequency for nullability inference and rare field detection
   */
  private trackFieldFrequencies(obj: any, prefix: string): void {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      if (key === '__v' || key === '_id') continue;

      const fieldPath = prefix ? `${prefix}.${key}` : key;
      const currentCount = this.fieldFrequency.get(fieldPath) || 0;
      this.fieldFrequency.set(fieldPath, currentCount + 1);

      // Recursively track nested fields
      if (value && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date)) {
        this.trackFieldFrequencies(value, fieldPath);
      }
    }
  }

  /**
   * Reports fields that appear in less than 5% of documents (rare fields)
   */
  private reportRareFields(totalDocuments: number): void {
    const rareThreshold = totalDocuments * 0.05;
    const rareFields: Array<{ field: string; count: number; percentage: number }> = [];

    for (const [field, count] of this.fieldFrequency.entries()) {
      if (count < rareThreshold) {
        rareFields.push({
          field,
          count,
          percentage: (count / totalDocuments) * 100,
        });
      }
    }

    if (rareFields.length > 0) {
      Logger.info(`Found ${rareFields.length} rare fields (< 5% occurrence):`);
      rareFields
        .sort((a, b) => a.count - b.count)
        .slice(0, 10) // Show top 10 rarest
        .forEach(({ field, count, percentage }) => {
          Logger.debug(`  • ${field}: ${count}/${totalDocuments} docs (${percentage.toFixed(1)}%)`);
        });
      if (rareFields.length > 10) {
        Logger.debug(`  ... and ${rareFields.length - 10} more rare fields`);
      }
    }
  }

  /**
   * Helper to check if a key is a numeric array index
   */
  private isNumericKey(key: string): boolean {
    return /^\d+$/.test(key);
  }

  /**
   * Checks if an object is "array-like" (stored as object with numeric keys)
   * This handles MongoDB documents where arrays are sometimes stored as objects:
   * {"0": {...}, "1": {...}, "2": {...}} instead of [{...}, {...}, {...}]
   *
   * @returns true if more than half of the object's keys are numeric
   */
  private isArrayLikeObject(obj: any): boolean {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
      return false;
    }

    const keys = Object.keys(obj);
    if (keys.length === 0) {
      return false;
    }

    const numericKeys = keys.filter(key => this.isNumericKey(key));
    // If more than half the keys are numeric, treat as array-like
    return numericKeys.length > keys.length / 2;
  }

  /**
   * Extracts array elements from an array-like object
   * Converts {"0": {...}, "1": {...}} to [{...}, {...}]
   */
  private extractArrayFromArrayLikeObject(obj: any): any[] {
    if (!this.isArrayLikeObject(obj)) {
      return [];
    }

    const keys = Object.keys(obj)
      .filter(key => this.isNumericKey(key))
      .sort((a, b) => parseInt(a) - parseInt(b));

    return keys.map(key => obj[key]);
  }
  
  /**
   * Recursively extracts all field paths from a document
   * Tracks nested field paths using dot notation
   * Now includes depth limit from SmartScanConfig
   */
  private extractFieldPaths(
    obj: any,
    prefix: string,
    fieldPaths: Set<string>,
    depth: number = 0
  ): void {
    if (obj === null || obj === undefined) {
      return;
    }

    if (typeof obj !== 'object') {
      return;
    }

    // Check depth limit
    if (depth >= this.smartScanConfig.maxDepth) {
      Logger.debug(`Max depth ${this.smartScanConfig.maxDepth} reached at: ${prefix}`);
      return;
    }

    // Handle arrays
    if (Array.isArray(obj)) {
      if (obj.length > 0) {
        // Sample multiple elements (up to maxArrayElements) to detect array item types
        const fieldPath = prefix || 'array';
        fieldPaths.add(`${fieldPath}[]`);

        const elementsToSample = Math.min(obj.length, this.smartScanConfig.maxArrayElements);
        for (let i = 0; i < elementsToSample; i++) {
          if (obj[i] !== null && obj[i] !== undefined) {
            this.extractFieldPaths(obj[i], `${fieldPath}[]`, fieldPaths, depth + 1);
          }
        }
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
        this.extractFieldPaths(value, fieldPath, fieldPaths, depth + 1);
      }
    }
  }

  private async introspectCollection(
    collection: Collection,
    collectionName: string
  ): Promise<{ mainEntity: EntitySchema; nestedTypes: EntitySchema[] }> {
    // Use smartScanConfig for feature flags
    const smartScan = this.smartScanConfig.enabled;

    let documents: any[];
    let totalSampled: number;
    let samplingTimeMs = 0;

    if (smartScan) {
      Logger.info(`Smart scan enabled for ${collectionName}...`);
      const samplingResult = await this.dynamicSampling(collection, collectionName);
      documents = samplingResult.documents;
      totalSampled = samplingResult.totalSampled;
      samplingTimeMs = samplingResult.samplingTimeMs;
      Logger.info(`Smart scan completed: sampled ${totalSampled} documents, found ${samplingResult.uniqueFieldCount} unique fields`);

      // Report rare fields if field tracking is enabled
      if (this.smartScanConfig.enableFieldTracking && totalSampled > 0) {
        this.reportRareFields(totalSampled);
      }
    } else {
      // Default fixed sampling (backward compatible)
      const sampleSize = 500;
      documents = await collection.find().limit(sampleSize).toArray();
      totalSampled = documents.length;
      Logger.info(`Fixed sampling: analyzing ${documents.length} documents from ${collectionName}...`);
    }

    if (documents.length === 0) {
      Logger.warning(`Collection ${collectionName} is empty, creating minimal schema`);
      return {
        mainEntity: {
          name: collectionNameToTypeName(collectionName),
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

    // Use singular form for the type name (using improved generateNestedTypeName for consistency)
    const typeName = collectionNameToTypeName(collectionName);

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

    // **Sparse field sampling**: Look for array fields that might be mostly empty
    // This catches ultra-sparse fields like "images" that appear in <1% of documents
    if (smartScan) {
      await this.sampleSparseArrayFields(collection, fieldMap, typeName, nestedTypes, documents.length);
    }

    Logger.debug(`Field map after analysis has ${fieldMap.size} fields`);
    Logger.debug(`Discovered ${nestedTypes.size} nested types`);

    // Type consolidation: merge identical nested types if enabled
    if (smartScan && this.smartScanConfig.consolidateTypes && nestedTypes.size > 1) {
      this.consolidateNestedTypes(nestedTypes);

      // After consolidation, update all field type references to use consolidated names
      this.applyTypeNameMappings(fieldMap, nestedTypes);
    }

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

    // Adaptive verification mode
    if (smartScan && samplingTimeMs > 0) {
      await this.maybeVerifyFieldDiscovery(collection, collectionName, samplingTimeMs);
    }

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
   * Consolidates identical nested types into shared types
   * Uses field signature matching based on consolidation mode (strict/loose)
   */
  private consolidateNestedTypes(nestedTypes: Map<string, EntitySchema>): void {
    const config = this.smartScanConfig;
    if (config.typeConsolidation === 'none') {
      return;
    }

    Logger.debug(`Consolidating ${nestedTypes.size} nested types (mode: ${config.typeConsolidation})`);

    // Group types by their field signature
    const signatureGroups = new Map<string, string[]>();

    for (const [typeName, schema] of nestedTypes.entries()) {
      const signature = TypeMapper.generateFieldSignature(
        schema.fields.map(f => ({ name: f.name, type: f.type })),
        config.typeConsolidation as 'strict' | 'loose'
      );

      if (!signatureGroups.has(signature)) {
        signatureGroups.set(signature, []);
      }
      signatureGroups.get(signature)!.push(typeName);
    }

    // Find groups with multiple types (candidates for consolidation)
    let consolidatedCount = 0;

    for (const [signature, typeNames] of signatureGroups.entries()) {
      if (typeNames.length < 2) {
        continue;
      }

      // Check if types share a common suffix (required for consolidation)
      const commonSuffix = TypeMapper.extractCommonTypeSuffix(typeNames);
      if (!commonSuffix) {
        Logger.debug(`Skipping consolidation for [${typeNames.join(', ')}] - no common suffix`);
        continue;
      }

      // Generate shared type name
      const fieldNames = new Set<string>();
      const firstSchema = nestedTypes.get(typeNames[0])!;
      firstSchema.fields.forEach(f => fieldNames.add(f.name));

      const sharedTypeName = TypeMapper.generateSharedTypeName(typeNames, fieldNames);

      Logger.info(`Consolidating [${typeNames.join(', ')}] -> ${sharedTypeName}`);

      // Create the shared type with merged fields from all original types
      const mergedFields = new Map<string, FieldDefinition>();
      for (const typeName of typeNames) {
        const schema = nestedTypes.get(typeName)!;
        for (const field of schema.fields) {
          if (!mergedFields.has(field.name)) {
            mergedFields.set(field.name, { ...field });
          }
        }
      }

      const sharedSchema: EntitySchema = {
        name: sharedTypeName,
        fields: Array.from(mergedFields.values()),
        description: `Consolidated from: ${typeNames.join(', ')}`,
        isNested: true,
      };

      // Remove original types and add shared type
      for (const typeName of typeNames) {
        nestedTypes.delete(typeName);
        this.typeNameMapping.set(typeName, sharedTypeName);
      }

      nestedTypes.set(sharedTypeName, sharedSchema);
      consolidatedCount++;
    }

    if (consolidatedCount > 0) {
      Logger.info(`Type consolidation: merged ${consolidatedCount} groups, ${nestedTypes.size} types remaining`);
    }
  }

  /**
   * Applies type name mappings to update field references after consolidation
   * Updates both the main entity fields and all nested type fields
   */
  private applyTypeNameMappings(
    fieldMap: Map<string, FieldDefinition & { occurrences: number }>,
    nestedTypes: Map<string, EntitySchema>
  ): void {
    if (this.typeNameMapping.size === 0) {
      return;
    }

    Logger.debug(`Applying ${this.typeNameMapping.size} type name mappings`);

    // Update main entity field types
    for (const field of fieldMap.values()) {
      if (this.typeNameMapping.has(field.type)) {
        const newType = this.typeNameMapping.get(field.type)!;
        Logger.debug(`Updating field ${field.name}: ${field.type} -> ${newType}`);
        field.type = newType;
      }
    }

    // Update nested type field types
    for (const schema of nestedTypes.values()) {
      for (const field of schema.fields) {
        if (this.typeNameMapping.has(field.type)) {
          const newType = this.typeNameMapping.get(field.type)!;
          Logger.debug(`Updating nested field ${schema.name}.${field.name}: ${field.type} -> ${newType}`);
          field.type = newType;
        }
      }
    }
  }

  /**
   * Adaptive verification mode - runs verification if overhead is acceptable
   */
  private async maybeVerifyFieldDiscovery(
    collection: Collection,
    collectionName: string,
    samplingTimeMs: number
  ): Promise<void> {
    const verifyMode = this.smartScanConfig.verificationMode;

    // Skip if verification is explicitly disabled
    if (verifyMode === 'false') {
      return;
    }

    // For 'auto' mode, check if verification would be within 10% overhead
    const MAX_OVERHEAD_PERCENT = 10;
    const verificationStart = Date.now();

    // Quick sample for verification
    const verificationSample = await collection.aggregate([
      { $sample: { size: 100 } }
    ]).toArray();

    const verificationTimeMs = Date.now() - verificationStart;

    // Check overhead for auto mode
    if (verifyMode === 'auto') {
      const overheadPercent = (verificationTimeMs / samplingTimeMs) * 100;
      if (overheadPercent > MAX_OVERHEAD_PERCENT) {
        Logger.debug(
          `Verification skipped: ${overheadPercent.toFixed(1)}% overhead exceeds ${MAX_OVERHEAD_PERCENT}% limit`
        );
        return;
      }
    }

    // Perform verification
    const verificationFields = new Set<string>();
    for (const doc of verificationSample) {
      this.extractFieldPaths(doc, '', verificationFields, 0);
    }

    // Compare with discovered fields (check if we have discoveredArrayElementFields populated)
    const allDiscoveredFields = new Set<string>();

    // Add array element fields as well
    for (const [arrayPath, fields] of this.discoveredArrayElementFields.entries()) {
      allDiscoveredFields.add(arrayPath);
      for (const field of fields) {
        allDiscoveredFields.add(`${arrayPath}.${field}`);
      }
    }

    // Check for missed fields (simplified - just log a warning)
    const missedFields: string[] = [];
    for (const field of verificationFields) {
      // Only check top-level fields for now
      if (!field.includes('[]') && !allDiscoveredFields.has(field)) {
        // This is a simplification - actual implementation would need more sophisticated tracking
        missedFields.push(field);
      }
    }

    if (missedFields.length > 0) {
      Logger.warning(
        `Verification: found ${missedFields.length} potentially undiscovered fields in ${collectionName}`
      );
      Logger.debug(`Potentially missed fields: ${missedFields.slice(0, 5).join(', ')}${missedFields.length > 5 ? '...' : ''}`);
    } else {
      Logger.debug(`Verification passed for ${collectionName} (${verificationTimeMs}ms)`);
    }
  }

  /**
   * Samples documents with populated array fields to discover nested types for sparse fields
   * This catches fields like "images" that appear in <1% of documents
   */
  private async sampleSparseArrayFields(
    collection: Collection,
    fieldMap: Map<string, FieldDefinition & { occurrences: number }>,
    typeName: string,
    nestedTypes: Map<string, EntitySchema>,
    totalDocs: number
  ): Promise<void> {
    // Find array fields that are currently typed as JSON
    const sparseArrayFields: string[] = [];
    for (const [fieldName, field] of fieldMap.entries()) {
      if (field.isArray && field.type === 'JSON' && fieldName !== '_id') {
        sparseArrayFields.push(fieldName);
      }
    }

    if (sparseArrayFields.length === 0) {
      return;
    }

    Logger.debug(`Found ${sparseArrayFields.length} potential sparse array fields: ${sparseArrayFields.join(', ')}`);

    // For each sparse field, try to find documents where it's populated
    for (const fieldName of sparseArrayFields) {
      try {
        // Query for documents where this field exists and is a non-empty array
        const sample = await collection.findOne({
          [fieldName]: { $exists: true, $ne: [], $type: 'array' }
        });

        if (sample && sample[fieldName] && Array.isArray(sample[fieldName]) && sample[fieldName].length > 0) {
          const firstElement = sample[fieldName][0];

          // Check if it's an object (potential nested type)
          if (firstElement && typeof firstElement === 'object' && !Array.isArray(firstElement) &&
              !(firstElement instanceof Date) && firstElement.constructor?.name !== 'ObjectId') {

            const nestedTypeName = TypeMapper.generateNestedTypeName(typeName, fieldName);
            Logger.info(`✨ Discovered sparse field "${fieldName}" with nested type ${nestedTypeName}`);

            // Create nested type
            const nestedFieldMap = new Map<string, FieldDefinition & { occurrences: number }>();
            this.analyzeDocumentWithNesting(
              firstElement,
              nestedFieldMap,
              1,
              nestedTypeName,
              fieldName,
              new Map() // Don't need recursive nesting for this
            );

            // Add to nested types
            const nestedFields = Array.from(nestedFieldMap.values()).map(({ occurrences, ...field }) => {
              field.isNullable = true; // Nested fields are nullable
              return field;
            });

            nestedTypes.set(nestedTypeName, {
              name: nestedTypeName,
              fields: nestedFields,
              description: `Nested type from ${typeName}.${fieldName}`,
              isNested: true,
            });

            // Update the field to use the nested type instead of JSON
            const existingField = fieldMap.get(fieldName);
            if (existingField) {
              existingField.type = nestedTypeName;
            }
          }
        }
      } catch (error) {
        Logger.debug(`Failed to sample sparse field ${fieldName}: ${error}`);
      }
    }
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

      // Skip numeric keys - these are array indices stored as object keys
      // This handles MongoDB documents where arrays are stored as objects: {"0": {...}, "1": {...}}
      if (this.isNumericKey(key)) {
        Logger.debug(`Skipping numeric key '${key}' in ${parentTypeName} (array index)`);
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

      // Check if this is an array-like object (stored as {"0": {...}, "1": {...}})
      // Convert to actual array for consistent handling
      let actualValue: any = value;
      let isArray = Array.isArray(value);

      if (!isArray && this.isArrayLikeObject(value)) {
        // Convert array-like object to array
        actualValue = this.extractArrayFromArrayLikeObject(value);
        isArray = true;
        Logger.debug(`Converted array-like object to array for field '${key}' in ${parentTypeName}`);
      }

      const valueToAnalyze = isArray && (actualValue as any[]).length > 0 ? (actualValue as any[])[0] : actualValue;

      // Determine the GraphQL type
      let type: string;
      let shouldCreateNestedType = false;

      if (isArray && actualValue.length === 0) {
        type = 'JSON'; // Unknown array type
      } else if (this.isBinaryType(valueToAnalyze)) {
        // Binary/Buffer types should be treated as JSON or String, not expanded
        type = 'JSON';
      } else if (
        valueToAnalyze !== null &&
        typeof valueToAnalyze === 'object' &&
        !(valueToAnalyze instanceof Date) &&
        valueToAnalyze.constructor?.name !== 'ObjectId'
      ) {
        // This is an object - create a nested type for it
        const objectKeys = Object.keys(valueToAnalyze);
        
        if (objectKeys.length > 0 && !this.isBinaryType(valueToAnalyze)) {
          // Create a nested type (but not for binary buffers)
          const nestedTypeName = TypeMapper.generateNestedTypeName(parentTypeName, key);
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
          const primitiveTypes = new Set(['String', 'Int', 'Float', 'Boolean', 'ID', 'JSON']);
          const existingIsPrimitive = primitiveTypes.has(existingField.type);
          const newIsPrimitive = primitiveTypes.has(type);

          // Priority: Nested types > Primitives > JSON
          // Always prefer nested/structured types over JSON
          if (shouldCreateNestedType) {
            // Upgrade to nested type (e.g., JSON -> KbaseindexImages)
            existingField.type = type;
          } else if (!existingIsPrimitive && newIsPrimitive) {
            // Keep existing nested type, don't downgrade (e.g., keep KbaseindexImages, ignore JSON)
            // Do nothing - keep existing type
          } else if (existingIsPrimitive && !newIsPrimitive) {
            // Upgrade from primitive to nested type (e.g., JSON -> KbaseindexImages)
            existingField.type = type;
          } else if (type === 'JSON' && existingField.type === 'JSON') {
            // Both JSON, keep JSON
            existingField.type = 'JSON';
          } else if (type === 'String' || existingField.type === 'String') {
            // String is more general, use it for conflicts between primitives
            existingField.type = 'String';
          } else if ((type === 'Float' && existingField.type === 'Int') ||
                     (type === 'Int' && existingField.type === 'Float')) {
            // Int/Float conflict -> use Float
            existingField.type = 'Float';
          } else {
            // Fallback for other conflicts
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

    return documents.map(doc => this.convertDocument(doc, entityName));
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
      return doc ? this.convertDocument(doc, entityName) : null;
    }

    const doc = await collection.findOne({ _id: objectId });
    return doc ? this.convertDocument(doc, entityName) : null;
  }

  private convertDocument(doc: any, entityName: string): any {
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

    // Normalize array fields based on schema (main entity)
    // This handles cases where MongoDB has inconsistent types (e.g., some docs have string, others have array)
    const entitySchema = this.entitySchemas.get(entityName);
    if (entitySchema) {
      this.normalizeArrayFields(converted, entitySchema);
    }

    return converted;
  }

  /**
   * Recursively normalizes array fields in a document based on schema
   * Ensures array fields are always arrays (not null, undefined, or single values)
   */
  private normalizeArrayFields(obj: any, schema: EntitySchema): void {
    if (!obj || typeof obj !== 'object') return;

    for (const field of schema.fields) {
      const value = obj[field.name];

      // Handle array fields
      if (field.isArray) {
        if (value === null || value === undefined) {
          // Return empty array for null/undefined array fields
          obj[field.name] = [];
        } else if (!Array.isArray(value)) {
          // Wrap single values in an array
          obj[field.name] = [value];
        }
      }

      // Recursively process nested objects
      // Check if this field's type is a nested type we have a schema for
      const nestedSchema = this.entitySchemas.get(field.type);
      if (nestedSchema && value !== null && value !== undefined) {
        if (Array.isArray(obj[field.name])) {
          // Normalize each element in the array
          for (const item of obj[field.name]) {
            if (item && typeof item === 'object') {
              this.normalizeArrayFields(item, nestedSchema);
            }
          }
        } else if (typeof obj[field.name] === 'object') {
          // Normalize nested object
          this.normalizeArrayFields(obj[field.name], nestedSchema);
        }
      }
    }
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
