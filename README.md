# OpenGraphQL

A lean, powerful tool that automates Apollo GraphQL subgraph creation from various data sources including MongoDB, PostgreSQL, MySQL, and REST APIs. Features a beautiful web UI for easy configuration.

## Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Configuration](#-configuration)
- [Usage](#-usage)
- [MCP Integration](#-mcp-integration)
- [Container Support](#-container-support)
- [Cross-Platform Compatibility](#-cross-platform-compatibility)
- [Examples](#-examples)
- [How It Works](#-how-it-works)
- [Development](#-development)
- [Troubleshooting](#-troubleshooting)

## ✨ Features

- **🖥️ Web UI**: Beautiful, modern frontend for configuring and generating subgraphs
- **Multi-Source Support**: MongoDB, PostgreSQL, MySQL, and REST APIs
- **Automatic Schema Introspection**: Analyzes data sources and generates GraphQL schemas
- **Smart Scan for MongoDB**: Intelligent dynamic sampling that discovers all fields, even in collections with varying schemas
- **Nested Types Support**: Automatically discovers and creates proper GraphQL types for nested MongoDB objects
- **Apollo Federation Ready**: Built-in support for Apollo Federation v2
- **MCP Integration**: AI assistant integration via Model Context Protocol
- **Environment-Based Configuration**: All configuration via .env file
- **Cross-Platform Compatible**: Works on Windows, macOS, and Linux
- **Zero Interactive Prompts**: Perfect for CI/CD and containers
- **Type-Safe**: Built with TypeScript

## 📦 Installation

```bash
# Clone the repository
git clone <repository-url>
cd OpenGraphQL

# Install backend dependencies
npm install

# Install frontend dependencies
cd frontend && npm install && cd ..
```

## 🚀 Quick Start

### Option 1: Using the Web UI (Recommended)

The easiest way to use OpenGraphQL is through the web interface.

#### Run Locally (Development)

**Terminal 1 - Start the API server:**
```bash
npm run api
```

**Terminal 2 - Start the frontend:**
```bash
npm run frontend
```

Or run both concurrently:
```bash
npm run dev:full
```

Then open http://localhost:3000 in your browser.

#### Run with Containers (Production)

```bash
# Build and start with Podman
podman-compose up --build

# Or with Docker
docker compose up --build
```

Then open http://localhost:3000 in your browser.

### Option 2: Using the CLI

#### 1. Create .env File

Copy `.env.example` to `.env` and configure your data source:

```env
DATASOURCE_TYPE=mongodb
DATASOURCE_NAME=mongodb
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=mydb
SERVER_PORT=4000
```

#### 2. Run the Server

```bash
npm run serve
```

That's it! Your GraphQL server is running at `http://localhost:4000`

**Open Apollo Sandbox** in your browser to test queries immediately!

## 🖥️ Web UI Guide

The OpenGraphQL web interface provides an intuitive way to:

1. **Connect to your data source** - Enter connection details and test connectivity
2. **Browse databases/collections** - Select which databases and tables/collections to include
3. **Generate subgraph** - Automatically create and start your GraphQL server
4. **Access Apollo Sandbox** - One-click access to explore your new GraphQL API

### Supported Data Sources

| Data Source | Features |
|-------------|----------|
| **MongoDB** | URI connection, database selection, collection picker |
| **PostgreSQL** | Host/port/credentials, SSL support, schema selection, table picker |
| **MySQL** | Host/port/credentials, database selection, table picker |
| **REST API** | Base URL, auth token, custom endpoints configuration |

### Web UI Screenshots

The landing page presents three options:
- **MongoDB** - Connect to MongoDB databases
- **SQL** - Choose between PostgreSQL or MySQL
- **REST API** - Wrap existing REST endpoints

## 🐳 Container Support (Podman/Docker)

OpenGraphQL includes full container support for both development and production.

### Quick Start with Containers

```bash
# Build and start everything
npm run container:dev

# Or run in background
npm run container:up

# View logs
npm run container:logs

# Stop containers
npm run container:down

# Restart
npm run container:restart
```

### Container Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Host Machine                          │
│                                                          │
│  ┌──────────────┐     ┌──────────────┐                  │
│  │   Frontend   │     │     API      │                  │
│  │   (nginx)    │────▶│   (Node.js)  │                  │
│  │  Port 3000   │     │  Port 3001   │                  │
│  └──────────────┘     └──────┬───────┘                  │
│                              │                           │
│                              ▼                           │
│                    ┌──────────────────┐                 │
│                    │ GraphQL Subgraph │                 │
│                    │    Port 4000     │                 │
│                    └──────────────────┘                 │
└─────────────────────────────────────────────────────────┘
```

### Ports

| Service | Port | Description |
|---------|------|-------------|
| Frontend | 3000 | Web UI (nginx) |
| API | 3001 | Backend API server |
| GraphQL | 4000 | Generated subgraph server |

### Container Files

```
OpenGraphQL/
├── Containerfile.api      # API server container
├── compose.yaml           # Podman/Docker compose config
├── .dockerignore          # Files to exclude from build
└── frontend/
    ├── Containerfile      # Frontend container (multi-stage with nginx)
    ├── nginx.conf         # Nginx config with API proxy
    └── .dockerignore      # Frontend exclusions
```

### Manual Container Commands

**Using Podman:**
```bash
# Build images
podman-compose build

# Start services
podman-compose up -d

# View logs
podman-compose logs -f

# Stop services
podman-compose down
```

**Using Docker:**
```bash
# Build images
docker compose build

# Start services
docker compose up -d

# View logs
docker compose logs -f

# Stop services
docker compose down
```

### Volume Mounts

| Path | Description |
|------|-------------|
| `./generated` | Persists generated GraphQL schemas |
| `./.env` | Environment configuration (read-only) |

## 🛠️ NPM Scripts Reference

### Development Scripts

```bash
npm run api              # Start API server (port 3001)
npm run frontend         # Start frontend dev server (port 3000)
npm run dev:full         # Start both API and frontend concurrently
npm run frontend:install # Install frontend dependencies
```

### CLI Scripts

```bash
npm run build            # Build TypeScript
npm run dev              # Development mode with watch
npm run generate         # Generate schema from .env
npm run serve            # Start GraphQL server from .env
npm run test             # Test data source connections
```

### Container Scripts

```bash
npm run container:build   # Build container images
npm run container:up      # Start containers in background
npm run container:down    # Stop and remove containers
npm run container:logs    # Follow container logs
npm run container:restart # Restart containers
npm run container:dev     # Build and start (foreground)
```

## ⚙️ Configuration

All configuration is done via environment variables in your `.env` file.

### Required Variables

| Variable | Description | Values |
|----------|-------------|---------|
| `DATASOURCE_TYPE` | Type of data source | `mongodb`, `postgres`, `mysql`, `rest` |
| `DATASOURCE_NAME` | Name for your data source | Any string (used in query names) |

### MongoDB Configuration

When `DATASOURCE_TYPE=mongodb`:

```env
DATASOURCE_TYPE=mongodb
DATASOURCE_NAME=mongodb
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=mydb

# Optional: Specific collections to introspect (comma-separated)
MONGODB_COLLECTIONS=users,products,orders

# Optional: Enable smart scanning for comprehensive field discovery (default: false)
SMART_SCAN=true
```

**Smart Scan Feature:**
- **Default (SMART_SCAN=false)**: Samples 500 documents per collection
- **Smart Scan (SMART_SCAN=true)**: Dynamically samples until all fields are discovered
  - Uses random sampling for diverse coverage
  - Stops when no new fields found in 2 consecutive iterations
  - Maximum 5000 documents (safety limit)
  - Ideal for collections with varying schemas or sparse fields

### PostgreSQL Configuration

When `DATASOURCE_TYPE=postgres`:

```env
DATASOURCE_TYPE=postgres
DATASOURCE_NAME=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=mydb
POSTGRES_USER=postgres
POSTGRES_PASSWORD=your_password
POSTGRES_SCHEMA=public

# Optional: Specific tables to introspect (comma-separated)
POSTGRES_TABLES=users,products,orders
```

### MySQL Configuration

When `DATASOURCE_TYPE=mysql`:

```env
DATASOURCE_TYPE=mysql
DATASOURCE_NAME=mysql
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=mydb
MYSQL_USER=root
MYSQL_PASSWORD=your_password

# Optional: Specific tables to introspect (comma-separated)
MYSQL_TABLES=users,products,orders
```

### REST API Configuration

When `DATASOURCE_TYPE=rest`:

```env
DATASOURCE_TYPE=rest
DATASOURCE_NAME=api
REST_BASE_URL=https://api.example.com
REST_AUTH_TOKEN=your_bearer_token

# Required: Endpoints as JSON array
REST_ENDPOINTS=[{"path":"/users","method":"GET","queryName":"users"},{"path":"/posts","method":"GET","queryName":"posts"}]

# Optional: Custom headers as JSON
REST_HEADERS={"X-Custom-Header":"value"}
```

### Server Configuration

```env
SERVER_PORT=4000
OUTPUT_DIR=./generated
API_PORT=3001

# Optional: Apollo Federation
APOLLO_GRAPH_REF=my-graph@current
APOLLO_KEY=service:my-graph:your-api-key

# Optional: Debug mode
DEBUG=true
```

## 🔬 Smart Scan Feature (MongoDB)

### Overview

Smart Scan is an intelligent sampling algorithm for MongoDB collections that dynamically discovers all fields, even those that appear sporadically. This is crucial for collections with varying schemas where different documents may have different field sets.

### How It Works

The algorithm uses an adaptive approach:

1. **Initial Sampling**: Starts with 50 random documents
2. **Iterative Sampling**: Continues sampling in batches of 100 documents
3. **Field Tracking**: Monitors unique field paths discovered in each iteration
4. **Automatic Termination**: Stops when no new fields found in 2 consecutive iterations
5. **Safety Limits**: 
   - Maximum 5000 documents
   - Early exit if 80% of collection sampled

### When to Use

**Use Smart Scan when:**
- Collections have varying schemas across documents
- Fields appear sporadically (e.g., only in 1-5% of documents)
- Schema completeness is more important than introspection speed
- Working with heterogeneous document structures

**Use Fixed Sampling (default) when:**
- Collections have consistent schemas
- Speed is prioritized over completeness
- Working with very large collections (millions of documents)
- Most fields appear in the first 500 documents

### Performance Comparison

| Mode | Speed | Completeness | Documents Sampled | Best For |
|------|-------|--------------|-------------------|----------|
| **Fixed Sampling** | Fast | Good | Exactly 500 | Consistent schemas |
| **Smart Scan** | Variable | Excellent | 50-5000 | Varying schemas |

### Example Output

**With Smart Scan enabled:**
```
ℹ Smart scan enabled for users...
ℹ Collection users has 10000 total documents
ℹ Starting dynamic sampling for users...
🐛 Iteration 1: sampled 50 docs, found 15 new fields (total: 15 unique fields)
🐛 Iteration 2: sampled 100 docs, found 8 new fields (total: 23 unique fields)
🐛 Iteration 3: sampled 100 docs, found 2 new fields (total: 25 unique fields)
🐛 Iteration 4: sampled 100 docs, found 0 new fields (total: 25 unique fields)
🐛 No new fields found. Stability counter: 1/2
🐛 Iteration 5: sampled 100 docs, found 0 new fields (total: 25 unique fields)
ℹ Schema stabilized after 5 iterations
✓ Smart scan completed: sampled 450 documents, found 25 unique fields
```

### Technical Details

**Random Sampling Strategy:**
- Uses MongoDB's `$sample` aggregation stage for true random sampling
- Efficient even on large collections (no full collection scan)
- Works with sharded collections
- Provides diverse document coverage

**Field Path Tracking:**
- Tracks nested fields with dot notation (`user.address.city`)
- Handles arrays with `[]` notation (`tags[]`)
- Ignores MongoDB internal fields (`__`, `$`)
- Uses `Set<string>` for O(1) lookup performance

**Safety Features:**
- Built-in maximum of 5000 documents
- Early exit conditions prevent excessive resource usage
- Random sampling distributes database load
- Compatible with read-only database users

### Testing Smart Scan

Create a test collection with varying schemas:

```javascript
// MongoDB shell
db.test.insertOne({ _id: 1, name: "Alice", fieldA: "common" })
db.test.insertOne({ _id: 2, name: "Bob", fieldA: "common" })
db.test.insertOne({ _id: 3, name: "Charlie", fieldB: "rare" })

// Add many documents without optional fields
for (let i = 4; i <= 1000; i++) {
  db.test.insertOne({ _id: i, name: `User${i}` })
}
```

**Test fixed sampling (may miss `fieldB`):**
```bash
SMART_SCAN=false npm run generate
cat generated/schema.graphql
```

**Test smart scan (should find `fieldB`):**
```bash
SMART_SCAN=true npm run generate
cat generated/schema.graphql
```

## 🎯 Usage

### Start the GraphQL Server

```bash
npm run serve
```

Options:
- `-p, --port <number>`: Override port from .env
- `--with-mcp`: Auto-start MCP server alongside GraphQL server

Examples:
```bash
npm run serve --port 5000
npm run serve:mcp  # Start with MCP server
```

### Generate Schema Files

Generate GraphQL schema, resolvers, and server files without starting the server:

```bash
npm run generate
```

Options:
- `-o, --output <path>`: Override output directory from .env
- `-p, --port <number>`: GraphQL server port for MCP config (default: 4000)
- `--no-mcp`: Skip MCP configuration generation

Examples:
```bash
npm run generate --output ./my-schema
tsx src/cli.ts generate --no-mcp  # Skip MCP config
```

This creates:
- `generated/schema.graphql` - GraphQL type definitions
- `generated/resolvers.ts` - Generated resolvers
- `generated/server.ts` - Apollo Server setup
- `generated/datasources.json` - Data source metadata
- `generated/mcp-config.yaml` - MCP configuration (if enabled)
- `generated/.env.mcp` - MCP environment variables
- `generated/claude-desktop-config.json` - Claude Desktop config snippet
- `generated/start-mcp-server.sh` - Executable MCP startup script

### Test Connections

Test your data source connections without starting the server:

```bash
npm run test
```

## 🤖 MCP Integration

### What is MCP?

The Model Context Protocol (MCP) is an open standard developed by Anthropic that enables AI assistants to securely connect to data sources. This tool automatically generates MCP configurations for your GraphQL schema.

### Features

- **Automatic Configuration**: MCP config is automatically generated when you generate or serve schemas
- **Zero Reconfiguration**: Schema changes are automatically reflected in the MCP configuration
- **Dynamic Introspection**: MCP server uses introspection to discover schema changes at runtime
- **Claude Desktop Ready**: Includes pre-generated configuration snippets for immediate use

### Quick Start with MCP

#### 1. Generate Schema with MCP Config

```bash
npm run generate
```

This automatically creates:
- MCP configuration files
- Claude Desktop config snippet
- Startup scripts

#### 2. Start Your GraphQL Server

```bash
npm run serve
```

#### 3. Start MCP Server

**Option A: Separate Terminal**
```bash
npm run mcp:start
```

**Option B: Auto-start with GraphQL Server**
```bash
npm run serve:mcp
```

#### 4. Configure Claude Desktop

Copy the configuration from `generated/claude-desktop-config.json` into your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
**Linux**: `~/.config/Claude/claude_desktop_config.json`

Example configuration:

```json
{
  "mcpServers": {
    "graphql-mongodb": {
      "command": "npx",
      "args": ["-y", "mcp-graphql"],
      "env": {
        "ENDPOINT": "http://localhost:4000/",
        "ALLOW_MUTATIONS": "false"
      }
    }
  }
}
```

Restart Claude Desktop to apply the configuration.

### MCP Client Compatibility

Your generated MCP server works with:

#### Claude Desktop
- **Status**: Configured and ready to use
- **How to use**: Start servers, restart Claude Desktop, and query your schema!

#### Cursor IDE
- **Setup**: Add to `~/.cursor/mcp.json` or `~/.cursor/mcp_settings.json`
- **How to use**: Ask Cursor's AI to query your GraphQL schema using natural language

#### VS Code with Continue.dev
- **Setup**: Configure in `~/.continue/config.json`
- **Install**: [Continue.dev extension](https://marketplace.visualstudio.com/items?itemName=Continue.continue)

#### Custom Applications
Use the MCP SDK for Node.js or Python to build custom integrations.

### MCP Advanced Configuration

#### Enable Mutations

Edit `generated/.env.mcp`:

```bash
ENDPOINT=http://localhost:4000/
ALLOW_MUTATIONS=true
```

#### Add Authentication Headers

```bash
ENDPOINT=http://localhost:4000/
ALLOW_MUTATIONS=false
HEADERS={"Authorization": "Bearer YOUR_TOKEN"}
```

### Auto-Reconfiguration

When you switch data sources and regenerate:

```bash
# Change data source
vim .env

# Regenerate (MCP config updates automatically)
npm run generate

# MCP server now points to new schema - zero manual config needed!
```

## 🐳 Container Support (Podman/Docker)

The tool works seamlessly in containers.

### Using Podman

Build image:
```bash
podman build -t apollo-subgraph-gen .
```

Run with .env file:
```bash
podman run --env-file .env -p 4000:4000 apollo-subgraph-gen serve
```

### Using Docker

Build image:
```bash
docker build -t apollo-subgraph-gen .
```

Run with .env file:
```bash
docker run --env-file .env -p 4000:4000 apollo-subgraph-gen serve
```

### Docker with MCP

```dockerfile
FROM node:20

WORKDIR /app
COPY . .
RUN npm install

# Generate schema and MCP config
RUN npm run generate

# Start both servers
CMD ["npm", "run", "serve:mcp"]
```

## 🖥️ Cross-Platform Compatibility

This tool is designed to work consistently across all operating systems:

### Windows
```powershell
# PowerShell
npm run serve

# Command Prompt
npm run serve
```

### macOS/Linux
```bash
npm run serve
```

### Environment Variables on Different Platforms

**Windows PowerShell:**
```powershell
$env:DATASOURCE_TYPE="mongodb"
npm run serve
```

**Windows Command Prompt:**
```cmd
set DATASOURCE_TYPE=mongodb
npm run serve
```

**macOS/Linux/Git Bash:**
```bash
export DATASOURCE_TYPE=mongodb
npm run serve
```

**Best Practice:** Use a `.env` file for all platforms (recommended)

## 📝 Examples

### Example 1: MongoDB

`.env`:
```env
DATASOURCE_TYPE=mongodb
DATASOURCE_NAME=mongodb
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=ecommerce
MONGODB_COLLECTIONS=users,products
SMART_SCAN=true  # Enable smart scanning for complete field discovery
SERVER_PORT=4000
```

### Example 2: PostgreSQL

`.env`:
```env
DATASOURCE_TYPE=postgres
DATASOURCE_NAME=postgres
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=warehouse
POSTGRES_USER=admin
POSTGRES_PASSWORD=secret123
POSTGRES_SCHEMA=public
SERVER_PORT=4000
```

### Example 3: REST API

`.env`:
```env
DATASOURCE_TYPE=rest
DATASOURCE_NAME=api
REST_BASE_URL=https://jsonplaceholder.typicode.com
REST_ENDPOINTS=[{"path":"/users","method":"GET","queryName":"users"},{"path":"/posts","method":"GET","queryName":"posts"}]
SERVER_PORT=4000
```

### Example 4: Switching from MongoDB to PostgreSQL with MCP

```bash
# 1. Update .env to use PostgreSQL
echo "DATASOURCE_TYPE=postgres" > .env
echo "POSTGRES_HOST=localhost" >> .env
echo "POSTGRES_DATABASE=mydb" >> .env
# ... other postgres config

# 2. Regenerate everything (MCP config updates automatically)
npm run generate

# 3. Start servers
npm run serve  # Terminal 1
npm run mcp:start  # Terminal 2

# MCP server now points to new PostgreSQL schema - no manual config needed!
```

## 🔍 How It Works

1. **Load Configuration**: Reads from .env file
2. **Connect**: Establishes connection to data source
3. **Introspect**: Analyzes schema/structure
   - MongoDB: Samples documents to infer schema, creates nested types
     - Fixed sampling: 500 documents (default)
     - Smart scan: Dynamic sampling until all fields discovered
   - SQL: Queries information schema
   - REST: Analyzes response structure
4. **Generate**: Creates GraphQL schema and resolvers
5. **Serve**: Starts Apollo Federation-ready server
6. **MCP Config**: Auto-generates MCP configuration for AI integration

### Type Mapping

The tool intelligently maps data source types to GraphQL types:

#### MongoDB
- ObjectId → ID
- Numbers > 2^31-1 → Float (handles timestamps)
- Numbers ≤ 2^31-1 → Int
- Nested objects → Custom GraphQL types
- Binary data → JSON

#### SQL
- Primary keys → ID
- Integer types → Int
- Numeric/Decimal → Float
- Text types → String
- Boolean types → Boolean

### Nested Type Handling (MongoDB)

MongoDB documents with nested objects are introspected to create separate GraphQL types:
- Main entity gets `@key` directive for Federation
- Nested types are regular GraphQL types without `@key`
- Fields reference nested types: `address: Address` instead of `JSON`

Example:

```javascript
// MongoDB document
{
  _id: "123",
  title: "Movie",
  imdb: {
    rating: 8.5,
    votes: 1000
  }
}
```

```graphql
# Generated GraphQL schema
type Movie @key(fields: "_id") {
  _id: ID!
  title: String
  imdb: MovieImdb
}

type MovieImdb {
  rating: Float
  votes: Int
}
```

## 📊 Generated GraphQL Schema

Queries follow the pattern: `{dataSourceName}_{entityName}`

**Example for MongoDB:**
```graphql
type Query {
  mongodb_user(_id: ID!): User
  mongodb_users(limit: Int = 100, offset: Int = 0, filter: UserFilter): [User!]!
}

type User @key(fields: "_id") {
  _id: ID!
  name: String
  email: String
}

input UserFilter {
  _id: ID
  name: String
  email: String
}
```

## 🖥️ Cross-Platform Compatibility

This tool is designed to work consistently across all operating systems:

### Windows
```powershell
# PowerShell
npm run dev:full

# Command Prompt
npm run dev:full
```

### macOS/Linux
```bash
npm run dev:full
```

## 📁 Project Structure

```
OpenGraphQL/
├── src/
│   ├── api/                      # API server for frontend
│   │   └── index.ts
│   ├── cli.ts                    # CLI entry point
│   ├── index.ts                  # Programmatic API
│   ├── types/                    # TypeScript types
│   ├── connectors/               # Data source connectors
│   │   ├── mongodb-connector.ts
│   │   ├── postgres-connector.ts
│   │   ├── mysql-connector.ts
│   │   └── rest-connector.ts
│   ├── generator/                # Schema generation
│   │   ├── schema-generator.ts
│   │   └── resolver-generator.ts
│   ├── server/                   # Apollo server
│   │   └── apollo-server.ts
│   ├── core/                     # Core logic
│   │   ├── subgraph-generator.ts
│   │   └── config-loader.ts
│   └── utils/                    # Utilities
│       ├── logger.ts
│       └── type-mapper.ts
├── frontend/                     # React frontend
│   ├── src/
│   │   ├── components/           # React components
│   │   │   ├── LandingPage.tsx
│   │   │   ├── MongoDBForm.tsx
│   │   │   ├── SQLForm.tsx
│   │   │   ├── RESTForm.tsx
│   │   │   └── SuccessPage.tsx
│   │   ├── styles/
│   │   ├── App.tsx
│   │   └── main.tsx
│   ├── Containerfile             # Frontend container
│   ├── nginx.conf                # Nginx configuration
│   └── package.json
├── generated/                    # Generated schemas
├── Containerfile.api             # API container
├── compose.yaml                  # Container orchestration
└── package.json
```

## 🔐 Security Best Practices

- **Never commit `.env` files** to version control
- Store `.env.example` without real credentials
- Use environment-specific .env files (`.env.development`, `.env.production`)
- Rotate credentials regularly
- Use read-only database users when possible
- Disable MCP mutations in production (`ALLOW_MUTATIONS=false`)

## 🐛 Troubleshooting

### Debug Mode

Enable detailed logging to diagnose issues:

```env
DEBUG=true
```

Then run your command:
```bash
DEBUG=true npm run serve
```

### Common Issues

**Cannot connect to API:**
- Ensure API server is running on port 3001
- Check `npm run api` output for errors
- Verify no firewall blocking the port

**Frontend not loading:**
- Ensure frontend is running on port 3000
- Check `npm run frontend` output for errors
- Clear browser cache

**Container issues:**
- Check logs: `npm run container:logs`
- Ensure ports 3000, 3001, 4000 are available
- Verify `.env` file exists

**Connection errors:**
- Test connection: `npm run test`
- Verify credentials in `.env`
- Check database is running and accessible

**GraphQL errors:**
- Check `generated/schema.graphql` for the generated schema
- Enable DEBUG mode for detailed error messages

## 📄 License

MIT

## 🙏 Resources

- [Apollo Federation Documentation](https://www.apollographql.com/docs/federation/)
- [GraphQL Specification](https://graphql.org/)
- [Model Context Protocol](https://github.com/modelcontextprotocol)
- [mcp-graphql](https://github.com/blurrah/mcp-graphql)
- [Claude Desktop](https://claude.ai/download)

## 🎯 Support

For issues and questions, please open an issue on GitHub.

---

**Built with ❤️ for the GraphQL community**
