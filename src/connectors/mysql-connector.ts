import mysql from 'mysql2/promise';
import { BaseConnector } from './base-connector';
import { EntitySchema, FieldDefinition, MySQLConfig } from '../types';
import { TypeMapper } from '../utils/type-mapper';
import { Logger } from '../utils/logger';

export class MySQLConnector extends BaseConnector {
  private connection: mysql.Connection | null = null;
  protected config: MySQLConfig;

  constructor(config: MySQLConfig) {
    super(config);
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      this.connection = await mysql.createConnection({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
      });

      Logger.success(`Connected to MySQL: ${this.config.database}`);
    } catch (error) {
      Logger.error('Failed to connect to MySQL', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.connection) {
      await this.connection.end();
      this.connection = null;
      Logger.info('Disconnected from MySQL');
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.connect();
      await this.disconnect();
      return true;
    } catch (error) {
      return false;
    }
  }

  async introspect(): Promise<EntitySchema[]> {
    if (!this.connection) {
      throw new Error('Database not connected');
    }

    const entities: EntitySchema[] = [];

    // Get tables to introspect
    const tablesToIntrospect = this.config.tables || await this.getAllTables();

    Logger.info(`Introspecting ${tablesToIntrospect.length} tables...`);

    for (const tableName of tablesToIntrospect) {
      try {
        const entitySchema = await this.introspectTable(tableName);
        entities.push(entitySchema);
        Logger.success(`Introspected table: ${tableName}`);
      } catch (error) {
        Logger.warning(`Failed to introspect table ${tableName}: ${error}`);
      }
    }

    return entities;
  }

  private async getAllTables(): Promise<string[]> {
    const [rows] = await this.connection!.execute(
      'SHOW TABLES'
    ) as any;

    const tableKey = `Tables_in_${this.config.database}`;
    return rows.map((row: any) => row[tableKey]);
  }

  private async introspectTable(tableName: string): Promise<EntitySchema> {
    const [columns] = await this.connection!.execute(
      `
      SELECT 
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT,
        COLUMN_TYPE,
        COLUMN_KEY,
        CHARACTER_MAXIMUM_LENGTH
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION
      `,
      [this.config.database, tableName]
    ) as any;

    const fields: FieldDefinition[] = columns.map((col: any) => {
      const type = TypeMapper.mapSQLType(col.DATA_TYPE);
      const isNullable = col.IS_NULLABLE === 'YES';
      const isRequired = !isNullable && col.COLUMN_DEFAULT === null;

      return {
        name: TypeMapper.sanitizeFieldName(col.COLUMN_NAME),
        type,
        isArray: false,
        isNullable,
        isRequired,
        description: `${col.COLUMN_TYPE}`,
      };
    });

    return {
      name: TypeMapper.toPascalCase(tableName),
      fields,
      description: `Table: ${tableName}`,
    };
  }

  async getData(entityName: string, args?: any): Promise<any[]> {
    if (!this.connection) {
      throw new Error('Database not connected');
    }

    const tableName = this.findTableName(entityName);
    const limit = args?.limit || 100;
    const offset = args?.offset || 0;

    // Build WHERE clause if filter is provided
    let whereClause = '';
    const values: any[] = [];

    if (args?.filter) {
      const conditions: string[] = [];
      for (const [key, value] of Object.entries(args.filter)) {
        conditions.push(`${key} = ?`);
        values.push(value);
      }
      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }
    }

    const query = `
      SELECT * FROM ${tableName}
      ${whereClause}
      LIMIT ? OFFSET ?
    `;

    values.push(limit, offset);

    const [rows] = await this.connection.execute(query, values);
    return rows as any[];
  }

  async getById(entityName: string, id: string): Promise<any> {
    if (!this.connection) {
      throw new Error('Database not connected');
    }

    const tableName = this.findTableName(entityName);
    
    // Try to find the primary key column
    const pkColumn = await this.getPrimaryKeyColumn(tableName);
    
    const query = `SELECT * FROM ${tableName} WHERE ${pkColumn} = ? LIMIT 1`;
    const [rows] = await this.connection.execute(query, [id]) as any;

    return rows[0] || null;
  }

  private async getPrimaryKeyColumn(tableName: string): Promise<string> {
    const [columns] = await this.connection!.execute(
      `
      SELECT COLUMN_NAME
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND COLUMN_KEY = 'PRI'
      LIMIT 1
      `,
      [this.config.database, tableName]
    ) as any;

    if (columns.length > 0) {
      return columns[0].COLUMN_NAME;
    }

    return 'id';
  }

  private findTableName(entityName: string): string {
    // Convert PascalCase entity name back to table name
    return entityName.toLowerCase();
  }
}

