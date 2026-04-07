require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query('BEGIN');

    const info = await client.query(`
      SELECT
        (SELECT column_default FROM information_schema.columns
         WHERE table_schema='public' AND table_name='ProductSEO' AND column_name='product_seo_id') AS column_default,
        (SELECT pg_get_serial_sequence('public."ProductSEO"', 'product_seo_id')) AS serial_sequence,
        (SELECT COALESCE(MAX(product_seo_id),0)::int FROM public."ProductSEO") AS max_id
    `);

    const row = info.rows[0];
    const maxId = Number(row.max_id || 0);
    const nextValue = maxId + 1;

    const seqs = new Set();
    if (row.serial_sequence) seqs.add(row.serial_sequence);

    const match = String(row.column_default || '').match(/nextval\('(.+?)'::regclass\)/i);
    if (match?.[1]) {
      seqs.add(match[1].replace(/"/g, ''));
    }

    for (const seq of seqs) {
      const exists = await client.query('SELECT to_regclass($1) AS reg', [seq]);
      if (!exists.rows[0]?.reg) continue;
      await client.query('SELECT setval($1, $2, false)', [seq, nextValue]);
      console.log(`Set ${seq} to next value ${nextValue}`);
    }

    await client.query(`
      ALTER TABLE public."ProductSEO"
      ALTER COLUMN product_seo_id SET DEFAULT nextval('public."ProductSEO_product_seo_id_seq"'::regclass)
    `);

    await client.query('COMMIT');
    console.log('✅ ProductSEO sequence fixed');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
