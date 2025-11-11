import { GeneratorConfig, DataSourceConfig } from '../types';
import { Logger } from '../utils/logger';
import * as dotenv from 'dotenv';

export class ConfigLoader {
  /**
   * Loads configuration from environment variables
   */
  static loadFromEnv(): GeneratorConfig {
    dotenv.config();

    const dataSources: DataSourceConfig[] = [];
    
    // Parse data source type from environment
    const dsType = process.env.DATASOURCE_TYPE;
    
    if (!dsType) {
      throw new Error('DATASOURCE_TYPE environment variable is required. Set it to: mongodb, postgres, mysql, or rest');
    }

    const dsName = process.env.DATASOURCE_NAME || dsType;

    switch (dsType) {
      case 'mongodb':
        dataSources.push({
          type: 'mongodb',
          name: dsName,
          uri: process.env.MONGODB_URI || '',
          database: process.env.MONGODB_DATABASE || '',
          ...(process.env.MONGODB_COLLECTIONS && {
            collections: process.env.MONGODB_COLLECTIONS.split(',').map(c => c.trim())
          })
        } as any);
        break;

      case 'postgres':
        dataSources.push({
          type: 'postgres',
          name: dsName,
          host: process.env.POSTGRES_HOST || 'localhost',
          port: parseInt(process.env.POSTGRES_PORT || '5432'),
          database: process.env.POSTGRES_DATABASE || '',
          user: process.env.POSTGRES_USER || '',
          password: process.env.POSTGRES_PASSWORD || '',
          schema: process.env.POSTGRES_SCHEMA || 'public',
          ssl: process.env.POSTGRES_SSL !== 'false',
          ...(process.env.POSTGRES_TABLES && {
            tables: process.env.POSTGRES_TABLES.split(',').map(t => t.trim())
          })
        } as any);
        break;

      case 'mysql':
        dataSources.push({
          type: 'mysql',
          name: dsName,
          host: process.env.MYSQL_HOST || 'localhost',
          port: parseInt(process.env.MYSQL_PORT || '3306'),
          database: process.env.MYSQL_DATABASE || '',
          user: process.env.MYSQL_USER || '',
          password: process.env.MYSQL_PASSWORD || '',
          ...(process.env.MYSQL_TABLES && {
            tables: process.env.MYSQL_TABLES.split(',').map(t => t.trim())
          })
        } as any);
        break;

      case 'rest':
        const endpoints = [];
        const endpointsJson = process.env.REST_ENDPOINTS;
        
        if (endpointsJson) {
          try {
            endpoints.push(...JSON.parse(endpointsJson));
          } catch (error) {
            throw new Error('REST_ENDPOINTS must be valid JSON array');
          }
        }

        dataSources.push({
          type: 'rest',
          name: dsName,
          baseUrl: process.env.REST_BASE_URL || '',
          ...(process.env.REST_AUTH_TOKEN && { authToken: process.env.REST_AUTH_TOKEN }),
          ...(process.env.REST_HEADERS && { headers: JSON.parse(process.env.REST_HEADERS) }),
          endpoints
        } as any);
        break;

      default:
        throw new Error(`Unsupported DATASOURCE_TYPE: ${dsType}. Must be: mongodb, postgres, mysql, or rest`);
    }

    const config: GeneratorConfig = {
      dataSources,
      server: {
        port: parseInt(process.env.SERVER_PORT || '4000'),
        ...(process.env.APOLLO_GRAPH_REF && { graphRef: process.env.APOLLO_GRAPH_REF }),
        ...(process.env.APOLLO_KEY && { apolloKey: process.env.APOLLO_KEY })
      },
      outputDir: process.env.OUTPUT_DIR || './generated'
    };

    return config;
  }


  /**
   * Validates the configuration
   */
  static validate(config: GeneratorConfig): void {
    if (!config.dataSources || config.dataSources.length === 0) {
      throw new Error('Configuration must include at least one data source');
    }

    for (const ds of config.dataSources) {
      this.validateDataSource(ds);
    }

    if (!config.server) {
      throw new Error('Configuration must include server settings');
    }

    if (!config.server.port || config.server.port < 1 || config.server.port > 65535) {
      throw new Error('Server port must be between 1 and 65535');
    }
  }

  /**
   * Validates a single data source configuration
   */
  private static validateDataSource(ds: DataSourceConfig): void {
    if (!ds.type) {
      throw new Error('Data source must have a type');
    }

    if (!ds.name) {
      throw new Error('Data source must have a name');
    }

    switch (ds.type) {
      case 'mongodb':
        if (!ds.uri || !ds.database) {
          throw new Error(`MongoDB data source ${ds.name} must have uri and database`);
        }
        break;

      case 'postgres':
      case 'mysql':
        if (!ds.host || !ds.database || !ds.user) {
          throw new Error(`SQL data source ${ds.name} must have host, database, and user`);
        }
        break;

      case 'rest':
        if (!ds.baseUrl || !ds.endpoints || ds.endpoints.length === 0) {
          throw new Error(`REST data source ${ds.name} must have baseUrl and endpoints`);
        }
        break;

      default:
        throw new Error(`Unsupported data source type: ${(ds as any).type}`);
    }
  }

}

