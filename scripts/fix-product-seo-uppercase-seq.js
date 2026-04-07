require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query('BEGIN');

    const maxRes = await client.query('SELECT COALESCE(MAX(product_seo_id), 0)::int AS max_id FROM public."ProductSEO"');
    const next = Number(maxRes.rows[0].max_id) + 1;

    await client.query('SELECT setval(\'public."ProductSEO_product_seo_id_seq"\', $1, false)', [next]);

    await client.query('COMMIT');
    console.log(`Set public."ProductSEO_product_seo_id_seq" to next value ${next}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
