import { ApolloServer } from '@apollo/server';
import { startStandaloneServer } from '@apollo/server/standalone';
import { buildSubgraphSchema } from '@apollo/subgraph';
import { ApolloServerPluginLandingPageLocalDefault } from '@apollo/server/plugin/landingPage/default';
import gql from 'graphql-tag';
import { IntrospectionResult, ServerConfig } from '../types';
import { BaseConnector } from '../connectors/base-connector';
import { SchemaGenerator } from '../generator/schema-generator';
import { ResolverGenerator } from '../generator/resolver-generator';
import { Logger } from '../utils/logger';

export class ApolloSubgraphServer {
  private server: ApolloServer | null = null;
  private schemaGenerator: SchemaGenerator;
  private resolverGenerator: ResolverGenerator;

  constructor() {
    this.schemaGenerator = new SchemaGenerator();
    this.resolverGenerator = new ResolverGenerator();
  }

  /**
   * Creates and configures the Apollo Server
   */
  async create(
    introspectionResults: IntrospectionResult[],
    connectors: Map<string, BaseConnector>,
    serverConfig: ServerConfig
  ): Promise<void> {
    try {
      Logger.section('Creating Apollo Subgraph Server');

      // Generate schema
      Logger.info('Generating GraphQL schema...');
      const typeDefs = this.schemaGenerator.generateFederatedSchema(introspectionResults);
      
      // Generate resolvers
      Logger.info('Generating resolvers...');
      const resolvers = this.resolverGenerator.generateResolvers(introspectionResults, connectors);

      // Build federated schema
      const schema = buildSubgraphSchema({
        typeDefs: gql(typeDefs),
        resolvers,
      });

      // Create Apollo Server
      this.server = new ApolloServer({
        schema,
        introspection: true, // Enable introspection
        csrfPrevention: false, // Disable CSRF for easier development/testing
        plugins: [
          // Enable Apollo Sandbox in development
          ApolloServerPluginLandingPageLocalDefault({ embed: true }),
        ],
        formatError: (error) => {
          // Suppress noisy errors (these are expected during normal operation)
          const suppressedErrors = [
            'non-empty `query`',
            'persistedQuery',
          ];
          
          const shouldSuppress = suppressedErrors.some(msg => 
            error.message?.includes(msg)
          );
          
          if (!shouldSuppress) {
            Logger.error('GraphQL Error:', error);
          }
          
          return error;
        },
      });

      Logger.success('Apollo Server created successfully');
    } catch (error) {
      Logger.error('Failed to create Apollo Server', error);
      throw error;
    }
  }

  /**
   * Starts the server
   */
  async start(port: number): Promise<string> {
    if (!this.server) {
      throw new Error('Server not created. Call create() first.');
    }

    try {
      const { url } = await startStandaloneServer(this.server, {
        listen: { port },
        context: async ({ req }) => {
          // Add any context you need here
          return {
            headers: req.headers,
          };
        },
      });

      Logger.success(`🚀 Server ready at ${url}`);
      Logger.info(`📊 Open Apollo Sandbox at ${url}`);
      Logger.info(`💡 Tip: You can also use any GraphQL client (Postman, Insomnia, etc.)`);
      
      return url;
    } catch (error) {
      Logger.error('Failed to start server', error);
      throw error;
    }
  }

  /**
   * Stops the server
   */
  async stop(): Promise<void> {
    if (this.server) {
      await this.server.stop();
      this.server = null;
      Logger.info('Server stopped');
    }
  }

  /**
   * Exports the generated schema and resolvers for external use
   */
  export(
    introspectionResults: IntrospectionResult[],
    connectors: Map<string, BaseConnector>
  ): { typeDefs: string; resolvers: any } {
    const typeDefs = this.schemaGenerator.generateFederatedSchema(introspectionResults);
    const resolvers = this.resolverGenerator.generateResolvers(introspectionResults, connectors);

    return { typeDefs, resolvers };
  }
}

