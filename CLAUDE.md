# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Apollo Subgraph Generator is a TypeScript CLI tool that automates Apollo GraphQL subgraph creation from various data sources including MongoDB, PostgreSQL, MySQL, and REST APIs. It introspects data sources, generates GraphQL schemas with Apollo Federation v2 support, and creates production-ready resolvers and servers.

**For comprehensive documentation, see [README.md](README.md)**.

## Common Commands

### Development
```bash
npm run dev          # Development mode with hot reload (tsx watch)
npm run build        # Compile TypeScript to dist/
npm run start        # Run compiled CLI from dist/
```

### Using the CLI
```bash
npm run generate     # Generate schema files from .env config (outputs to ./generated)
npm run serve        # Start Apollo server with introspected schema
npm run serve:mcp    # Start Apollo server with MCP server auto-start
npm run test         # Test data source connections
npm run mcp:start    # Start MCP server (requires generated config)
```

### Running the Built CLI
```bash
tsx src/cli.ts generate [--output <path>] [--port <number>] [--no-mcp]
tsx src/cli.ts serve [--port <number>] [--no-generate] [--with-mcp]
tsx src/cli.ts test
```

## Architecture

For detailed architecture documentation, see [README.md](README.md#how-it-works).

### Core Flow
1. **Configuration Loading** (`ConfigLoader`): Reads `.env` file and validates data source configurations
2. **Connector Initialization** (`SubgraphGenerator`): Creates appropriate connectors via factory pattern
3. **Introspection** (`BaseConnector` implementations): Analyzes data source schemas/structures
4. **Schema Generation** (`SchemaGenerator`): Converts introspection results to GraphQL type definitions
5. **Resolver Generation** (`ResolverGenerator`): Creates dynamic resolvers mapped to data sources
6. **Server Creation** (`ApolloSubgraphServer`): Builds Apollo Federation-ready server
7. **MCP Configuration** (`MCPConfigGenerator`): Auto-generates Apollo MCP Server config for AI integration

### Key Components

#### Connectors (`src/connectors/`)
- **Pattern**: Factory pattern via `ConnectorFactory.create(config)`
- **Base Class**: `BaseConnector` defines interface: `connect()`, `disconnect()`, `introspect()`, `testConnection()`, `getData()`, `getById()`
- **Implementations**:
  - `MongoDBConnector` - Uses dynamic field discovery (adaptive batch sampling) or static sampling, handles nested objects, stores collection name mapping
  - `PostgresConnector` - Queries `information_schema` for table metadata
  - `MySQLConnector` - Similar to Postgres, queries schema tables
  - `RESTConnector` - Analyzes response structures from endpoint calls

#### Type System (`src/types/index.ts`)
- **EntitySchema**: Represents a GraphQL type with fields, supports nested types via `nestedType` property
  - **sourceName**: Stores original collection/table name for lookups (fixes collection name mapping issues)
- **FieldDefinition**: Field metadata including type, nullability, arrays, nested schemas
- **IntrospectionResult**: Collection of entities from a data source with metadata
- **Configs**: Union types for different data source configurations (MongoDB, Postgres, MySQL, REST)

#### Schema Generation (`src/generator/`)
- **SchemaGenerator**: Converts `IntrospectionResult[]` to GraphQL SDL
  - Separates nested types from main entities
  - Generates `@key` directives for Apollo Federation on main entities only
  - Creates Query type with pattern: `{dataSourceName}_{entityName}`
- **ResolverGenerator**: Creates resolver maps that call connector methods dynamically
- **Type Mapping**: `TypeMapper` utility converts DB types → GraphQL types (e.g., MongoDB ObjectId → ID, PostgreSQL integer → Int)
  - **Large Number Handling**: Numbers > 2^31-1 → Float (fixes timestamp overflow issues)

#### Server (`src/server/apollo-server.ts`)
- **ApolloSubgraphServer**: Wraps `@apollo/server` with Federation support
- Uses `buildSubgraphSchema` from `@apollo/subgraph`
- Supports Apollo Sandbox for local development
- Handles graceful shutdown for connectors

#### MCP Integration (`src/mcp/`)
- **MCPConfigGenerator**: Auto-generates Apollo MCP Server configuration
  - Creates `mcp-config.yaml` with endpoint, introspection, and schema settings
  - Generates Claude Desktop configuration snippets
  - Creates executable startup scripts
  - Automatically reconfigures when schema changes
- **MCPServerManager**: Programmatic MCP server lifecycle management
  - Starts/stops Apollo MCP Server alongside GraphQL server
  - Handles graceful shutdown
  - Auto-detects available MCP server binaries

### Important Patterns

#### Collection Name Mapping (MongoDB)
MongoDB collection names are preserved using `entityToCollectionMap`:
- Collection name stored in `EntitySchema.sourceName` during introspection
- Map created: entity name → collection name (e.g., "User" → "users")
- Used in `getData()` and `getById()` to find correct collection
- **Fixes**: Empty array issues caused by reverse-engineering collection names

#### Nested Type Handling (MongoDB)
MongoDB documents with nested objects are introspected to create separate GraphQL types:
- Main entity gets `@key` directive for Federation
- Nested types are regular GraphQL types without `@key`
- Fields reference nested types: `address: Address` instead of `JSON`
- **Smart Type Resolution**: Prefers nested types over JSON - upgrades fields from JSON to structured types when populated objects are discovered
- **Field Merging**: Combines fields from multiple document variations into complete nested type schemas
- **Recursive Analysis**: Discovers deeply nested structures (e.g., `User.profile.settings.preferences`)

#### Large Number Handling
GraphQL Int can only represent 32-bit signed integers (-2^31 to 2^31-1):
- MongoDB timestamps in milliseconds exceed this limit
- TypeMapper checks range and uses Float for large integers
- **Fixes**: "Int cannot represent non 32-bit signed integer value" errors

#### Environment-Based Configuration
All configuration via `.env` file (see `.env.example`):
- Single data source per instance (configurable via `DATASOURCE_TYPE`)
- Type-specific environment variables (e.g., `MONGODB_*`, `POSTGRES_*`)
- Optional filtering: `MONGODB_COLLECTIONS`, `POSTGRES_TABLES`, `MYSQL_TABLES`
- Debug mode via `DEBUG=true` for detailed logging

#### Query Naming Convention
Generated GraphQL queries follow pattern:
```
{dataSourceName}_{entityName}(id: ID!): Entity
{dataSourceName}_{entityName}s(limit: Int, offset: Int): [Entity!]!
```

Example: For MongoDB datasource "mongodb" with collection "users":
```graphql
mongodb_user(_id: ID!): User
mongodb_users(limit: Int = 100, offset: Int = 0, filter: UserFilter): [User!]!
```

#### Introspection Strategies
- **MongoDB**: Uses dynamic field discovery by default (adaptive sampling until convergence), or static sampling if `MONGODB_SAMPLE_SIZE` is set. Merges field types across documents.
- **SQL Databases**: Queries metadata tables for definitive schema
- **REST APIs**: Makes sample requests to endpoints, analyzes JSON response structure

#### Dynamic Field Discovery (MongoDB)
MongoDB's unstructured nature means documents in the same collection can have different fields. To ensure all fields are discovered efficiently:

**Dynamic Discovery (Default)** - Uses MongoDB's `$sample` aggregation for random sampling:
- **Random Sampling**: Uses `$sample` to randomly select documents across the entire collection
- **Batch Processing**: Samples 500 documents per batch
- **Convergence Detection**: Stops when fewer than 2 new fields found for 3 consecutive batches
- **Maximum Limit**: 10,000 documents (configurable via `MONGODB_MAX_SAMPLE_SIZE`)
- **Smart Tracking**: Tracks unique field paths including deeply nested fields
- **Detailed Logging**: Shows progress, percentage sampled, and field discovery rate

**Why Random Sampling?**
- Sequential sampling (`.find().skip()`) misses fields in documents scattered throughout the collection
- `$sample` ensures representative coverage regardless of document order
- Critical for discovering sparse fields that only appear in a few documents

**Static Sampling (Override)**:
- Set `MONGODB_SAMPLE_SIZE=<number>` in `.env` to use fixed sample size
- Useful for predictable performance or when schema is well-known
- Example: `MONGODB_SAMPLE_SIZE=1000` samples exactly 1,000 documents
- Still uses random sampling via `$sample`

**Configuration Options**:
```bash
# Static override - disables dynamic discovery
MONGODB_SAMPLE_SIZE=2000

# Dynamic discovery tuning (only when MONGODB_SAMPLE_SIZE is not set)
MONGODB_MAX_SAMPLE_SIZE=15000         # Increase max samples for large collections
MONGODB_CONVERGENCE_THRESHOLD=5       # More conservative - require 5 batches without new fields
```

**How It Works**:
```
Collection: 50,000 documents

Batch 1: 500 random docs (1.0%) → 45 fields discovered
Batch 2: 500 random docs (2.0%) → 18 new fields (63 total)
Batch 3: 500 random docs (3.0%) → 8 new fields (71 total)
Batch 4: 500 random docs (4.0%) → 4 new fields (75 total)
Batch 5: 500 random docs (5.0%) → 1 new field (76 total, < 2 threshold, count=1)
Batch 6: 500 random docs (6.0%) → 0 new fields (count=2)
Batch 7: 500 random docs (7.0%) → 1 new field (77 total, < 2 threshold, count=3)
→ CONVERGED (3 consecutive batches with < 2 new fields)
Total: 3,500 documents sampled (7% of collection), 77 unique field paths discovered
```

**Benefits**:
- **Random sampling** discovers fields regardless of document location in collection
- Adapts to collection size and schema variability automatically
- More efficient than fixed large sample sizes
- Handles sparse fields that appear in only a few documents
- Provides detailed metrics: field paths discovered, schema fields created (main + nested types)

### File Structure Notes

```
src/
├── cli.ts                     # Commander-based CLI, entry point (shebang for npx)
├── index.ts                   # Programmatic API exports
├── types/index.ts             # All TypeScript interfaces/types
├── core/
│   ├── config-loader.ts       # Environment variable parsing & validation
│   └── subgraph-generator.ts  # Orchestrates entire flow (main controller)
├── connectors/
│   ├── base-connector.ts      # Abstract base class
│   ├── connector-factory.ts   # Factory for creating connectors
│   └── [db]-connector.ts      # Specific implementations
├── generator/
│   ├── schema-generator.ts    # GraphQL SDL generation
│   └── resolver-generator.ts  # Dynamic resolver creation
├── server/
│   └── apollo-server.ts       # Apollo Federation server wrapper
├── mcp/
│   ├── mcp-config-generator.ts # Apollo MCP Server config generation
│   ├── mcp-server-manager.ts   # MCP server lifecycle management
│   └── index.ts                # MCP module exports
└── utils/
    ├── logger.ts              # Chalk-based colored logging
    └── type-mapper.ts         # DB type → GraphQL type conversions
```

### Output Files (generated/)
When running `generate` or `serve`:
- `schema.graphql` - Complete GraphQL SDL with types and queries
- `resolvers.ts` - Template file for custom resolver additions
- `server.ts` - Standalone server setup example
- `datasources.json` - Introspection results metadata (includes `sourceName` for lookups)
- `mcp-config.yaml` - Apollo MCP Server configuration (auto-generated)
- `claude-desktop-config.json` - Claude Desktop config snippet (auto-generated)
- `start-mcp-server.sh` - Executable MCP server startup script (auto-generated)

## Development Notes

### TypeScript Configuration
- Target: ES2022 with CommonJS modules
- Strict mode enabled
- Outputs to `dist/` with source maps and declarations
- Uses `tsx` for development (no compilation needed)

### Adding New Data Source Types
1. Create new connector in `src/connectors/` extending `BaseConnector`
2. Add config interface to `src/types/index.ts` (extend `BaseDataSourceConfig`)
3. Update `DataSourceType` union and `DataSourceConfig` union
4. Add case to `ConnectorFactory.create()`
5. Add environment variable parsing in `ConfigLoader.loadFromEnv()`
6. Update validation in `ConfigLoader.validateDataSource()`

### Debugging
Set `DEBUG=true` in `.env` to enable verbose logging showing:
- Connection details
- Introspection progress
- Field type inference
- Generated schema preview

### Testing Connections
Use `npm run test` to verify data source connectivity without generating schemas or starting the server. This is useful for troubleshooting `.env` configuration.

## Recent Fixes

### Random Sampling for Dynamic Field Discovery (MongoDB)
**Issue**: Sequential sampling missed fields scattered throughout collections.
- V1 used sequential sampling (`.find().skip(offset)`) which only samples documents in insertion order
- Fields appearing in documents at different positions in the collection were missed
- Sparse fields that appear in only a few random documents were not discovered
- Example: 92 field paths discovered but final schema only had 17 fields (missing 75+ fields)

**Fix**: Implemented random sampling with MongoDB's `$sample` aggregation:
- **Random Sampling**: Uses `$sample` to randomly select documents across entire collection
- **Better Coverage**: Discovers fields regardless of document position/order
- **Convergence Detection**: Stops when <2 new fields found for 3 consecutive batches
- **Configurable Limits**: `MONGODB_MAX_SAMPLE_SIZE` (default: 10,000) and `MONGODB_CONVERGENCE_THRESHOLD` (default: 3)
- **Comprehensive Metrics**: Shows field paths discovered vs. total schema fields (main + nested types)
- **Optional Static Override**: `MONGODB_SAMPLE_SIZE` for fixed sample size

**Why Random Sampling Matters**:
- MongoDB collections can have documents with different schemas scattered throughout
- Sequential sampling only sees documents in insertion order, missing variations
- `$sample` provides representative coverage of the entire collection
- Critical for sparse fields that appear in <1% of documents

**Benefits**:
- Discovers ALL fields including sparse ones scattered throughout collection
- Adapts automatically to collection size and schema variability
- More efficient than exhaustive scanning
- Provides detailed progress: batch count, percentage sampled, field discovery rate

**Files Changed**:
- `src/types/index.ts` - Added `sampleSize`, `maxSampleSize`, `convergenceThreshold` to `MongoDBConfig`
- `src/core/config-loader.ts` - Parse `MONGODB_SAMPLE_SIZE`, `MONGODB_MAX_SAMPLE_SIZE`, `MONGODB_CONVERGENCE_THRESHOLD`
- `src/connectors/mongodb-connector.ts` - Replaced `.find().skip()` with `$sample`, added configurable thresholds
- `.env.example` - Added configuration options for dynamic discovery tuning

### Nested Type Priority Over JSON (MongoDB)
**Issue**: Nested objects were being incorrectly typed as `JSON` instead of proper GraphQL nested types.
- When a field appeared as an empty object in some documents and a populated object in others, it was typed as `JSON`
- Type conflict resolution prioritized `JSON` over nested types, losing schema information
- Example: `metadata: JSON` instead of `metadata: Metadata` with proper fields

**Fix**: Improved type conflict resolution to prefer structured types over JSON:
- **Upgrade Path**: Fields initially seen as `JSON` (empty objects) are upgraded to nested types when populated objects are discovered
- **Priority System**:
  1. Nested types > JSON (always prefer structured schema)
  2. Keep existing nested types, ignore later empty objects
  3. Merge nested type fields when same field has different structures
  4. Fall back to JSON only for truly incompatible primitive types
- **Better Logging**: Shows when fields are upgraded from JSON to nested types
- **JSON Field Reporting**: Logs count of remaining JSON fields (likely empty/dynamic fields)

**Type Conflict Priority**:
```
Document 1: { metadata: {} }           → metadata: JSON
Document 2: { metadata: { title: "x" } } → metadata: Metadata (UPGRADED!)
Document 3: { metadata: { author: "y" } } → metadata: Metadata (MERGED: now has title + author)
```

**Benefits**:
- Maximum schema discovery - creates nested types whenever possible
- Better GraphQL schema with typed objects instead of opaque JSON
- Handles MongoDB's schema variability gracefully
- Merges fields from multiple document variations into complete nested types

**Files Changed**:
- `src/connectors/mongodb-connector.ts` - Rewrote type conflict resolution logic, added upgrade path from JSON to nested types

### Collection Name Mapping Fix
**Issue**: Queries returned empty arrays due to collection name mismatch.
- MongoDB collection: `docsTocs` (camelCase)
- Generated type: `Docstoc` (singular)
- Lookup tried: `docstocs` (lowercase plural) ❌

**Fix**: Added `entityToCollectionMap` in MongoDB connector:
- Stores mapping during introspection: `Docstoc` → `docsTocs`
- Added `sourceName` field to `EntitySchema`
- Updated `getData()` and `getById()` to use mapping

**Files Changed**:
- `src/types/index.ts` - Added `sourceName` field
- `src/connectors/mongodb-connector.ts` - Added mapping and updated queries

### Large Number Type Fix
**Issue**: GraphQL errors for timestamps > 2^31-1.

**Fix**: Updated `TypeMapper.mapMongoDBType()`:
- Check if integer is outside 32-bit range
- Use Float instead of Int for large numbers
- Handles MongoDB timestamps in milliseconds

**Files Changed**:
- `src/utils/type-mapper.ts` - Added range check for integers

## MCP Integration

The tool includes automatic Apollo MCP Server integration for AI assistants like Claude.

### Quick Start

```bash
# Generate schema with MCP config
npm run generate

# Start GraphQL server
npm run serve

# Start MCP server (in separate terminal)
npm run mcp:start

# Or start both together
npm run serve:mcp
```

### Key Features

- **Zero Reconfiguration**: MCP config regenerates automatically when schema changes
- **Dynamic Introspection**: AI discovers schema changes at runtime
- **Auto-Configuration**: No manual setup required when switching data sources
- **Claude Desktop Ready**: Includes pre-generated configuration snippets

### Workflow

```
Change data source → npm run generate → MCP auto-reconfigures → Ready for AI
```

The MCP configuration is regenerated every time you run `generate` or `serve`, ensuring it always points to the current schema and endpoint with zero manual intervention.

For detailed MCP integration documentation, see [README.md](README.md#-mcp-integration).

## Cross-Platform Compatibility
Designed to work on Windows, macOS, and Linux. Works in Docker/Podman containers. Uses platform-agnostic path handling (`path.join`) and file operations (`fs/promises`).

## Resources

- **Comprehensive Documentation**: [README.md](README.md)
- **Apollo Federation**: https://www.apollographql.com/docs/federation/
- **Model Context Protocol**: https://github.com/modelcontextprotocol
- **mcp-graphql**: https://github.com/blurrah/mcp-graphql
