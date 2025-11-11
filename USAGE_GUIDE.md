# Complete Usage Guide

## Understanding the Workflow

### What Happens When You Run `npm run serve`?

```
1. Load .env configuration
2. Connect to data source(s)
3. Introspect data source(s)
   └─ Sample documents/tables
   └─ Discover fields and types
4. Generate GraphQL schema
5. Create schema files in generated/
6. Start Apollo Server
7. Open Apollo Sandbox at http://localhost:4000
```

### Generated Files Explained

When you run `serve` or `generate`, these files are created in `generated/` directory:

#### 1. `schema.graphql`
Your complete GraphQL schema with all types and queries.

**Example:**
```graphql
type User @key(fields: "_id") {
  _id: ID!
  name: String!
  email: String
  age: Int
}

type Query {
  mongodb_user(id: ID!): User
  mongodb_users(limit: Int, offset: Int): [User!]!
}
```

#### 2. `datasources.json`
Metadata about introspected entities (for debugging).

**Shows:**
- Data source names
- Entity types discovered
- Field definitions

#### 3. `resolvers.ts`
Template for custom resolvers (the dynamic resolvers are generated at runtime).

#### 4. `server.ts`
Standalone server file if you want to customize the server setup.

---

## Common Workflows

### Workflow 1: Quick Development

**Just want to start coding?**

```bash
# 1. Configure
cp .env.example .env
# Edit .env with your database credentials

# 2. Start
npm run serve

# 3. Open browser
# http://localhost:4000
```

✅ Schema files are automatically generated  
✅ Apollo Sandbox opens automatically  
✅ Start writing queries immediately

### Workflow 2: Check Your Schema First

**Want to see what was generated before starting the server?**

```bash
# 1. Generate only
npm run generate

# 2. Check the schema
cat generated/schema.graphql

# 3. Start server when ready
npm run serve
```

### Workflow 3: CI/CD Pipeline

**Deploying to production?**

```bash
# 1. Test connection
npm run test

# 2. Generate schema
npm run generate

# 3. Serve (with generated files)
npm run serve
```

### Workflow 4: Debugging Issues

**Something not working?**

```bash
# 1. Enable debug mode
echo "DEBUG=true" >> .env

# 2. Test connection first
npm run test

# 3. Start with verbose output
DEBUG=true npm run serve

# 4. Check what was found
cat generated/datasources.json
```

---

## Understanding Query Names

All generated queries follow this pattern:

```
{dataSourceName}_{entityName}
{dataSourceName}_{entityName}s (plural)
```

### Examples

**MongoDB (collection: "users"):**
- `mongodb_user(id: ID!)` - Get single user
- `mongodb_users(limit: Int, offset: Int)` - Get multiple users

**PostgreSQL (table: "orders"):**
- `postgres_order(id: Int!)` - Get single order
- `postgres_orders(limit: Int, offset: Int)` - Get multiple orders

**Custom Data Source Name:**
```env
DATASOURCE_NAME=myapi
```
- `myapi_user(id: ID!)` 
- `myapi_users(...)` 

---

## Introspection Details

### What Gets Introspected?

**MongoDB:**
- Samples up to 500 documents per collection
- Discovers all field names
- Infers types from values
- Handles nested objects (flattens simple ones)
- Marks fields as nullable if they don't appear in all docs

**PostgreSQL/MySQL:**
- Queries information schema
- Gets exact column types
- Discovers foreign keys
- Handles all SQL data types

**REST API:**
- Uses provided endpoint definitions
- Infers types from sample responses (if provided)

### Controlling What Gets Introspected

**MongoDB - Specific Collections:**
```env
MONGODB_COLLECTIONS=users,products,orders
```

**PostgreSQL - Specific Tables:**
```env
POSTGRES_TABLES=users,products,orders
```

**MySQL - Specific Tables:**
```env
MYSQL_TABLES=users,products,orders
```

**Leave empty to introspect ALL:**
```env
# This introspects everything
MONGODB_DATABASE=mydb
```

---

## Debugging Tips

### Check What Was Introspected

```bash
# See the summary
npm run serve
# Look for: 📊 Introspection Summary

# Or check the metadata file
cat generated/datasources.json
```

### Verify Collection Has Data

```bash
# MongoDB
mongosh
use your_database
db.your_collection.findOne()
db.your_collection.countDocuments()
```

### See Exact Fields Discovered

```bash
# Enable debug mode
DEBUG=true npm run serve

# Look for:
# 🐛 Sample document has X keys: [...]
# 🐛 Field map after analysis has X fields
```

### Check Generated Schema

```bash
# View the schema
cat generated/schema.graphql

# Or on Windows
type generated\schema.graphql
```

---

## Server Output Explained

### Normal Output

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Initializing Data Sources
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ℹ Connecting to mongodb (mongodb)...
✓ Connected to mongodb

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Introspecting Data Sources
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ℹ Introspecting 2 collections...
ℹ Analyzing 100 documents from users...
✓ Introspected collection: users (5 fields found)
ℹ Analyzing 50 documents from products...
✓ Introspected collection: products (8 fields found)
✓ Introspected mongodb: 2 entities found

📊 Introspection Summary:
   Data Sources: 1
   Total Entities: 2

   📁 mongodb (mongodb): 2 entities
      └─ User (5 fields)
      └─ Product (8 fields)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Generating Schema Files
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✓ Schema saved to generated/schema.graphql
✓ Resolvers template saved to generated/resolvers.ts
✓ Server file saved to generated/server.ts
✓ Data source info saved to generated/datasources.json
ℹ 💾 Schema files saved to ./generated

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Starting Apollo Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

ℹ Generating GraphQL schema...
ℹ Generating resolvers...
✓ Apollo Server created successfully
✓ 🚀 Server ready at http://localhost:4000/
ℹ 📊 Open Apollo Sandbox at http://localhost:4000/
ℹ 💡 Tip: You can also use any GraphQL client (Postman, Insomnia, etc.)
```

### What Each Symbol Means

- `ℹ` - Information
- `✓` - Success
- `✗` - Error
- `⚠` - Warning
- `🐛` - Debug output (only when DEBUG=true)
- `📊` - Summary/Statistics
- `📁` - Data source/entity
- `🚀` - Server started

---

## Environment Variables Reference

### Required

```env
DATASOURCE_TYPE=mongodb|postgres|mysql|rest
```

### MongoDB

```env
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=mydb
MONGODB_COLLECTIONS=users,products  # Optional
```

### PostgreSQL

```env
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DATABASE=mydb
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password
POSTGRES_SCHEMA=public              # Optional
POSTGRES_TABLES=users,products      # Optional
```

### MySQL

```env
MYSQL_HOST=localhost
MYSQL_PORT=3306
MYSQL_DATABASE=mydb
MYSQL_USER=root
MYSQL_PASSWORD=password
MYSQL_TABLES=users,products         # Optional
```

### REST API

```env
REST_BASE_URL=https://api.example.com
REST_AUTH_TOKEN=bearer_token        # Optional
REST_ENDPOINTS=[{"path":"/users","method":"GET","queryName":"users"}]
REST_HEADERS={"X-Custom":"value"}   # Optional
```

### Server

```env
SERVER_PORT=4000
OUTPUT_DIR=./generated
APOLLO_GRAPH_REF=my-graph@current   # Optional
APOLLO_KEY=service:my-graph:key     # Optional
DEBUG=true                          # Optional
```

---

## Quick Reference

| Command | What It Does | Output |
|---------|-------------|---------|
| `npm run test` | Test data source connections | Connection status only |
| `npm run generate` | Generate schema files | Creates files in `generated/` |
| `npm run serve` | Generate + start server | Creates files + starts server |
| `npm run serve -- --no-generate` | Start server only | Skips file generation |
| `DEBUG=true npm run serve` | Serve with debug output | Verbose logging |

---

## Need More Help?

- **Testing queries:** See [TESTING.md](TESTING.md)
- **Debugging issues:** See [TROUBLESHOOTING.md](TROUBLESHOOTING.md)
- **Configuration details:** See [README.md](README.md)

