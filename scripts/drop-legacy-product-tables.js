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

    const requiredColumns = [
      'handle',
      'meta_title',
      'meta_description',
      'og_title',
      'og_description',
      'og_image',
      'primary_image_url',
      'media_urls',
    ];

    const columnCheck = await client.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'Product'
        AND column_name = ANY($1::text[])
      `,
      [requiredColumns],
    );

    const present = new Set(columnCheck.rows.map((r) => r.column_name));
    const missing = requiredColumns.filter((column) => !present.has(column));

    if (missing.length > 0) {
      throw new Error(`Cannot drop legacy tables. Missing Product columns: ${missing.join(', ')}`);
    }

    await client.query('DROP TABLE IF EXISTS public."VariantMedia"');
    await client.query('DROP TABLE IF EXISTS public."ProductMedia"');
    await client.query('DROP TABLE IF EXISTS public."ProductSEO"');

    await client.query('COMMIT');
    console.log('Dropped legacy tables: VariantMedia, ProductMedia, ProductSEO');
    console.log('Variant/Inventory tables were not dropped because they are still active dependencies.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Failed to drop legacy tables:', error.message);
  process.exit(1);
});
