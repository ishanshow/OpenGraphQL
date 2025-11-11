import { GeneratorConfig, IntrospectionResult, DataSourceConfig } from '../types';
import { ConnectorFactory, BaseConnector } from '../connectors';
import { ApolloSubgraphServer } from '../server';
import { Logger } from '../utils/logger';
import * as fs from 'fs/promises';
import * as path from 'path';

export class SubgraphGenerator {
  private connectors: Map<string, BaseConnector> = new Map();
  private introspectionResults: IntrospectionResult[] = [];
  private server: ApolloSubgraphServer;

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
  async generateSchemaFiles(outputDir: string = './generated'): Promise<void> {
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
  }

  /**
   * Starts the Apollo server
   */
  async startServer(port: number): Promise<string> {
    Logger.section('Starting Apollo Server');

    // Create the server
    await this.server.create(
      this.introspectionResults,
      this.connectors,
      { port }
    );

    // Start the server
    return await this.server.start(port);
  }

  /**
   * Stops the server and disconnects all data sources
   */
  async shutdown(): Promise<void> {
    Logger.section('Shutting Down');

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

