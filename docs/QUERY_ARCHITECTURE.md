# Query Architecture Documentation

This document explains the data flow and querying logic for all major requests in the ecommerce GraphQL service, detailing when Elasticsearch (ES) vs PostgreSQL (DB) is used.

> 📊 **Performance Guide**: See [PERFORMANCE_OPTIMIZATION.md](./PERFORMANCE_OPTIMIZATION.md) for latest optimization changes, benchmarks, and troubleshooting.

---

## Architecture Overview

### Data Stores
- **PostgreSQL**: Source of truth for all data (products, stores, collections, inventory, orders, carts)
- **Elasticsearch**: Read-optimized index for fast product discovery and storefront queries
  - `products_detail_v1`: Denormalized product documents with all display fields
  - `collections_v1`: Collection metadata with product IDs

### Query Strategy
1. **Try ES first** - for fast, cacheable queries
2. **Fallback to DB** - if ES unavailable or data not found
3. **In-memory cache** - application-level caching (60-300s TTL)

---

## Request Flow Breakdown

### 1. Store Page: `publicStoreBySlug`

**Request**: `GET /stores/alice-s-apparel?country=US`

**GraphQL Query**:
```graphql
query {
  publicStoreBySlug(slug: "alice-s-apparel", productLimit: 12, countryCode: "US") {
    store_id
    name
    products { ... }
  }
}
```

**Query Flow**:
```
1. Check in-memory cache (120s TTL)
   └─ Cache miss → continue

2. loadPublicStorefrontStoreBySlugFromSearchIndex()
   Query: ES products_detail_v1
   Filter:
     - store_slug: "alice-s-apparel" (keyword)
     - status: "ACTIVE"
     - country_codes: "US" OR missing
   Sort: updated_at DESC
   Limit: 12
   _source: [product_id, store_id, store_name, title, brand, handle, ...]
   
   ✓ Returns: {store_id, name, products[]}
   └─ Cache result → return

3. Fallback (if ES fails or empty):
   findStoreByNormalizedSlug() → DB query
   Query: SELECT store_id, name FROM Store WHERE slug = 'alice-s-apparel'
   
   Then: loadPublicStorefrontStoreById() → DB query
   Query: SELECT * FROM Product WHERE store_id = X AND status = 'ACTIVE'
```

**Performance**:
- ES hit: ~50-200ms (includes network to ES)
- DB fallback: ~300-500ms (DB query + processing)

---

### 2. Collection Page: `collectionBySlug`

**Request**: `GET /stores/alice-s-apparel/collections/new-arrivals?country=US`

**GraphQL Query**:
```graphql
query {
  collectionBySlug(slug: "new-arrivals", storeId: 1) {
    collection_id
    name
    products(limit: 24, countryCode: "US") { ... }
  }
}
```

**Query Flow**:

#### Part A: Collection Metadata
```
1. Check in-memory cache (120s TTL)
   └─ Cache miss → continue

2. loadCollectionBySlugFromSearchIndex()
   Query: ES collections_v1
   Filter:
     - store_id: 1
     - slug: "new-arrivals"
   
   ✓ Returns: {collection_id, name, slug, ...}
   └─ Cache result → return

3. Fallback (if ES fails):
   Query: DB Collection table
   SELECT * FROM Collection WHERE store_id = 1 AND slug = 'new-arrivals'
```

#### Part B: Collection Products (Field Resolver)
```
1. Check in-memory cache (120s TTL)
   └─ Cache miss → continue

2. For MANUAL collections:
   loadManualCollectionProductsFromSearchIndex()
   Query: ES products_detail_v1
   Filter:
     - collection_ids: [collection_id]
     - status: "ACTIVE"
     - country_codes: "US" OR missing
   Sort: updated_at DESC
   Limit: 24
   
   ✓ Returns: {products[], total}
   
3. For AUTOMATED collections:
   loadProjectedProductsFromSearchIndex()
   - First: Get product IDs from rules evaluation
   - Then: Bulk fetch from ES by product_id
   
4. Fallback (if ES fails):
   - Get CollectionProduct links from DB
   - Fetch Product entities with relations (variants, options, categories)
```

**Performance**:
- ES hit (metadata + products): ~100-300ms
- DB fallback: ~500-1500ms

---

### 3. Product Detail: `publicProductByHandle`

**Request**: `GET /stores/alice-s-apparel/products/classic-cotton-tee?country=US`

**GraphQL Query**:
```graphql
query {
  publicProductByHandle(handle: "classic-cotton-tee", countryCode: "US") {
    product_id
    title
    variants { ... }
    options { ... }
  }
}
```

**Query Flow**:
```
1. Check in-memory cache (300s TTL)
   └─ Cache miss → continue

2. loadPublicProductByHandleFromSearchIndex()
   Query: ES products_detail_v1
   Filter:
     - handle_lower: "classic-cotton-tee" (exact match, keyword)
     - status: "ACTIVE"
     - country_codes: "US" OR missing
   
   ✓ Returns: Full product document
   └─ Cache result → return

3. Fallback (if ES fails):
   Query: DB Product table
   SELECT * FROM Product 
   WHERE handle = 'classic-cotton-tee' AND status = 'ACTIVE'
   (includes relations: variants, options, media, seo)
```

**Performance**:
- ES hit: ~20-100ms
- DB fallback: ~200-400ms

---

### 4. Collections List: `collections`

**Request**: Used by store homepage to fetch all visible collections

**GraphQL Query**:
```graphql
query {
  collections(filter: {store_id: 1, is_visible: true}) {
    collection_id
    name
    slug
    image_url
  }
}
```

**Query Flow**:
```
1. Check in-memory cache (120s TTL)
   └─ Cache miss → continue

2. loadCollectionsFromSearchIndex()
   Query: ES collections_v1
   Filter:
     - store_id: 1
     - is_visible: true
   Sort: updated_at DESC
   Limit: 100
   
   ✓ Returns: Collection[]
   └─ Cache result → return

3. Fallback (if ES empty):
   Query: DB Collection table
   SELECT * FROM Collection 
   WHERE store_id = 1 AND is_visible = true
   ORDER BY position ASC
```

**Performance**:
- ES hit: ~20-80ms
- DB fallback: ~100-200ms

---

### 5. Optimized Store Page (New): `getCollectionsWithProducts`

**Frontend Request**: Store homepage with collection sections

**GraphQL Query**:
```graphql
query {
  collections(filter: {store_id: 1, is_visible: true}) {
    collection_id
    name
    slug
    products(limit: 8, countryCode: "US") {
      product_id
      title
      handle
      price
      image_url
    }
  }
}
```

**Query Flow**:
```
1. Single GraphQL request fetches collections + products
   
2. Collections metadata:
   ES collections_v1 (see flow #4)
   
3. Products field resolver (triggered for EACH collection):
   ES products_detail_v1 (see flow #2B)
   
   Old behavior (N+1): 1 query for collections + N queries for products
   New behavior (batched): 1 query for collections + N queries (BUT in parallel via GraphQL)
```

**Performance**:
- Before: 1-3.5s (serial N+1 queries)
- After: 200-500ms (parallel execution)

---

## When PostgreSQL is ALWAYS Used

Certain operations always hit the database as they require ACID transactions or aren't read-heavy:

### 1. Cart Operations
- `createCart`, `updateCart`, `addToCart`, `removeFromCart`
- **DB Tables**: Cart, CartItem
- **Why**: Requires transactions, inventory checks, real-time consistency

### 2. Order Operations  
- `createOrder`, `updateOrderStatus`
- **DB Tables**: Order, OrderItem, Payment
- **Why**: ACID compliance, financial data integrity

### 3. Inventory Management
- `updateInventory`, `checkAvailability`
- **DB Tables**: Variant (inventory_quantity field)
- **Why**: Real-time stock levels, race condition prevention

### 4. Admin Writes
- `createProduct`, `updateProduct`, `deleteProduct`
- `createCollection`, `updateCollection`
- **DB Tables**: Product, Collection, etc.
- **Why**: Source of truth, triggers ES reindexing

### 5. User/Auth
- `login`, `register`, `updateProfile`
- **DB Tables**: User, Session
- **Why**: Security, session management

---

## Elasticsearch Sync Strategy

### When ES is Updated

**Products Index (`products_detail_v1`)**:
- **Created**: After `createProduct` → `syncPublicProductToSearchIndex(handle)`
- **Updated**: After `updateProduct` → `syncPublicProductToSearchIndex(handle)`
- **Deleted**: After `deleteProduct` → `deletePublicProductFromSearchIndex(handle)`
- **Bulk**: `POST /api/admin/products/reindex` → reindexes all products

**Collections Index (`collections_v1`)**:
- **Created**: After `createCollection` → `syncCollectionToSearchIndex(id)`
- **Updated**: After `updateCollection` → `syncCollectionToSearchIndex(id)`
- **Deleted**: After `deleteCollection` → `deleteCollectionFromSearchIndex(id)`
- **Products Added/Removed**: After `addProducts` / `removeProducts` → syncs both collection doc and product docs
- **Bulk**: `node scripts/index-collections.js` → reindexes all collections

### Sync Mechanism
```javascript
// Synchronous - blocks the mutation response
await esClient.index({
  index: 'products_detail_v1',
  id: documentId,
  document: { ...productData },
  refresh: 'wait_for'  // Wait for index refresh
});
```

**Trade-off**: Mutations ~100-200ms slower, but reads are instant and consistent.

---

## Caching Layers

### 1. In-Memory Application Cache
- **Location**: NestJS service layer
- **TTL**: 
  - Products: 300s (5 min)
  - Stores: 120s (2 min)
  - Collections: 120s (2 min)
- **Invalidation**: Time-based expiry + manual on writes
- **Purpose**: Reduce ES queries for hot data

### 2. Elasticsearch Query Cache
- **Location**: ES node level
- **Enabled by**: Using `filter` context (not `must`)
- **TTL**: Managed by ES (default: until index changes)
- **Purpose**: Cache frequently-run filters

### 3. Request Deduplication
- **Pattern**: In-flight request tracking
- **Implementation**: `Map<cacheKey, Promise<Result>>`
- **Purpose**: Prevent duplicate concurrent queries

---

## Performance Benchmarks

Based on actual production logs with ES server at `52.175.247.13:9200`:

| Query Type | ES (Cold) | ES (Warm) | DB Fallback |
|------------|-----------|-----------|-------------|
| `publicStoreBySlug` | 200-400ms | 50-150ms | 500-800ms |
| `collectionBySlug` | 150-300ms | 20-100ms | 400-700ms |
| `publicProductByHandle` | 80-200ms | 20-80ms | 300-500ms |
| `collections` (list) | 100-200ms | 20-60ms | 200-400ms |
| Store page (optimized) | 200-500ms | 100-300ms | 1.5-3.5s |

**Note**: ~200ms baseline is network latency to remote ES server. For sub-100ms, move ES closer to application.

---

## Migration Scripts

### Initial Setup
```bash
# 1. Index all products
POST /api/admin/products/reindex

# 2. Index all collections  
node scripts/index-collections.js

# 3. Add store_slug to existing products
node scripts/reindex-store-slugs.js
```

### Ongoing Maintenance
- Products: Auto-synced on create/update/delete
- Collections: Auto-synced on create/update/delete
- Full reindex: Run scripts if data corruption or mapping changes

---

## Summary

| Data Type | Primary Source | Index | Query Pattern |
|-----------|----------------|-------|---------------|
| Products (read) | ES | products_detail_v1 | ES first, DB fallback |
| Collections (read) | ES | collections_v1 | ES first, DB fallback |
| Products (write) | PostgreSQL | - | Direct DB |
| Collections (write) | PostgreSQL | - | Direct DB |
| Carts | PostgreSQL | - | Direct DB only |
| Orders | PostgreSQL | - | Direct DB only |
| Inventory | PostgreSQL | - | Direct DB only |
| Users/Auth | PostgreSQL | - | Direct DB only |

**Key Principle**: Use ES for read-heavy discovery queries, PostgreSQL for writes and transactional operations.
