# MongoDB Schema Generator Script

A standalone script to generate GraphQL schemas from MongoDB collections by introspecting and sampling documents.

## Features

- **Automatic Schema Generation**: Analyzes MongoDB collections and generates GraphQL type definitions
- **Nested Type Support**: Automatically creates nested types for complex object structures
- **Type Inference**: Intelligently maps MongoDB BSON types to GraphQL types
- **Configurable Sampling**: Control how many documents to sample per collection
- **Multiple Output Formats**: Export as JSON, GraphQL SDL, or both
- **Flexible Configuration**: Use CLI arguments or environment variables

## Installation

No additional installation required if you're already in the OpenGraphQL project.

## Usage

### Basic Usage

```bash
# Generate schema for a database
ts-node scripts/generate-mongodb-schema.ts --database mydb

# Using environment variables
MONGODB_URI=mongodb://localhost:27017 MONGODB_DATABASE=mydb ts-node scripts/generate-mongodb-schema.ts
```

### Advanced Usage

```bash
# Specify MongoDB URI and database
ts-node scripts/generate-mongodb-schema.ts \
  --uri mongodb://localhost:27017 \
  --database mydb

# Generate schema for specific collections only
ts-node scripts/generate-mongodb-schema.ts \
  --database mydb \
  --collections users,posts,comments

# Sample more documents for better accuracy
ts-node scripts/generate-mongodb-schema.ts \
  --database mydb \
  --sample-size 1000

# Save output to files
ts-node scripts/generate-mongodb-schema.ts \
  --database mydb \
  --output schema.graphql

# JSON output only
ts-node scripts/generate-mongodb-schema.ts \
  --database mydb \
  --output-format json \
  --output schema.json

# GraphQL SDL output only
ts-node scripts/generate-mongodb-schema.ts \
  --database mydb \
  --output-format graphql \
  --output schema.graphql
```

## Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `--uri <uri>` | MongoDB connection URI | `mongodb://localhost:27017` |
| `--database, --db <name>` | Database name | `test` |
| `--collections <list>` | Comma-separated list of collections to introspect | All collections |
| `--sample-size <n>` | Number of documents to sample per collection | `500` |
| `--output-format <fmt>` | Output format: `json`, `graphql`, or `both` | `both` |
| `--output, -o <file>` | Output file path | Console output |
| `--help, -h` | Show help message | - |

## Environment Variables

| Variable | Description |
|----------|-------------|
| `MONGODB_URI` | MongoDB connection URI |
| `MONGODB_DATABASE` | Database name |

## Output Formats

### JSON Format

The JSON format includes complete schema information with metadata:

```json
[
  {
    "name": "User",
    "fields": [
      {
        "name": "_id",
        "type": "ID",
        "isArray": false,
        "isNullable": false,
        "isRequired": true
      },
      {
        "name": "name",
        "type": "String",
        "isArray": false,
        "isNullable": true
      }
    ],
    "description": "Collection: users (sampled 500 documents)"
  }
]
```

### GraphQL SDL Format

The GraphQL format outputs standard GraphQL Schema Definition Language:

```graphql
# Generated GraphQL Schema from MongoDB
# Generated at: 2025-01-17T...

scalar JSON

# Collection: users (sampled 500 documents)
type User {
  _id: ID!
  name: String
  email: String
  createdAt: String
}
```

## How It Works

1. **Connection**: Connects to MongoDB using the provided URI and database
2. **Collection Discovery**: Lists all collections (or uses provided list)
3. **Document Sampling**: Samples up to N documents per collection (default: 500)
4. **Type Analysis**:
   - Analyzes each field across all sampled documents
   - Infers GraphQL types from MongoDB BSON types
   - Detects nested objects and creates separate types
   - Handles arrays, nullability, and type conflicts
5. **Schema Generation**: Creates EntitySchema objects with complete type information
6. **Output**: Exports as JSON and/or GraphQL SDL

## Type Mapping

| MongoDB Type | GraphQL Type |
|--------------|--------------|
| ObjectId | ID |
| String | String |
| Number (integer) | Int |
| Number (float) | Float |
| Boolean | Boolean |
| Date | String |
| Array | [Type] |
| Object | Nested Type or JSON |
| Binary/Buffer | JSON |
| null/undefined | Nullable |

## Nested Type Generation

When the script encounters nested objects, it automatically creates separate GraphQL types:

```javascript
// MongoDB Document
{
  _id: ObjectId("..."),
  name: "John",
  address: {
    street: "123 Main St",
    city: "New York"
  }
}

// Generated GraphQL Types
type User {
  _id: ID!
  name: String
  address: UserAddress
}

type UserAddress {
  street: String
  city: String
}
```

## Examples

### Example 1: Quick Schema Generation

```bash
ts-node scripts/generate-mongodb-schema.ts --database movies
```

Output:
```
MongoDB Schema Generator
========================

URI: mongodb://localhost:27017
Database: movies

🔍 Introspecting 3 collections...

  ✓ movies: 12 fields, 2 nested types
  ✓ actors: 8 fields, 0 nested types
  ✓ reviews: 6 fields, 1 nested types

✓ Generated 9 entity schemas

--- GraphQL Schema ---

# Generated GraphQL Schema from MongoDB
...
```

### Example 2: Export to Files

```bash
ts-node scripts/generate-mongodb-schema.ts \
  --database ecommerce \
  --collections products,orders,customers \
  --output ecommerce-schema.graphql
```

This will create:
- `ecommerce-schema.json` - JSON format
- `ecommerce-schema.graphql` - GraphQL SDL format

### Example 3: Use in Another Script

```typescript
import { MongoDBSchemaGenerator } from './scripts/generate-mongodb-schema';

async function generateSchema() {
  const generator = new MongoDBSchemaGenerator({
    uri: 'mongodb://localhost:27017',
    database: 'mydb',
    sampleSize: 1000,
  });

  await generator.connect();
  const entities = await generator.generateSchema();

  console.log(generator.toGraphQL(entities));

  await generator.disconnect();
}
```

## Programmatic API

The script exports the following classes and interfaces:

- `MongoDBSchemaGenerator` - Main generator class
- `MongoDBSchemaConfig` - Configuration interface
- `EntitySchema` - Schema entity interface
- `FieldDefinition` - Field definition interface

See the script source code for detailed API documentation.

## Troubleshooting

### Connection Issues

If you encounter connection errors:

```bash
# Test connection first
mongosh mongodb://localhost:27017

# Ensure MongoDB is running
sudo systemctl status mongod  # Linux
brew services list | grep mongodb  # macOS
```

### Empty Collections

The script will warn if collections are empty and create minimal schemas:

```
⚠ Collection users is empty
```

### Type Conflicts

When documents have inconsistent types for the same field, the script uses the most general type:
- Conflicting primitive types → `String`
- Conflicting with object → `JSON`
- Int + Float → `Float`

## Contributing

Feel free to enhance this script with additional features:
- Support for validation rules
- Custom scalar type mapping
- Relationship detection
- Index introspection

## License

Part of the OpenGraphQL project.
