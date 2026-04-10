require('dotenv').config();
const { Client } = require('pg');

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query('DROP TABLE IF EXISTS public."ProductAttributeValue" CASCADE');
    await client.query('COMMIT');
    console.log('Dropped table: ProductAttributeValue');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Failed to drop ProductAttributeValue:', error.message || error);
  process.exit(1);
});
