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

    // CMS tables (page/section/banner/mappings)
    await client.query('DROP TABLE IF EXISTS public."SectionCollection"');
    await client.query('DROP TABLE IF EXISTS public."SectionCategory"');
    await client.query('DROP TABLE IF EXISTS public."HeroBanner"');
    await client.query('DROP TABLE IF EXISTS public."PageSection"');
    await client.query('DROP TABLE IF EXISTS public."StorefrontPage"');

    // Extra variant mapping table no longer used after flattening behavior
    await client.query('DROP TABLE IF EXISTS public."VariantOptionSelection"');

    await client.query('COMMIT');
    console.log('Dropped CMS tables: StorefrontPage, PageSection, HeroBanner, SectionCollection, SectionCategory');
    console.log('Dropped extra variant table: VariantOptionSelection');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Failed to drop CMS/variant-extra tables:', error.message);
  process.exit(1);
});
