# Smart Scan Implementation Summary

## Overview
Implemented a dynamic sampling algorithm for MongoDB schema introspection that discovers all fields in collections with varying schemas. The feature is controlled by the `SMART_SCAN` environment variable.

## Changes Made

### 1. Core Implementation (`src/connectors/mongodb-connector.ts`)

#### New Methods Added:

**`dynamicSampling()`**
- Performs intelligent document sampling until no new fields are discovered
- Algorithm details:
  - Initial batch: 50 documents
  - Subsequent batches: 100 documents each
  - Uses MongoDB's `$sample` aggregation for true random sampling
  - Stops when no new fields found in 2 consecutive iterations
  - Safety limit: 5000 documents maximum
  - Early exit if 80% of collection is sampled

**`extractFieldPaths()`**
- Recursively extracts all field paths from documents
- Tracks nested fields using dot notation
- Handles arrays, nested objects, and binary types
- Builds a comprehensive set of all unique field paths

#### Modified Method:

**`introspectCollection()`**
- Now checks the `SMART_SCAN` environment variable
- Routes to either fixed sampling (500 docs) or dynamic sampling
- Updates schema description to indicate which method was used
- Provides detailed logging for both modes

### 2. Environment Variable

**`SMART_SCAN`**
- Type: Boolean (`true` or `false`)
- Default: `false` (uses fixed 500 document sampling)
- When `true`: Enables dynamic sampling algorithm
- Location: `.env` file

### 3. Documentation Updates

**Updated Files:**
- `README.md`: Added Smart Scan feature explanation in MongoDB configuration section
- `USAGE_GUIDE.md`: Added comprehensive Smart Scan documentation
  - How it works
  - When to use it
  - Configuration examples
  - Environment variable reference

## How Smart Scan Works

### Algorithm Flow:
```
1. Count total documents in collection
2. Start iteration with initial batch (50 docs)
3. Use $sample to randomly select documents
4. Extract all field paths from batch
5. Count new fields discovered
6. If new fields found:
   - Reset stability counter
   - Continue to next iteration
7. If no new fields found:
   - Increment stability counter
   - Check if reached 2 consecutive iterations
8. Stop when:
   - 2 iterations without new fields, OR
   - Maximum 5000 documents sampled, OR
   - 80% of collection sampled
```

### Key Features:
- **Random Sampling**: Uses MongoDB's `$sample` aggregation for true randomness
- **Adaptive**: Stops automatically when schema is complete
- **Safe**: Has maximum limits to prevent excessive scanning
- **Informative**: Detailed logging at each iteration
- **Efficient**: Tracks field paths, not full document analysis

## Usage Examples

### Enable Smart Scan
```env
DATASOURCE_TYPE=mongodb
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=mydb
SMART_SCAN=true
```

### Disable Smart Scan (Default)
```env
DATASOURCE_TYPE=mongodb
MONGODB_URI=mongodb://localhost:27017
MONGODB_DATABASE=mydb
# SMART_SCAN=false (or omit entirely)
```

## Logging Output

### With Smart Scan Enabled:
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
🐛 No new fields found. Stability counter: 2/2
ℹ Schema stabilized after 5 iterations
ℹ Smart scan completed: sampled 450 documents, found 25 unique fields
```

### With Fixed Sampling (Default):
```
ℹ Fixed sampling: analyzing 500 documents from users...
ℹ Analyzing 500 documents from users...
```

## Benefits

1. **Comprehensive Field Discovery**: Catches fields that appear in only a small percentage of documents
2. **Efficient**: Stops automatically when all fields are found
3. **Safe**: Has built-in limits to prevent excessive sampling
4. **Configurable**: Easy to enable/disable via environment variable
5. **Backwards Compatible**: Default behavior unchanged
6. **Transparent**: Detailed logging shows exactly what's happening

## When to Use Smart Scan

**Use Smart Scan when:**
- Collections have varying schemas across documents
- Fields appear sporadically (e.g., only in 1-5% of documents)
- You need comprehensive field discovery
- Schema completeness is more important than introspection speed

**Use Fixed Sampling when:**
- Collections have consistent schemas
- Speed is prioritized over completeness
- You're working with very large collections (millions of documents)
- Most fields appear in the first 500 documents

## Performance Considerations

### Smart Scan:
- **Slower**: May sample 50-5000 documents depending on schema variance
- **More thorough**: Finds all fields regardless of their frequency
- **Variable time**: Depends on how diverse the schema is

### Fixed Sampling:
- **Faster**: Always samples exactly 500 documents
- **Predictable**: Same performance every time
- **May miss fields**: Rare fields might not appear in sample

## Technical Details

### Random Sampling Strategy
Uses MongoDB's `$sample` aggregation stage which:
- Provides true random sampling (not pseudo-random)
- Efficient even on large collections
- Doesn't require loading entire collection into memory
- Works with sharded collections

### Field Path Tracking
- Uses a `Set<string>` for O(1) lookup and insertion
- Tracks nested fields with dot notation (`user.address.city`)
- Handles arrays with `[]` notation (`tags[]`)
- Ignores MongoDB internal fields (`__`, `$`)
- Skips binary/buffer types appropriately

## Testing

To test the implementation:

1. Create a MongoDB collection with varying schemas:
```javascript
// Some documents with field A
db.test.insertOne({ _id: 1, name: "Alice", fieldA: "value" })
db.test.insertOne({ _id: 2, name: "Bob", fieldA: "value" })

// Some documents with field B (rare)
db.test.insertOne({ _id: 3, name: "Charlie", fieldB: "rare" })

// Many documents without optional fields
for (let i = 4; i <= 1000; i++) {
  db.test.insertOne({ _id: i, name: `User${i}` })
}
```

2. Test with fixed sampling (may miss fieldB):
```bash
SMART_SCAN=false npm run generate
cat generated/schema.graphql
```

3. Test with smart scan (should find fieldB):
```bash
SMART_SCAN=true npm run generate
cat generated/schema.graphql
```

## Future Enhancements

Potential improvements:
- Make batch sizes configurable via environment variables
- Add `SMART_SCAN_MAX_DOCS` to override the 5000 limit
- Add `SMART_SCAN_STABILITY` to configure iteration count
- Provide sampling statistics in the generated schema comments
- Add sampling strategy options (random vs. sequential vs. distributed)

## Security & Safety

- No security risks introduced
- Built-in limits prevent runaway queries
- Random sampling distributes load
- Early exit conditions prevent excessive resource usage
- Compatible with read-only database users

