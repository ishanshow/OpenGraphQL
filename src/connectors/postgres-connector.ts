import { Pool, PoolClient } from 'pg';
import { BaseConnector } from './base-connector';
import { EntitySchema, FieldDefinition, PostgresConfig } from '../types';
import { TypeMapper } from '../utils/type-mapper';
import { Logger } from '../utils/logger';

export class PostgresConnector extends BaseConnector {
  private pool: Pool | null = null;
  protected config: PostgresConfig;

  constructor(config: PostgresConfig) {
    super(config);
    this.config = config;
  }

  async connect(): Promise<void> {
    try {
      this.pool = new Pool({
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
      });

      // Test connection
      const client = await this.pool.connect();
      client.release();
      
      Logger.success(`Connected to PostgreSQL: ${this.config.database}`);
    } catch (error) {
      Logger.error('Failed to connect to PostgreSQL', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      Logger.info('Disconnected from PostgreSQL');
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
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    const schema = this.config.schema || 'public';
    const entities: EntitySchema[] = [];

    // Get tables to introspect
    const tablesToIntrospect = this.config.tables || await this.getAllTables(schema);

    Logger.info(`Introspecting ${tablesToIntrospect.length} tables...`);

    for (const tableName of tablesToIntrospect) {
      try {
        const entitySchema = await this.introspectTable(tableName, schema);
        entities.push(entitySchema);
        Logger.success(`Introspected table: ${tableName}`);
      } catch (error) {
        Logger.warning(`Failed to introspect table ${tableName}: ${error}`);
      }
    }

    return entities;
  }

  private async getAllTables(schema: string): Promise<string[]> {
    const query = `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = $1 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `;

    const result = await this.pool!.query(query, [schema]);
    return result.rows.map(row => row.table_name);
  }

  private async introspectTable(tableName: string, schema: string): Promise<EntitySchema> {
    const query = `
      SELECT 
        column_name,
        data_type,
        is_nullable,
        column_default,
        character_maximum_length,
        numeric_precision,
        numeric_scale,
        udt_name
      FROM information_schema.columns
      WHERE table_schema = $1 AND table_name = $2
      ORDER BY ordinal_position
    `;

    const result = await this.pool!.query(query, [schema, tableName]);
    
    const fields: FieldDefinition[] = result.rows.map(row => {
      const type = TypeMapper.mapSQLType(row.data_type);
      const isNullable = row.is_nullable === 'YES';
      const isRequired = !isNullable && row.column_default === null;

      return {
        name: TypeMapper.sanitizeFieldName(row.column_name),
        type,
        isArray: false, // SQL columns are not arrays by default
        isNullable,
        isRequired,
        description: `${row.data_type}${row.character_maximum_length ? `(${row.character_maximum_length})` : ''}`,
      };
    });

    return {
      name: TypeMapper.toPascalCase(tableName),
      fields,
      description: `Table: ${schema}.${tableName}`,
    };
  }

  async getData(entityName: string, args?: any): Promise<any[]> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    const tableName = this.findTableName(entityName);
    const limit = args?.limit || 100;
    const offset = args?.offset || 0;

    // Build WHERE clause if filter is provided
    let whereClause = '';
    const values: any[] = [];
    let paramCounter = 1;

    if (args?.filter) {
      const conditions: string[] = [];
      for (const [key, value] of Object.entries(args.filter)) {
        conditions.push(`${key} = $${paramCounter}`);
        values.push(value);
        paramCounter++;
      }
      if (conditions.length > 0) {
        whereClause = 'WHERE ' + conditions.join(' AND ');
      }
    }

    const query = `
      SELECT * FROM ${tableName}
      ${whereClause}
      LIMIT $${paramCounter} OFFSET $${paramCounter + 1}
    `;

    values.push(limit, offset);

    const result = await this.pool.query(query, values);
    return result.rows;
  }

  async getById(entityName: string, id: string): Promise<any> {
    if (!this.pool) {
      throw new Error('Database not connected');
    }

    const tableName = this.findTableName(entityName);
    
    // Try to find the primary key column
    const pkColumn = await this.getPrimaryKeyColumn(tableName);
    
    const query = `SELECT * FROM ${tableName} WHERE ${pkColumn} = $1 LIMIT 1`;
    const result = await this.pool.query(query, [id]);

    return result.rows[0] || null;
  }

  private async getPrimaryKeyColumn(tableName: string): Promise<string> {
    const schema = this.config.schema || 'public';
    const query = `
      SELECT a.attname
      FROM pg_index i
      JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = ANY(i.indkey)
      WHERE i.indrelid = $1::regclass AND i.indisprimary
    `;

    try {
      const result = await this.pool!.query(query, [`${schema}.${tableName}`]);
      if (result.rows.length > 0) {
        return result.rows[0].attname;
      }
    } catch (error) {
      // Fall back to 'id' if we can't determine the primary key
    }

    return 'id';
  }

  private findTableName(entityName: string): string {
    // Convert PascalCase entity name back to table name
    return entityName.toLowerCase();
  }
}

