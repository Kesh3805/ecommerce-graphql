/**
 * Script to index all collections into Elasticsearch.
 * Run this after deploying the collections ES index feature.
 * 
 * Usage: node scripts/index-collections.js
 */

const { DataSource } = require('typeorm');
const { Client } = require('@elastic/elasticsearch');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const ELASTICSEARCH_URL = process.env.ELASTICSEARCH_NODE || process.env.ELASTICSEARCH_URL || 'http://52.175.247.13:9200';
const ELASTICSEARCH_USER = process.env.ELASTICSEARCH_USERNAME || process.env.ELASTICSEARCH_USER || 'elastic';
const ELASTICSEARCH_PASSWORD = process.env.ELASTICSEARCH_PASSWORD || '';
const COLLECTION_INDEX = process.env.ELASTICSEARCH_COLLECTION_INDEX || 'collections_v1';

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

async function indexCollections() {
  const esClient = new Client({
    node: ELASTICSEARCH_URL,
    ...(ELASTICSEARCH_USER && ELASTICSEARCH_PASSWORD
      ? { auth: { username: ELASTICSEARCH_USER, password: ELASTICSEARCH_PASSWORD } }
      : {}),
  });

  console.log(`Connecting to Elasticsearch at ${ELASTICSEARCH_URL}...`);

  if (!ELASTICSEARCH_PASSWORD) {
    console.warn('Warning: ELASTICSEARCH_PASSWORD is empty. Requests may fail if cluster requires auth.');
  }

  try {
    await esClient.info();
  } catch (error) {
    throw new Error(`Failed to connect/authenticate: ${formatElasticsearchError(error)}`);
  }

  // Check if index exists, create if not
  const existsResponse = await esClient.indices.exists({ index: COLLECTION_INDEX });
  const exists = toBooleanExistsResponse(existsResponse);
  if (!exists) {
    console.log(`Creating index ${COLLECTION_INDEX}...`);
    await esClient.indices.create({
      index: COLLECTION_INDEX,
      mappings: {
        dynamic: false,
        properties: {
          collection_id: { type: 'integer' },
          store_id: { type: 'integer' },
          name: { type: 'text', fields: { keyword: { type: 'keyword' } } },
          slug: { type: 'keyword' },
          description: { type: 'text' },
          image_url: { type: 'keyword' },
          collection_type: { type: 'keyword' },
          is_visible: { type: 'boolean' },
          meta_title: { type: 'text' },
          meta_description: { type: 'text' },
          product_count: { type: 'integer' },
          product_ids: { type: 'integer' },
          updated_at: { type: 'date' },
        },
      },
    });
  }

  // Connect to PostgreSQL using the same env conventions as the Nest app.
  const databaseUrl = process.env.DATABASE_URL;
  const dataSource = databaseUrl
    ? new DataSource({
        type: 'postgres',
        url: databaseUrl,
        ssl: { rejectUnauthorized: false },
        synchronize: false,
      })
    : new DataSource({
        type: 'postgres',
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT || '5432', 10),
        username: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASS || '',
        database: process.env.DB_NAME || 'gk_poc_graphql',
        synchronize: false,
      });

  await dataSource.initialize();
  console.log('Connected to PostgreSQL');

  // Fetch all collections
  const collections = await dataSource.query(`
    SELECT 
      c.*,
      COUNT(DISTINCT cp.product_id) as product_count,
      ARRAY_AGG(DISTINCT cp.product_id) FILTER (WHERE cp.product_id IS NOT NULL) as product_ids
    FROM "Collection" c
    LEFT JOIN "CollectionProduct" cp ON c.collection_id = cp.collection_id
    GROUP BY c.collection_id
    ORDER BY c.collection_id
  `);

  console.log(`Found ${collections.length} collections to index`);

  let indexed = 0;
  let failed = 0;

  for (const collection of collections) {
    try {
      const document = {
        collection_id: collection.collection_id,
        store_id: collection.store_id,
        name: collection.name,
        slug: collection.slug,
        description: collection.description || undefined,
        image_url: collection.image_url || undefined,
        collection_type: collection.collection_type,
        is_visible: collection.is_visible,
        meta_title: collection.meta_title || undefined,
        meta_description: collection.meta_description || undefined,
        product_count: parseInt(collection.product_count) || 0,
        product_ids: collection.product_ids || [],
        updated_at: new Date().toISOString(),
      };

      await esClient.index({
        index: COLLECTION_INDEX,
        id: String(collection.collection_id),
        document,
      });

      indexed++;
      if (indexed % 10 === 0) {
        console.log(`Indexed ${indexed}/${collections.length} collections...`);
      }
    } catch (error) {
      console.error(`Failed to index collection ${collection.collection_id}:`, error.message);
      failed++;
    }
  }

  // Refresh index
  await esClient.indices.refresh({ index: COLLECTION_INDEX });

  console.log(`\nIndexing complete:`);
  console.log(`  - Successfully indexed: ${indexed}`);
  console.log(`  - Failed: ${failed}`);
  console.log(`  - Total: ${collections.length}`);

  await dataSource.destroy();
}

indexCollections()
  .then(() => {
    console.log('\nDone!');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Error:', formatElasticsearchError(error));
    if (error && error.meta && error.meta.body) {
      console.error('Elasticsearch response body:', JSON.stringify(error.meta.body, null, 2));
    }
    process.exit(1);
  });
