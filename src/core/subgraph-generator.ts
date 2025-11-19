import { GeneratorConfig, IntrospectionResult, DataSourceConfig } from '../types';
import { ConnectorFactory, BaseConnector } from '../connectors';
import { ApolloSubgraphServer } from '../server';
import { Logger } from '../utils/logger';
import { MCPConfigGenerator, MCPServerManager } from '../mcp';
import * as fs from 'fs/promises';
import * as path from 'path';

export class SubgraphGenerator {
  private connectors: Map<string, BaseConnector> = new Map();
  private introspectionResults: IntrospectionResult[] = [];
  private server: ApolloSubgraphServer;
  private mcpServer?: MCPServerManager;

  constructor() {
    this.server = new ApolloSubgraphServer();
  }

  /**
   * Initializes all data source connectors
   */
  async initialize(dataSources: DataSourceConfig[]): Promise<void> {
    Logger.section('Initializing Data Sources');

    for (const config of dataSources) {
      try {
        Logger.info(`Connecting to ${config.name} (${config.type})...`);
        
        const connector = ConnectorFactory.create(config);
        await connector.connect();
        
        this.connectors.set(config.name, connector);
        
        Logger.success(`Connected to ${config.name}`);
      } catch (error) {
        Logger.error(`Failed to connect to ${config.name}`, error);
        throw error;
      }
    }
  }

  /**
   * Introspects all connected data sources
   */
  async introspect(): Promise<IntrospectionResult[]> {
    Logger.section('Introspecting Data Sources');

    this.introspectionResults = [];

    for (const [name, connector] of this.connectors) {
      try {
        Logger.info(`Introspecting ${name}...`);
        
        const entities = await connector.introspect();
        
        this.introspectionResults.push({
          dataSourceName: name,
          dataSourceType: (connector as any).config.type,
          entities,
        });

        Logger.success(`Introspected ${name}: ${entities.length} entities found`);
      } catch (error) {
        Logger.error(`Failed to introspect ${name}`, error);
        throw error;
      }
    }

    return this.introspectionResults;
  }

  /**
   * Generates and saves schema files
   */
  async generateSchemaFiles(outputDir: string = './generated', serverPort: number = 4000): Promise<void> {
    Logger.section('Generating Schema Files');

    // Create output directory
    await fs.mkdir(outputDir, { recursive: true });

    // Export schema and resolvers
    const { typeDefs, resolvers } = this.server.export(
      this.introspectionResults,
      this.connectors
    );

    // Save type definitions
    const typeDefsPath = path.join(outputDir, 'schema.graphql');
    await fs.writeFile(typeDefsPath, typeDefs, 'utf-8');
    Logger.success(`Schema saved to ${typeDefsPath}`);

    // Save resolvers as TypeScript
    const resolversPath = path.join(outputDir, 'resolvers.ts');
    const resolversContent = this.generateResolversFile();
    await fs.writeFile(resolversPath, resolversContent, 'utf-8');
    Logger.success(`Resolvers template saved to ${resolversPath}`);

    // Save server file
    const serverPath = path.join(outputDir, 'server.ts');
    const serverContent = this.generateServerFile(outputDir);
    await fs.writeFile(serverPath, serverContent, 'utf-8');
    Logger.success(`Server file saved to ${serverPath}`);

    // Save config for reference
    const configPath = path.join(outputDir, 'datasources.json');
    await fs.writeFile(
      configPath,
      JSON.stringify(this.introspectionResults, null, 2),
      'utf-8'
    );
    Logger.success(`Data source info saved to ${configPath}`);

    // Generate MCP configuration
    await this.generateMCPConfig(outputDir, serverPort);
  }

  /**
   * Generates MCP server configuration
   */
  async generateMCPConfig(outputDir: string = './generated', serverPort: number = 4000): Promise<void> {
    Logger.section('Generating MCP Configuration');

    try {
      // Get primary data source name for MCP server naming
      const primaryDataSource = this.introspectionResults[0]?.dataSourceName || 'graphql';

      // Generate MCP config files
      await MCPConfigGenerator.generateConfig(outputDir, serverPort, primaryDataSource);

      // Generate startup script
      await MCPConfigGenerator.generateStartupScript(outputDir, serverPort);

      Logger.success('MCP configuration generated successfully');
      Logger.info('\n💡 Next steps:');
      Logger.info('   1. Start your GraphQL server: npm run serve');
      Logger.info('   2. In another terminal, start MCP server: ./generated/start-mcp-server.sh');
      Logger.info('   3. Add config to Claude Desktop from: generated/claude-desktop-config.json\n');
    } catch (error) {
      Logger.warning('Failed to generate MCP configuration (non-fatal)');
      if (process.env.DEBUG === 'true') {
        Logger.error('MCP generation error', error);
      }
    }
  }

  /**
   * Starts the Apollo server
   */
  async startServer(port: number, options?: { startMCP?: boolean; outputDir?: string }): Promise<string> {
    Logger.section('Starting Apollo Server');

    // Create the server
    await this.server.create(
      this.introspectionResults,
      this.connectors,
      { port }
    );

    // Start the server
    const url = await this.server.start(port);

    // Optionally start MCP server
    if (options?.startMCP && options?.outputDir) {
      await this.startMCPServer(options.outputDir);
    }

    return url;
  }

  /**
   * Starts the MCP server
   */
  async startMCPServer(outputDir: string = './generated'): Promise<void> {
    try {
      const mcpConfigPath = path.join(outputDir, 'mcp-config.yaml');

      // Check if config exists
      try {
        await fs.access(mcpConfigPath);
      } catch {
        Logger.warning('MCP config not found. Run generate command first or disable MCP.');
        return;
      }

      // Get endpoint from first datasource
      const port = 4000; // This should ideally be passed from the server
      const endpoint = `http://localhost:${port}/`;

      this.mcpServer = new MCPServerManager({
        configPath: mcpConfigPath,
        endpoint,
        port: 8000
      });

      await this.mcpServer.start();
    } catch (error) {
      Logger.warning('Failed to start MCP server (non-fatal)');
      if (process.env.DEBUG === 'true') {
        Logger.error('MCP server error', error);
      }
    }
  }

  /**
   * Stops the server and disconnects all data sources
   */
  async shutdown(): Promise<void> {
    Logger.section('Shutting Down');

    // Stop MCP server if running
    if (this.mcpServer && this.mcpServer.isRunning()) {
      await this.mcpServer.stop();
    }

    // Stop server
    await this.server.stop();

    // Disconnect all data sources
    for (const [name, connector] of this.connectors) {
      try {
        await connector.disconnect();
        Logger.info(`Disconnected from ${name}`);
      } catch (error) {
        Logger.warning(`Failed to disconnect from ${name}: ${error}`);
      }
    }

    this.connectors.clear();
    this.introspectionResults = [];
  }

  /**
   * Generates a resolvers TypeScript file
   */
  private generateResolversFile(): string {
    return `// Generated resolvers
// This file is auto-generated. Modify with caution.

export const resolvers = {
  // Add custom resolvers here
  // The dynamic resolvers are generated at runtime
};
`;
  }

  /**
   * Generates a server TypeScript file
   */
  private generateServerFile(outputDir: string): string {
    return `// Generated server file
// This file is auto-generated and provides a standalone server setup

import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import gql from 'graphql-tag';
import * as fs from 'fs';
import * as path from 'path';

async function startServer() {
  // Read generated schema
  const schemaPath = path.join(__dirname, 'schema.graphql');
  const typeDefs = fs.readFileSync(schemaPath, 'utf-8');

  // Note: You'll need to implement resolvers based on your data sources
  // The dynamic resolvers need to be connected to your data sources
  const resolvers = {
    Query: {
      // Add your resolvers here
    },
  };

  const schema = buildSubgraphSchema({
    typeDefs: gql(typeDefs),
    resolvers,
  });

  const server = new ApolloServer({
    schema,
    introspection: true,
  });

  const { url } = await startStandaloneServer(server, {
    listen: { port: 4000 },
  });

  console.log(\`🚀 Server ready at \${url}\`);
}

startServer().catch(console.error);
`;
  }

  /**
   * Gets the introspection results
   */
  getIntrospectionResults(): IntrospectionResult[] {
    return this.introspectionResults;
  }

  /**
   * Gets summary statistics
   */
  getSummary(): string {
    const summary: string[] = [];
    
    summary.push('📊 Introspection Summary:');
    summary.push(`   Data Sources: ${this.connectors.size}`);
    summary.push(`   Total Entities: ${this.introspectionResults.reduce((acc, r) => acc + r.entities.length, 0)}`);
    summary.push('');
    
    for (const result of this.introspectionResults) {
      summary.push(`   📁 ${result.dataSourceName} (${result.dataSourceType}): ${result.entities.length} entities`);
      
      // Show entity details
      for (const entity of result.entities) {
        summary.push(`      └─ ${entity.name} (${entity.fields.length} fields)`);
      }
    }

    return summary.join('\n');
  }
}

