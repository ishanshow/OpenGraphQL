# Apollo Subgraph Generator

A lean, powerful tool that automates Apollo GraphQL subgraph creation from various data sources including MongoDB, PostgreSQL, MySQL, and REST APIs.

## ✨ Features

- **Multi-Source Support**: MongoDB, PostgreSQL, MySQL, and REST APIs
- **Automatic Schema Introspection**: Analyzes data sources and generates GraphQL schemas
- **🆕 Smart Scan for MongoDB**: Intelligent dynamic sampling that discovers all fields, even in collections with varying schemas
- **Nested Types Support**: Automatically discovers and creates proper GraphQL types for nested MongoDB objects
- **Apollo Federation Ready**: Built-in support for Apollo Federation v2
- **Environment-Based Configuration**: All configuration via .env file
- **Cross-Platform Compatible**: Works on Windows, macOS, and Linux
- **Zero Interactive Prompts**: Perfect for CI/CD and containers
- **Type-Safe**: Built with TypeScript

## 📦 Installation

```bash
npm install -g apollo-subgraph-generator
```

Or use locally in your project:

```bash
npm install apollo-subgraph-generator
```

## 🚀 Quick Start

### 1. Create .env File

Copy `.env.example` to `.env` and configure your data source:

```env
DATASOURCE_TYPE=mongodb
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=mydb
SERVER_PORT=4000
```

### 2. Run the Server

```bash
npx subgraph-gen serve
```

That's it! Your GraphQL server is running at `http://localhost:4000`

**Open Apollo Sandbox** in your browser to test queries immediately!

See [TESTING.md](TESTING.md) for detailed testing instructions and example queries.

## ⚙️ Configuration

All configuration is done via environment variables in your `.env` file.

### Required Variables

| Variable | Description | Values |
|----------|-------------|---------|
| `DATASOURCE_TYPE` | Type of data source | `mongodb`, `postgres`, `mysql`, `rest` |

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

# Optional: Apollo Federation
APOLLO_GRAPH_REF=my-graph@current
APOLLO_KEY=service:my-graph:your-api-key
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

**Algorithm Flow:**
```
Count documents → Sample batch → Extract field paths → New fields found?
                       ↑                                      ↓
                       ← Yes: Continue sampling ──────────── No: Increment counter
                       ← Stop if counter reaches 2 ─────────┘
```

### Configuration

Enable via environment variable:

```env
SMART_SCAN=true
```

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
npx subgraph-gen serve
```

Options:
- `-p, --port <number>`: Override port from .env

Example:
```bash
npx subgraph-gen serve --port 5000
```

### Generate Schema Files

Generate GraphQL schema, resolvers, and server files without starting the server:

```bash
npx subgraph-gen generate
```

Options:
- `-o, --output <path>`: Override output directory from .env

Example:
```bash
npx subgraph-gen generate --output ./my-schema
```

This creates:
- `schema.graphql` - GraphQL type definitions
- `resolvers.ts` - Generated resolvers
- `server.ts` - Apollo Server setup
- `datasources.json` - Data source metadata

### Test Connections

Test your data source connections without starting the server:

```bash
npx subgraph-gen test
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
REST_BASE_URL=https://jsonplaceholder.typicode.com
REST_ENDPOINTS=[{"path":"/users","method":"GET","queryName":"users"},{"path":"/posts","method":"GET","queryName":"posts"}]
SERVER_PORT=4000
```

## 🔍 How It Works

1. **Load Configuration**: Reads from .env file
2. **Connect**: Establishes connection to data source
3. **Introspect**: Analyzes schema/structure
   - MongoDB: Samples documents to infer schema
     - Fixed sampling: 500 documents (default)
     - Smart scan: Dynamic sampling until all fields discovered
   - SQL: Queries information schema
   - REST: Analyzes response structure
4. **Generate**: Creates GraphQL schema and resolvers
5. **Serve**: Starts Apollo Federation-ready server

## 📊 Generated GraphQL Schema

Queries follow the pattern: `{dataSourceName}_{entityName}`

**Example for MongoDB:**
```graphql
type Query {
  mongodb_user(id: ID!): User
  mongodb_users(limit: Int, offset: Int): [User!]!
}

type User @key(fields: "_id") {
  _id: ID!
  name: String!
  email: String
}
```

## 🛠️ Development

### Setup

```bash
git clone <repository-url>
cd apollo-subgraph-generator
npm install
```

### Scripts

```bash
npm run dev      # Development mode with watch
npm run build    # Build TypeScript
npm run generate # Generate schema from .env
npm run serve    # Start server from .env
npm run test     # Test connections
```

### Project Structure

```
src/
├── cli.ts                    # CLI entry point
├── index.ts                  # Programmatic API
├── types/                    # TypeScript types
├── connectors/               # Data source connectors
│   ├── mongodb-connector.ts
│   ├── postgres-connector.ts
│   ├── mysql-connector.ts
│   └── rest-connector.ts
├── generator/                # Schema generation
│   ├── schema-generator.ts
│   └── resolver-generator.ts
├── server/                   # Apollo server
│   └── apollo-server.ts
├── core/                     # Core logic
│   ├── subgraph-generator.ts
│   └── config-loader.ts
└── utils/                    # Utilities
    ├── logger.ts
    └── type-mapper.ts
```

## 🔐 Security Best Practices

- **Never commit `.env` files** to version control
- Store `.env.example` without real credentials
- Use environment-specific .env files (`.env.development`, `.env.production`)
- Rotate credentials regularly
- Use read-only database users when possible

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

**Only `_id` field discovered:**
- Enable DEBUG mode to see what's being found
- Verify your collection has documents with data
- Check collection name matches exactly (case-sensitive)
- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed guide

**Connection errors:**
- Test connection: `npm run test`
- Verify credentials in `.env`
- Check database is running and accessible

**GraphQL errors:**
- Check `generated/schema.graphql` for the generated schema
- Enable DEBUG mode for detailed error messages
- See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)

For detailed troubleshooting steps, see **[TROUBLESHOOTING.md](TROUBLESHOOTING.md)**

## 📄 License

MIT

## 🙏 Support

For issues and questions, please open an issue on GitHub.

---

**Built with ❤️ for the GraphQL community**
