import { BaseConnector } from './base-connector';
import { MongoDBConnector } from './mongodb-connector';
import { PostgresConnector } from './postgres-connector';
import { MySQLConnector } from './mysql-connector';
import { RESTConnector } from './rest-connector';
import { DataSourceConfig } from '../types';

export class ConnectorFactory {
  static create(config: DataSourceConfig): BaseConnector {
    switch (config.type) {
      case 'mongodb':
        return new MongoDBConnector(config);
      
      case 'postgres':
        return new PostgresConnector(config);
      
      case 'mysql':
        return new MySQLConnector(config);
      
      case 'rest':
        return new RESTConnector(config);
      
      default:
        throw new Error(`Unsupported data source type: ${(config as any).type}`);
    }
  }
}

