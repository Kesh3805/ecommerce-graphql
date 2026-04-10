# Documentation Index

## Architecture & Performance

### **[QUERY_ARCHITECTURE.md](./QUERY_ARCHITECTURE.md)** ⭐
Complete documentation of query flows, ES vs DB usage, data stores, and caching strategy. Read this first to understand the system architecture.

**Contents**:
- Request-by-request query flow diagrams
- When Elasticsearch vs PostgreSQL is used
- Data synchronization mechanisms
- Caching layers (in-memory, ES query cache)
- Index structures and mappings

---

### **[PERFORMANCE_OPTIMIZATION.md](./PERFORMANCE_OPTIMIZATION.md)** 🚀
Latest performance optimizations, benchmarks, and troubleshooting guide. Read this if experiencing slow response times.

**Contents**:
- Issues found and fixes applied
- Performance benchmarks (before/after)
- Expected response times per page type
- Deployment checklist
- Troubleshooting slow queries
- Long-term optimization recommendations

---

### **[BACKEND_LEGACY_COMPARISON_AND_ONBOARDING.md](./BACKEND_LEGACY_COMPARISON_AND_ONBOARDING.md)** 🧭
Deep comparison between legacy backend + production dump and the current backend, with a detailed product onboarding flow and table-level write matrix.

**Contents**:
- Legacy vs current backend architecture (DB-wise and performance-wise)
- Schema and query-pattern comparison with migration-oriented mapping
- Exact current onboarding mutation flow and tables used per step
- Consistency guarantees, known gaps, and recommended next improvements
- SQL verification checklist for onboarding data integrity

---

### **[NEON_DB_PRODUCT_ONBOARDING_AND_TABLE_DETAILS.md](./NEON_DB_PRODUCT_ONBOARDING_AND_TABLE_DETAILS.md)** 🗃️
Neon/PostgreSQL-focused database reference for product onboarding, metafields behavior, and complete current table inventory.

**Contents**:
- Whether `Metafield` is connected and how it is used in service layer
- New-product onboarding insert/update table matrix (step-by-step)
- Bulk import table write behavior
- Full TypeORM table inventory across modules (catalog, inventory, cart, order, storefront, user)
- SQL checks for metafield linkage and onboarding validation

---

## Quick Reference

### Performance Expectations

| Page Type | First Load | Cached | Network Conditions |
|-----------|-----------|--------|-------------------|
| Store homepage | 250-500ms | 50-150ms | Good |
| Collection page | 200-350ms | 20-100ms | Good |
| Product page | 200-300ms | 20-80ms | Good |
| Store homepage | 800-1500ms | 200-400ms | Poor (DB fallback) |

**Note**: ~200ms baseline is network latency to remote ES server. For sub-100ms, move ES to same datacenter.

---

### Data Flow Summary

```
Write Flow:
User → GraphQL → Service Layer → PostgreSQL (source of truth)
                                      ↓
                                 Elasticsearch (synced replica)

Read Flow (Storefront):
User → GraphQL → Service Layer → Elasticsearch (primary)
                                      ↓ (if empty/error)
                                 PostgreSQL (fallback)
```

---

### Key Optimizations Applied

1. ✅ **ES Query Optimization**: filter context, _source limiting, track_total_hits optimization
2. ✅ **Store Slug Direct Lookup**: Added store_slug to ES products index
3. ✅ **Collections in ES**: New collections_v1 index for fast metadata lookup
4. ✅ **Frontend N+1 Elimination**: Batched GraphQL queries with field resolvers
5. ✅ **Smart Caching**: In-memory cache + ES query cache + request deduplication

---

### Deployment Checklist

When deploying performance changes:

- [ ] Run `npm run build` to compile latest code
- [ ] Run migration scripts if needed (reindex-store-slugs.js, index-collections.js)
- [ ] Restart backend: `pm2 restart backend`
- [ ] Clear application caches (restart backend)
- [ ] Test first load performance (cold cache)
- [ ] Test cached load performance (warm cache)
- [ ] Monitor ES health and query times
- [ ] Check backend logs for ES errors

---

### Troubleshooting

**Symptom**: Response times >1 second

**Check**:
1. ES connection health: `curl http://52.175.247.13:9200/_cluster/health`
2. Backend logs for "Failed to load from Elasticsearch" messages
3. ES indices exist: `node scripts/check-es-documents.js`
4. Network latency to ES server
5. Cache is being used (second requests should be faster)

**Common Causes**:
- Cold cache (first request after restart)
- ES query timeout/error → DB fallback triggered
- Network issues to remote ES server
- Missing documents in ES indices
- `track_total_hits: true` (should be false or limited)

---

### Migration Scripts

Located in `scripts/` directory:

- **`reindex-store-slugs.js`**: Adds store_slug field to existing products in ES
- **`index-collections.js`**: Bulk indexes all collections from PostgreSQL to ES
- **`check-es-documents.js`**: Diagnostic tool to check ES index status

Run after deployment of code changes that add new ES fields/indices.

---

### Monitoring Commands

```bash
# Check ES cluster health
curl http://52.175.247.13:9200/_cluster/health?pretty

# Check index stats
curl http://52.175.247.13:9200/products_detail_v1/_stats?pretty
curl http://52.175.247.13:9200/collections_v1/_stats?pretty

# Check document count
curl http://52.175.247.13:9200/products_detail_v1/_count?pretty
curl http://52.175.247.13:9200/collections_v1/_count?pretty

# Test query performance
node scripts/check-es-documents.js
```

---

### Contact

For questions about architecture or performance:
- Review QUERY_ARCHITECTURE.md for system design
- Review PERFORMANCE_OPTIMIZATION.md for recent changes
- Check backend logs for error messages
- Monitor ES query times with logging
