#!/usr/bin/env node

import { Command } from 'commander';
import { SubgraphGenerator } from './core/subgraph-generator';
import { ConfigLoader } from './core/config-loader';
import { Logger } from './utils/logger';
import * as dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const program = new Command();

program
  .name('subgraph-gen')
  .description('Apollo GraphQL Subgraph Generator - Generate subgraphs from data sources')
  .version('1.0.0');

// Generate command
program
  .command('generate')
  .description('Generate GraphQL schema from environment configuration')
  .option('-o, --output <path>', 'Output directory for generated files', process.env.OUTPUT_DIR || './generated')
  .action(async (options) => {
    try {
      Logger.section('Apollo Subgraph Generator');

      // Load configuration from environment
      Logger.info('Loading configuration from environment variables...');
      const config = ConfigLoader.loadFromEnv();
      
      // Override output directory if specified
      if (options.output) {
        config.outputDir = options.output;
      }

      // Validate configuration
      ConfigLoader.validate(config);
      Logger.success('Configuration loaded and validated');

      // Create generator
      const generator = new SubgraphGenerator();

      // Initialize data sources
      await generator.initialize(config.dataSources);

      // Introspect data sources
      await generator.introspect();

      // Generate schema files
      await generator.generateSchemaFiles(config.outputDir || './generated');

      // Print summary
      Logger.section('Generation Complete');
      console.log(generator.getSummary());

      // Cleanup
      await generator.shutdown();

      Logger.success('✨ Schema generation completed successfully!');
    } catch (error) {
      Logger.error('Generation failed', error);
      process.exit(1);
    }
  });

// Serve command
program
  .command('serve')
  .description('Start the Apollo GraphQL server')
  .option('-p, --port <number>', 'Server port', process.env.SERVER_PORT || '4000')
  .option('--no-generate', 'Skip generating schema files')
  .action(async (options) => {
    try {
      Logger.section('Apollo Subgraph Server');

      // Load configuration from environment
      Logger.info('Loading configuration from environment variables...');
      const config = ConfigLoader.loadFromEnv();
      
      // Override port if specified
      const port = options.port ? parseInt(options.port) : config.server.port;

      // Validate configuration
      ConfigLoader.validate(config);
      Logger.success('Configuration loaded and validated');

      // Create generator
      const generator = new SubgraphGenerator();

      // Initialize data sources
      await generator.initialize(config.dataSources);

      // Introspect data sources
      await generator.introspect();

      // Print summary
      console.log('\n' + generator.getSummary() + '\n');

      // Generate schema files (unless disabled)
      if (options.generate !== false) {
        await generator.generateSchemaFiles(config.outputDir || './generated');
        Logger.info(`💾 Schema files saved to ${config.outputDir || './generated'}\n`);
      }

      // Start server
      await generator.startServer(port);

      // Handle graceful shutdown
      process.on('SIGINT', async () => {
        Logger.info('\nShutting down gracefully...');
        await generator.shutdown();
        process.exit(0);
      });

      process.on('SIGTERM', async () => {
        Logger.info('\nShutting down gracefully...');
        await generator.shutdown();
        process.exit(0);
      });

    } catch (error) {
      Logger.error('Server failed to start', error);
      process.exit(1);
    }
  });

// Test command
program
  .command('test')
  .description('Test data source connections')
  .action(async () => {
    try {
      Logger.section('Testing Data Source Connections');

      const config = ConfigLoader.loadFromEnv();
      ConfigLoader.validate(config);

      const generator = new SubgraphGenerator();
      await generator.initialize(config.dataSources);
      
      Logger.success('✅ All data sources connected successfully!');
      
      await generator.shutdown();
    } catch (error) {
      Logger.error('Connection test failed', error);
      process.exit(1);
    }
  });

program.parse();
