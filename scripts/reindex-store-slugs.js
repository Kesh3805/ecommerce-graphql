/**
 * Script to add store_slug field to all products in the ES index.
 * This enables direct store slug lookup without DB round-trip.
 * 
 * Usage: node scripts/reindex-store-slugs.js
 */

const { Client } = require('@elastic/elasticsearch');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const ELASTICSEARCH_NODE =
  process.env.ELASTICSEARCH_NODE ||
  process.env.ELASTICSEARCH_URL ||
  'http://52.175.247.13:9200';
const ELASTICSEARCH_USERNAME =
  process.env.ELASTICSEARCH_USERNAME ||
  process.env.ELASTICSEARCH_USER ||
  'elastic';
const ELASTICSEARCH_PASSWORD = process.env.ELASTICSEARCH_PASSWORD || '';
const INDEX_NAME = process.env.ELASTICSEARCH_PRODUCT_DETAIL_INDEX || 'products_detail_v1';

function normalizeStoreSlug(storeName) {
  return (storeName || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function toBooleanExistsResponse(value) {
  if (typeof value === 'boolean') {
    return value;
  }

  if (value && typeof value === 'object' && typeof value.body === 'boolean') {
    return value.body;
  }

  return Boolean(value);
}

function formatElasticsearchError(error) {
  if (!error || typeof error !== 'object') {
    return String(error);
  }

  const statusCode = error.statusCode || error.meta?.statusCode;
  const topMessage = error.message || error.name || 'Unknown Elasticsearch error';
  const responseError = error.meta?.body?.error;
  const reason = responseError?.reason || responseError?.root_cause?.[0]?.reason;
  const type = responseError?.type || responseError?.root_cause?.[0]?.type;

  const parts = [topMessage];

  if (statusCode) {
    parts.push(`status=${statusCode}`);
  }

  if (type) {
    parts.push(`type=${type}`);
  }

  if (reason) {
    parts.push(`reason=${reason}`);
  }

  return parts.join(' | ');
}

async function reindexStoreSlugs() {
  const client = new Client({
    node: ELASTICSEARCH_NODE,
    ...(ELASTICSEARCH_USERNAME && ELASTICSEARCH_PASSWORD
      ? { auth: { username: ELASTICSEARCH_USERNAME, password: ELASTICSEARCH_PASSWORD } }
      : {}),
  });

  console.log(`Connecting to Elasticsearch at ${ELASTICSEARCH_NODE}...`);

  if (!ELASTICSEARCH_PASSWORD) {
    console.warn('Warning: ELASTICSEARCH_PASSWORD is empty. Requests may fail if cluster requires auth.');
  }

  // Verify basic connectivity/auth up front so failures are explicit.
  try {
    await client.info();
  } catch (error) {
    throw new Error(`Failed to connect/authenticate: ${formatElasticsearchError(error)}`);
  }

  // Check if index exists
  const existsResponse = await client.indices.exists({ index: INDEX_NAME });
  const exists = toBooleanExistsResponse(existsResponse);
  if (!exists) {
    console.error(`Index ${INDEX_NAME} does not exist.`);
    process.exit(1);
  }

  // First, add the store_slug mapping if it doesn't exist
  try {
    await client.indices.putMapping({
      index: INDEX_NAME,
      properties: {
        store_slug: { type: 'keyword' },
      },
    });
    console.log('Added store_slug mapping to index.');
  } catch (error) {
    console.log(`store_slug mapping may already exist, continuing... (${formatElasticsearchError(error)})`);
  }

  // Use update by query to add store_slug to all documents
  console.log('Updating all documents with store_slug field...');
  
  const result = await client.updateByQuery({
    index: INDEX_NAME,
    refresh: true,
    script: {
      source: `
        if (ctx._source.store_name != null) {
          String slug = ctx._source.store_name.toLowerCase().trim();
          slug = /[^a-z0-9]+/.matcher(slug).replaceAll('-');
          slug = /^-+|-+$/.matcher(slug).replaceAll('');
          ctx._source.store_slug = slug;
        }
      `,
      lang: 'painless',
    },
    query: {
      bool: {
        must_not: {
          exists: {
            field: 'store_slug',
          },
        },
      },
    },
  });

  const total = result.total ?? result.body?.total ?? 0;
  const updated = result.updated ?? result.body?.updated ?? 0;
  const failures = result.failures ?? result.body?.failures ?? [];

  console.log(`Updated ${updated} documents.`);
  console.log(`Total: ${total}, Updated: ${updated}, Failures: ${failures.length || 0}`);

  if (failures.length > 0) {
    console.error('Some documents failed to update:');
    failures.slice(0, 5).forEach((failure) => {
      console.error(`  - ${failure.id}: ${failure.cause?.reason || 'unknown error'}`);
    });
  }

  console.log('Done!');
}

reindexStoreSlugs().catch((error) => {
  console.error('Error:', formatElasticsearchError(error));
  if (error && error.meta && error.meta.body) {
    console.error('Elasticsearch response body:', JSON.stringify(error.meta.body, null, 2));
  }
  process.exit(1);
});
