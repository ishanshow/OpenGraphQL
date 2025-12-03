import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { MongoClient } from 'mongodb';
import { Pool } from 'pg';
import mysql from 'mysql2/promise';
import { SubgraphGenerator } from '../core/subgraph-generator';
import { ConfigLoader } from '../core/config-loader';
import { Logger } from '../utils/logger';
import * as dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

// Root route - health check
app.get('/', (req: Request, res: Response) => {
  res.json({
    name: 'OpenGraphQL API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      mongodb: ['/api/mongodb/test-connection', '/api/mongodb/list-databases', '/api/mongodb/list-collections'],
      postgres: ['/api/postgres/test-connection', '/api/postgres/list-databases', '/api/postgres/list-tables'],
      mysql: ['/api/mysql/test-connection', '/api/mysql/list-databases', '/api/mysql/list-tables'],
      rest: ['/api/rest/test-connection'],
      general: ['/api/generate', '/api/status', '/api/shutdown']
    }
  });
});

// Store active generator instance
let activeGenerator: SubgraphGenerator | null = null;
let serverUrl: string | null = null;

// MongoDB Routes
app.post('/api/mongodb/test-connection', async (req: Request, res: Response) => {
  const { uri } = req.body;
  try {
    const client = new MongoClient(uri);
    await client.connect();
    await client.close();
    res.json({ success: true, message: 'Connection successful' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/mongodb/list-databases', async (req: Request, res: Response) => {
  const { uri } = req.body;
  try {
    const client = new MongoClient(uri);
    await client.connect();
    const adminDb = client.db().admin();
    const result = await adminDb.listDatabases();
    await client.close();
    
    const databases = result.databases
      .map((db: any) => db.name)
      .filter((name: string) => !['admin', 'config', 'local'].includes(name));
    
    res.json({ success: true, databases });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/mongodb/list-collections', async (req: Request, res: Response) => {
  const { uri, database } = req.body;
  try {
    const client = new MongoClient(uri);
    await client.connect();
    const db = client.db(database);
    const collections = await db.listCollections().toArray();
    await client.close();
    
    res.json({ 
      success: true, 
      collections: collections.map(c => c.name) 
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// PostgreSQL Routes
app.post('/api/postgres/test-connection', async (req: Request, res: Response) => {
  const { host, port, database, user, password, ssl } = req.body;
  try {
    const pool = new Pool({
      host,
      port: parseInt(port),
      database,
      user,
      password,
      ssl: ssl !== false ? { rejectUnauthorized: false } : false,
    });
    const client = await pool.connect();
    client.release();
    await pool.end();
    res.json({ success: true, message: 'Connection successful' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/postgres/list-databases', async (req: Request, res: Response) => {
  const { host, port, user, password, ssl } = req.body;
  try {
    const pool = new Pool({
      host,
      port: parseInt(port),
      database: 'postgres',
      user,
      password,
      ssl: ssl !== false ? { rejectUnauthorized: false } : false,
    });
    
    const result = await pool.query(
      `SELECT datname FROM pg_database WHERE datistemplate = false AND datname NOT IN ('postgres')`
    );
    await pool.end();
    
    res.json({ 
      success: true, 
      databases: result.rows.map(row => row.datname) 
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/postgres/list-tables', async (req: Request, res: Response) => {
  const { host, port, database, user, password, ssl, schema = 'public' } = req.body;
  try {
    const pool = new Pool({
      host,
      port: parseInt(port),
      database,
      user,
      password,
      ssl: ssl !== false ? { rejectUnauthorized: false } : false,
    });
    
    const result = await pool.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 AND table_type = 'BASE TABLE'`,
      [schema]
    );
    await pool.end();
    
    res.json({ 
      success: true, 
      tables: result.rows.map(row => row.table_name) 
    });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// MySQL Routes
app.post('/api/mysql/test-connection', async (req: Request, res: Response) => {
  const { host, port, database, user, password } = req.body;
  try {
    const connection = await mysql.createConnection({
      host,
      port: parseInt(port),
      database,
      user,
      password,
    });
    await connection.end();
    res.json({ success: true, message: 'Connection successful' });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/mysql/list-databases', async (req: Request, res: Response) => {
  const { host, port, user, password } = req.body;
  try {
    const connection = await mysql.createConnection({
      host,
      port: parseInt(port),
      user,
      password,
    });
    
    const [rows] = await connection.execute('SHOW DATABASES') as any;
    await connection.end();
    
    const systemDbs = ['information_schema', 'mysql', 'performance_schema', 'sys'];
    const databases = rows
      .map((row: any) => row.Database)
      .filter((name: string) => !systemDbs.includes(name));
    
    res.json({ success: true, databases });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

app.post('/api/mysql/list-tables', async (req: Request, res: Response) => {
  const { host, port, database, user, password } = req.body;
  try {
    const connection = await mysql.createConnection({
      host,
      port: parseInt(port),
      database,
      user,
      password,
    });
    
    const [rows] = await connection.execute('SHOW TABLES') as any;
    await connection.end();
    
    const tableKey = `Tables_in_${database}`;
    const tables = rows.map((row: any) => row[tableKey]);
    
    res.json({ success: true, tables });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// REST API Test
app.post('/api/rest/test-connection', async (req: Request, res: Response) => {
  const { baseUrl, authToken, headers } = req.body;
  try {
    const axios = (await import('axios')).default;
    const response = await axios.get(baseUrl, {
      headers: {
        ...(headers || {}),
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      timeout: 10000,
    });
    res.json({ success: true, message: 'Connection successful' });
  } catch (error: any) {
    // For REST, we consider any response as successful (even 404)
    if (error.response) {
      res.json({ success: true, message: 'Endpoint reachable' });
    } else {
      res.status(400).json({ success: false, message: error.message });
    }
  }
});

// Generate Subgraph
app.post('/api/generate', async (req: Request, res: Response) => {
  const { type, config, serverPort = 4000 } = req.body;
  
  try {
    // Shutdown existing generator if any
    if (activeGenerator) {
      await activeGenerator.shutdown();
      activeGenerator = null;
      serverUrl = null;
    }

    // Set environment variables based on config
    process.env.DATASOURCE_TYPE = type;
    process.env.DATASOURCE_NAME = config.name || type;
    process.env.SERVER_PORT = serverPort.toString();

    switch (type) {
      case 'mongodb':
        process.env.MONGODB_URI = config.uri;
        process.env.MONGODB_DATABASE = config.database;
        if (config.collections?.length) {
          process.env.MONGODB_COLLECTIONS = config.collections.join(',');
        } else {
          delete process.env.MONGODB_COLLECTIONS;
        }
        // Set SMART_SCAN based on frontend toggle
        process.env.SMART_SCAN = config.smartScan ? 'true' : 'false';
        break;
      
      case 'postgres':
        process.env.POSTGRES_HOST = config.host;
        process.env.POSTGRES_PORT = config.port.toString();
        process.env.POSTGRES_DATABASE = config.database;
        process.env.POSTGRES_USER = config.user;
        process.env.POSTGRES_PASSWORD = config.password;
        process.env.POSTGRES_SCHEMA = config.schema || 'public';
        process.env.POSTGRES_SSL = config.ssl !== false ? 'true' : 'false';
        if (config.tables?.length) {
          process.env.POSTGRES_TABLES = config.tables.join(',');
        } else {
          delete process.env.POSTGRES_TABLES;
        }
        break;
      
      case 'mysql':
        process.env.MYSQL_HOST = config.host;
        process.env.MYSQL_PORT = config.port.toString();
        process.env.MYSQL_DATABASE = config.database;
        process.env.MYSQL_USER = config.user;
        process.env.MYSQL_PASSWORD = config.password;
        if (config.tables?.length) {
          process.env.MYSQL_TABLES = config.tables.join(',');
        } else {
          delete process.env.MYSQL_TABLES;
        }
        break;
      
      case 'rest':
        process.env.REST_BASE_URL = config.baseUrl;
        if (config.authToken) {
          process.env.REST_AUTH_TOKEN = config.authToken;
        }
        if (config.headers) {
          process.env.REST_HEADERS = JSON.stringify(config.headers);
        }
        process.env.REST_ENDPOINTS = JSON.stringify(config.endpoints || []);
        break;
    }

    // Load configuration
    const generatorConfig = ConfigLoader.loadFromEnv();
    ConfigLoader.validate(generatorConfig);

    // Create generator
    activeGenerator = new SubgraphGenerator();
    
    // Initialize data sources
    await activeGenerator.initialize(generatorConfig.dataSources);
    
    // Introspect data sources
    await activeGenerator.introspect();
    
    // Generate schema files
    await activeGenerator.generateSchemaFiles(generatorConfig.outputDir || './generated');
    
    // Get summary
    const summary = activeGenerator.getSummary();
    
    // Start server
    serverUrl = await activeGenerator.startServer(serverPort);

    res.json({ 
      success: true, 
      serverUrl,
      summary,
      message: 'Subgraph generated and server started successfully'
    });
  } catch (error: any) {
    Logger.error('Generation failed', error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Get server status
app.get('/api/status', (req: Request, res: Response) => {
  res.json({
    active: activeGenerator !== null,
    serverUrl,
  });
});

// Shutdown server
app.post('/api/shutdown', async (req: Request, res: Response) => {
  if (activeGenerator) {
    await activeGenerator.shutdown();
    activeGenerator = null;
    serverUrl = null;
  }
  res.json({ success: true, message: 'Server shutdown' });
});

// Error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  Logger.error('API Error:', err);
  res.status(500).json({ success: false, message: err.message });
});

const API_PORT = parseInt(process.env.API_PORT || '3001');

// Start the server
const server = app.listen(API_PORT, () => {
  Logger.success(`🚀 OpenGraphQL API running at http://localhost:${API_PORT}`);
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  Logger.info('Shutting down API server...');
  server.close(() => {
    process.exit(0);
  });
});

process.on('SIGTERM', () => {
  Logger.info('Shutting down API server...');
  server.close(() => {
    process.exit(0);
  });
});

export default app;

