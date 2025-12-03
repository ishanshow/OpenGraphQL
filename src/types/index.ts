export type DataSourceType = 'mongodb' | 'postgres' | 'mysql' | 'rest';

export interface BaseDataSourceConfig {
  type: DataSourceType;
  name: string;
}

export interface MongoDBConfig extends BaseDataSourceConfig {
  type: 'mongodb';
  uri: string;
  database: string;
  collections?: string[]; // If not provided, will introspect all collections
}

export interface PostgresConfig extends BaseDataSourceConfig {
  type: 'postgres';
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  schema?: string;
  tables?: string[]; // If not provided, will introspect all tables
  ssl?: boolean; // Enable SSL connection, defaults to true
}

export interface MySQLConfig extends BaseDataSourceConfig {
  type: 'mysql';
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  tables?: string[]; // If not provided, will introspect all tables
}

export interface RESTConfig extends BaseDataSourceConfig {
  type: 'rest';
  baseUrl: string;
  endpoints: RESTEndpoint[];
  authToken?: string;
  headers?: Record<string, string>;
}

export interface RESTEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  queryName: string;
  responseSchema?: any; // Sample response for schema inference
}

export type DataSourceConfig = MongoDBConfig | PostgresConfig | MySQLConfig | RESTConfig;

export interface FieldDefinition {
  name: string;
  type: string;
  isArray: boolean;
  isNullable: boolean;
  isRequired?: boolean;
  description?: string;
  nestedType?: EntitySchema; // For nested object types
}

export interface EntitySchema {
  name: string;
  fields: FieldDefinition[];
  description?: string;
  isNested?: boolean; // True if this is a nested type (not a top-level entity)
  sourceName?: string; // Original collection/table name from the data source
}

export interface IntrospectionResult {
  entities: EntitySchema[];
  dataSourceName: string;
  dataSourceType: DataSourceType;
}

export interface GeneratedSchema {
  typeDefs: string;
  resolvers: any;
}

export interface ServerConfig {
  port: number;
  graphRef?: string;
  apolloKey?: string;
}

export interface GeneratorConfig {
  dataSources: DataSourceConfig[];
  server: ServerConfig;
  outputDir?: string;
}

/**
 * Type consolidation mode for SMART_SCAN
 * - 'strict': Match field names AND types for consolidation
 * - 'loose': Match field names only
 * - 'none': No consolidation (each nested type is unique)
 */
export type TypeConsolidationMode = 'strict' | 'loose' | 'none';

/**
 * Verification mode for SMART_SCAN
 * - 'true': Always run verification
 * - 'false': Never run verification
 * - 'auto': Run verification if overhead < 10%
 */
export type VerificationMode = 'true' | 'false' | 'auto';

/**
 * Configuration for SMART_SCAN mode in MongoDB introspection
 */
export interface SmartScanConfig {
  /** Enable SMART_SCAN mode (default: false) */
  enabled: boolean;

  /** Progressive sample sizes for field discovery (default: [500, 1000, 2000, 5000]) */
  sampleSizes: number[];

  /** Maximum nesting depth for field extraction (default: 6) */
  maxDepth: number;

  /** Maximum array elements to analyze per field (default: 50) */
  maxArrayElements: number;

  /** Consecutive iterations with 0 new fields before stopping (default: 2) */
  earlyTerminationThreshold: number;

  /** Type consolidation mode (default: 'strict') */
  typeConsolidation: TypeConsolidationMode;

  /** Verification mode (default: 'auto') */
  verificationMode: VerificationMode;

  /** Enable field frequency tracking (default: true) */
  enableFieldTracking: boolean;

  /** Consolidate identical nested types (default: true) */
  consolidateTypes: boolean;
}

/**
 * Default SMART_SCAN configuration
 */
export const DEFAULT_SMART_SCAN_CONFIG: SmartScanConfig = {
  enabled: false,
  sampleSizes: [500, 1000, 2000, 5000],
  maxDepth: 6,
  maxArrayElements: 50,
  earlyTerminationThreshold: 2,
  typeConsolidation: 'strict',
  verificationMode: 'auto',
  enableFieldTracking: true,
  consolidateTypes: true,
};

/**
 * Type histogram entry for tracking field type variations
 */
export interface TypeHistogramEntry {
  type: string;
  count: number;
  isNested: boolean;
  sampleValue?: any;
}

/**
 * Field statistics for tracking field discovery
 */
export interface FieldStats {
  fieldPath: string;
  occurrences: number;
  types: TypeHistogramEntry[];
}

