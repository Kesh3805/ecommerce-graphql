require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const col = await client.query(`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema='public' AND table_name='Product' AND column_name='product_id'
  `);

  const seq = await client.query(`
    SELECT pg_get_serial_sequence('public."Product"', 'product_id') AS seq
  `);

  const max = await client.query(`SELECT MAX(product_id)::int AS max_id FROM public."Product"`);

  console.log('column_default:', col.rows[0]?.column_default ?? null);
  console.log('serial_sequence:', seq.rows[0]?.seq ?? null);
  console.log('max_product_id:', max.rows[0]?.max_id ?? null);

  if (seq.rows[0]?.seq) {
    const curr = await client.query(`SELECT last_value, is_called FROM ${seq.rows[0].seq}`);
    console.log('sequence_state:', curr.rows[0]);
  }

  await client.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
