# Testing Your GraphQL Server

## Quick Start

After running `npm run serve`, your server will be available at `http://localhost:4000`

## Testing Methods

### 1. Apollo Sandbox (Easiest - Recommended)

**Just open your browser:**
```
http://localhost:4000
```

Apollo Sandbox will automatically load with:
- ✅ Schema explorer
- ✅ Query builder with autocomplete
- ✅ Documentation browser
- ✅ No CSRF issues

**Example Query:**
```graphql
query GetUsers {
  mongodb_users(limit: 10) {
    _id
    name
    email
  }
}
```

### 2. cURL (Command Line)

**Basic introspection query:**
```bash
curl -X POST http://localhost:4000 \
  -H "Content-Type: application/json" \
  -d '{"query":"{ __typename }"}'
```

**Query your data:**
```bash
curl -X POST http://localhost:4000 \
  -H "Content-Type: application/json" \
  -d '{"query":"{ mongodb_users { _id name email } }"}'
```

### 3. Postman

1. Create new **POST** request
2. URL: `http://localhost:4000`
3. Headers: 
   - `Content-Type: application/json`
4. Body (raw JSON):
   ```json
   {
     "query": "{ mongodb_users { _id name email } }"
   }
   ```

### 4. Insomnia

1. Create new **POST** request
2. URL: `http://localhost:4000`
3. Body: Select **GraphQL**
4. Write your query directly

### 5. VS Code REST Client Extension

Create a file `test.http`:

```http
### Get all users
POST http://localhost:4000
Content-Type: application/json

{
  "query": "{ mongodb_users(limit: 10) { _id name email } }"
}

### Get user by ID
POST http://localhost:4000
Content-Type: application/json

{
  "query": "query GetUser($id: ID!) { mongodb_user(id: $id) { _id name email } }",
  "variables": {
    "id": "507f1f77bcf86cd799439011"
  }
}
```

Click "Send Request" above each query.

## Sample Queries

### Introspection (Check Schema)

```graphql
{
  __schema {
    types {
      name
      kind
    }
  }
}
```

### Query All Items

```graphql
{
  mongodb_users(limit: 10) {
    _id
    name
    email
  }
}
```

### Query with Filters

```graphql
{
  mongodb_users(limit: 5, offset: 0) {
    _id
    name
    email
  }
}
```

### Query Single Item by ID

```graphql
query GetUser($id: ID!) {
  mongodb_user(id: $id) {
    _id
    name
    email
  }
}
```

Variables:
```json
{
  "id": "507f1f77bcf86cd799439011"
}
```

## Query Naming Convention

Queries follow this pattern: `{datasourceName}_{entityName}`

**Examples:**
- `mongodb_users` - Get all users from MongoDB
- `mongodb_user` - Get single user from MongoDB
- `postgres_orders` - Get all orders from PostgreSQL
- `postgres_order` - Get single order from PostgreSQL

## Troubleshooting

### Query Returns Empty Array

**Check:**
1. Collection/table has data
2. Collection/table name is correct
3. Field names match your schema

**Debug:**
```bash
DEBUG=true npm run serve
```

### CSRF Error

**Solution:** Already fixed! CSRF protection is disabled by default.

If you still see CSRF errors:
- Make sure you rebuilt: `npm run build`
- Use `Content-Type: application/json` header
- Or use Apollo Sandbox (no headers needed)

### Type Not Found

**Check the generated schema:**
```bash
cat generated/schema.graphql
```

Look for your type definition. If it's missing, the collection might be empty or not introspected.

## Pro Tips

1. **Use Apollo Sandbox** for exploring - it has autocomplete and documentation
2. **Enable DEBUG mode** to see what's being introspected
3. **Check `generated/schema.graphql`** to see all available types and queries
4. **Test connection first**: `npm run test`

## Example Full Workflow

```bash
# 1. Configure
cp .env.example .env
# Edit .env with your MongoDB URI

# 2. Build
npm run build

# 3. Test connection
npm run test

# 4. Start server with debug
DEBUG=true npm run serve

# 5. Open browser
# http://localhost:4000

# 6. Run query in Apollo Sandbox
```

## Need Help?

See [TROUBLESHOOTING.md](TROUBLESHOOTING.md) for detailed debugging steps.

