require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const info = await client.query(`
    SELECT
      (SELECT column_default FROM information_schema.columns WHERE table_schema='public' AND table_name='ProductSEO' AND column_name='product_seo_id') AS column_default,
      (SELECT pg_get_serial_sequence('public."ProductSEO"', 'product_seo_id')) AS serial_sequence,
      (SELECT COALESCE(MAX(product_seo_id),0)::int FROM public."ProductSEO") AS max_id
  `);

  console.log(info.rows[0]);

  const seqCandidates = [
    'public."ProductSEO_product_seo_id_seq"',
    'public.product_seo_product_seo_id_seq',
    info.rows[0].serial_sequence,
  ].filter(Boolean);

  for (const seq of seqCandidates) {
    const exists = await client.query('SELECT to_regclass($1) AS reg', [seq]);
    if (!exists.rows[0]?.reg) {
      console.log(seq, '=> missing');
      continue;
    }
    const state = await client.query(`SELECT last_value, is_called FROM ${seq}`);
    const next = await client.query(`SELECT nextval('${seq}') AS next`);
    console.log(seq, '=> state', state.rows[0], 'next', next.rows[0].next);
  }

  await client.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
