import { EntitySchema, DataSourceConfig } from '../types';

export abstract class BaseConnector {
  protected config: DataSourceConfig;

  constructor(config: DataSourceConfig) {
    this.config = config;
  }

  /**
   * Connect to the data source
   */
  abstract connect(): Promise<void>;

  /**
   * Disconnect from the data source
   */
  abstract disconnect(): Promise<void>;

  /**
   * Introspect the data source and return entity schemas
   */
  abstract introspect(): Promise<EntitySchema[]>;

  /**
   * Test the connection
   */
  abstract testConnection(): Promise<boolean>;

  /**
   * Get data for a specific entity
   */
  abstract getData(entityName: string, args?: any): Promise<any[]>;

  /**
   * Get a single item by ID
   */
  abstract getById(entityName: string, id: string): Promise<any>;
}


