# Performance Debugging Guide

## 🔍 The Issue

Your logs show application code taking **800ms-3s**, which is WAY too slow even with optimizations.

## 📊 What I Added

**Performance logging** to identify bottlenecks:
- ES query timing
- DB fallback detection
- Cache hit/miss tracking
- Method-level execution timing

## 🚀 Next Steps

### 1. **Restart Backend** (CRITICAL)
The code changes won't take effect until you restart:

```bash
# If using PM2:
pm2 restart backend

# If running with npm:
# Stop current process (Ctrl+C), then:
npm run start:prod

# Or rebuild and restart in one go:
npm run build && npm run start:prod
```

### 2. **Test and Watch Logs**

Clear your browser cache and test these pages in order:

```bash
# In a separate terminal, watch the backend logs:
pm2 logs backend --lines 100

# Or if running with npm:
# Logs will appear in the terminal where you ran npm start
```

**Test Pages**:
1. http://localhost:3000/stores/alice-s-apparel
2. http://localhost:3000/stores/alice-s-apparel/collections/new-arrivals?country=US
3. http://localhost:3000/stores/alice-s-apparel/collections/best-sellers?country=US

### 3. **Analyze the Logs**

Look for these `[PERF]` markers in the logs:

#### **Good Path** (ES working):
```
[PERF] findPublicStorefrontStoreBySlug started for slug: alice-s-apparel
[PERF] ES query for store slug alice-s-apparel took 250ms
[PERF] loadPublicStorefrontStoreBySlugFromSearchIndex completed in 280ms (12 products)
[PERF] ES path succeeded for alice-s-apparel
[PERF] findPublicStorefrontStoreBySlug completed in 300ms
```
**Expected**: 250-400ms total

#### **Bad Path** (DB fallback):
```
[PERF] findPublicStorefrontStoreBySlug started for slug: alice-s-apparel
[PERF] ES query for store slug alice-s-apparel took 250ms
[PERF] loadPublicStorefrontStoreBySlugFromSearchIndex returned null (no products) after 280ms
[PERF] ES returned null for alice-s-apparel - falling back to DB
[PERF] DB store lookup took 150ms, loading products...
[PERF] findPublicStorefrontStoreBySlug completed in 1200ms
```
**Problem**: DB fallback adds 500-1000ms

#### **Collection Queries** (should be fast):
```
[PERF] getManualCollectionProducts started for collection 2, country: US
[PERF] ES query for collection 2 took 180ms
[PERF] loadManualCollectionProductsFromSearchIndex for collection 2 completed in 210ms (12 products)
[PERF] getManualCollectionProducts completed via ES in 220ms
```
**Expected**: 150-300ms

#### **Collection DB Fallback** (slow):
```
[PERF] getManualCollectionProducts started for collection 2, country: US
[PERF] ES returned null for collection 2 - falling back to DB
[PERF] DB country filter took 450ms (8/15 products)
[PERF] DB product query took 320ms (8 products)
[PERF] getManualCollectionProducts completed via DB in 850ms
```
**Problem**: DB fallback is slow

---

## 🔍 What to Look For

### **Scenario 1: ES Queries Are Slow** (>500ms)
**Symptoms**:
```
[PERF] ES query for store slug alice-s-apparel took 850ms
```

**Causes**:
- Network latency to remote ES server (52.175.247.13)
- ES server overloaded or slow
- Large result sets

**Solutions**:
- Move ES to same datacenter as application
- Check ES server health: `curl http://52.175.247.13:9200/_cluster/health`
- Reduce `productLimit` in queries

---

### **Scenario 2: DB Fallback Being Triggered**
**Symptoms**:
```
[PERF] ES returned null for alice-s-apparel - falling back to DB
```

**Causes**:
- ES documents missing (not indexed)
- ES connection failing
- ES query returning 0 results

**Diagnosis**:
```bash
# Check if documents exist in ES:
node scripts/check-es-documents.js

# Should show:
# Total documents: 6
# Documents with store_slug: 6
# Collections index exists with 4 documents
```

**If documents are missing**:
```bash
# The backend auto-indexes on product create/update, but you can force reindex:
# This requires accessing the admin panel or GraphQL playground to trigger product updates
```

---

### **Scenario 3: Country Filter Causing DB Queries**
**Symptoms**:
```
[PERF] DB country filter took 450ms (8/15 products)
```

**Cause**: `filterProductIdsByCountry` method querying `product_country_availability` table

**This should NOT happen** if ES is working - the country filter should be in the ES query, not a separate DB query.

**If you see this**, it means ES returned null and we're in DB fallback path.

---

### **Scenario 4: Multiple Sequential Queries**
**Symptoms**: Multiple `[PERF]` logs adding up to 2-3 seconds

**Example**:
```
[PERF] Query 1 took 400ms
[PERF] Query 2 took 500ms
[PERF] Query 3 took 600ms
[PERF] Query 4 took 700ms
Total: 2.2s
```

**Cause**: GraphQL field resolvers running sequentially instead of parallel

**Check**: Are there multiple collections or related queries being resolved?

---

## 📈 Expected Performance After Restart

### **First Load** (cold cache):
- Store page: **250-500ms**
- Collection page: **150-300ms**
- Product page: **150-250ms**

### **Cached** (warm cache):
- Store page: **50-150ms**
- Collection page: **20-100ms**
- Product page: **20-80ms**

### **If Still Slow** (>1s):
Look for these in logs:
1. "ES returned null" → Documents not indexed
2. "ES query took >500ms" → Network/ES performance issue
3. "DB country filter took" → Should not appear (ES fallback)
4. Multiple queries adding up → Batching issue

---

## 🛠️ Troubleshooting Steps

### **Step 1: Restart Backend**
```bash
pm2 restart backend
# Wait 5 seconds for it to fully restart
```

### **Step 2: Clear Cache**
```bash
# Clear browser cache or use incognito mode
# This ensures you're not seeing cached frontend data
```

### **Step 3: Test Single Page**
Visit: http://localhost:3000/stores/alice-s-apparel

**Watch the backend logs** - you should see:
```
[PERF] findPublicStorefrontStoreBySlug started for slug: alice-s-apparel
[PERF] ES query for store slug alice-s-apparel took XXXms
[PERF] findPublicStorefrontStoreBySlug completed in XXXms
```

### **Step 4: Analyze Timing**
- ES query < 300ms ✅ Good
- ES query 300-500ms ⚠️ Acceptable but slow network
- ES query > 500ms ❌ ES performance issue
- "falling back to DB" ❌ Documents not indexed

### **Step 5: Test Collection Page**
Visit: http://localhost:3000/stores/alice-s-apparel/collections/new-arrivals?country=US

**Watch for**:
```
[PERF] getManualCollectionProducts started
[PERF] ES query for collection X took XXXms
[PERF] getManualCollectionProducts completed via ES in XXXms
```

**If you see "falling back to DB"**, run:
```bash
node scripts/index-collections.js
```
Then restart backend and try again.

---

## 📊 Performance Baseline

With ES at **remote server** (52.175.247.13):
- **Network RTT**: ~200ms (can't avoid without moving ES)
- **ES query processing**: ~50-150ms
- **Total per query**: ~250-400ms

**This is the baseline** - you can't get much faster without:
1. Moving ES to same datacenter/region
2. Adding Redis cache layer
3. CDN edge caching

---

## ✅ Success Criteria

After restart, you should see:
- **No "falling back to DB" messages** (ES working)
- **ES queries < 400ms** each
- **Total request time < 500ms** for first load
- **Total request time < 150ms** for cached requests

If you're still seeing >1s, **send me the [PERF] logs** and I'll diagnose further.

---

## 🚨 Emergency: If Backend Won't Start

```bash
# Check if something is on port 4100:
netstat -ano | findstr :4100

# Kill the process if needed:
taskkill /PID <PID> /F

# Then start fresh:
npm run start:prod
```

---

## 📝 Report Back

After restarting, please share:
1. **First load timing** (from browser dev tools Network tab)
2. **Cached load timing** (reload same page)
3. **Backend logs** showing `[PERF]` markers
4. **Any errors** in backend logs

This will help me identify the exact bottleneck!
