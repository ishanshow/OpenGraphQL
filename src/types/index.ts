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

