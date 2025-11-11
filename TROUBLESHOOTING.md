# Troubleshooting Guide

## Issue: Only `_id` Field Being Discovered

If only the `_id` field is being discovered from your MongoDB collection, try these steps:

### 1. Enable Debug Mode

Add to your `.env` file:
```env
DEBUG=true
```

Then run:
```bash
npm run serve
```

This will show detailed logging including:
- Number of documents sampled
- Field names found in sample documents
- Field map size after analysis

### 2. Check Your Collection

Verify your collection has documents with data:

```bash
# MongoDB Shell
mongosh
use your_database_name
db.your_collection_name.findOne()
db.your_collection_name.count()
```

### 3. Verify Collection Name

Make sure the collection name in your database matches what the tool is looking for.

**In .env:**
```env
MONGODB_COLLECTIONS=users,products
```

The tool will look for collections named exactly `users` and `products` (case-sensitive).

**To introspect all collections**, leave it empty:
```env
# This will introspect all collections
MONGODB_DATABASE=mydb
```

### 4. Common Issues

#### Empty Collection
If your collection is empty, you'll see:
```
⚠ Collection users is empty, creating minimal schema
```

**Solution**: Add some documents to your collection first.

#### Wrong Database
```
✗ Failed to connect to MongoDB
```

**Solution**: Verify your `MONGODB_URI` and `MONGODB_DATABASE` are correct.

#### Connection Issues
```
✗ Failed to connect to MongoDB: MongoServerError: Authentication failed
```

**Solution**: Check your MongoDB URI includes correct credentials:
```env
MONGODB_URI=mongodb://username:password@localhost:27017
```

### 5. Sample Debug Output

**Good Output (fields found):**
```
ℹ Analyzing 100 documents from users...
🐛 Sample document has 5 keys: ["_id", "name", "email", "age", "createdAt"]
🐛 Field map after analysis has 5 fields
ℹ Final schema has 5 fields
✓ Introspected collection: users (5 fields found)
```

**Bad Output (only _id):**
```
ℹ Analyzing 100 documents from users...
🐛 Sample document has 1 keys: ["_id"]
🐛 Field map after analysis has 1 fields
ℹ Final schema has 1 fields
✓ Introspected collection: users (1 fields found)
```

### 6. Manual Collection Check

Create a test script to verify your MongoDB connection:

```javascript
// test-mongo.js
const { MongoClient } = require('mongodb');

async function test() {
  const client = new MongoClient('mongodb://localhost:27017');
  await client.connect();
  const db = client.db('mydb');
  const collection = db.collection('users');
  
  const count = await collection.countDocuments();
  console.log(`Total documents: ${count}`);
  
  const sample = await collection.findOne();
  console.log('Sample document:', JSON.stringify(sample, null, 2));
  console.log('Field names:', Object.keys(sample));
  
  await client.close();
}

test().catch(console.error);
```

Run:
```bash
node test-mongo.js
```

## Issue: CSRF Error When Testing GraphQL Queries

**Error Message:**
```
This operation has been blocked as a potential Cross-Site Request Forgery (CSRF)
```

**Solution**: CSRF protection is now **disabled by default** for easier development. After updating, you can test queries from:

1. **Apollo Sandbox** (Recommended)
   - Open `http://localhost:4000` in your browser
   - Apollo Sandbox will automatically open
   - Test queries directly in the browser

2. **Postman/Insomnia**
   - Set Content-Type to `application/json`
   - Send POST requests to `http://localhost:4000`

3. **cURL**
   ```bash
   curl -X POST http://localhost:4000 \
     -H "Content-Type: application/json" \
     -d '{"query":"{ __typename }"}'
   ```

### Common GraphQL Errors

#### Type Conflicts
```
✗ GraphQL Error: Type "User" already exists
```

**Solution**: Two collections are generating the same type name. Rename one collection or use `DATASOURCE_NAME` to distinguish them.

#### Invalid Schema
```
✗ GraphQL Error: Syntax Error: Expected Name, found }
```

**Solution**: A field name is invalid. Enable DEBUG mode to see which fields are being generated.

#### Federation Errors
```
✗ GraphQL Error: @key directive requires fields argument
```

**Solution**: This is usually auto-handled. Check generated `schema.graphql` file.

## Getting Help

1. **Enable DEBUG mode**: `DEBUG=true` in `.env`
2. **Run the test command**: `npm run test` to verify connections
3. **Check generated schema**: Look at `generated/schema.graphql`
4. **Review logs**: All errors now show full details

## Quick Diagnostic Commands

```bash
# Test connection only
npm run test

# Generate with debug output
DEBUG=true npm run generate

# Serve with debug output
DEBUG=true npm run serve
```

## Still Having Issues?

Open an issue with:
1. Your `.env` configuration (without passwords)
2. Output from `DEBUG=true npm run serve`
3. Sample document from your collection
4. MongoDB version

