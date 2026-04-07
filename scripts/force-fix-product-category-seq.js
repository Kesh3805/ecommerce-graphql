const { Client } = require('pg');
require('dotenv').config();
(async()=>{
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  const maxRes = await client.query('SELECT COALESCE(MAX(id),0)::int AS max_id FROM public."ProductCategory"');
  const nextVal = Number(maxRes.rows[0].max_id) + 1;
  await client.query('SELECT setval(\'public."ProductCategory_id_seq"\'::regclass, $1, false)', [nextVal]);
  await client.query('SELECT setval(\'public.product_categories_id_seq\'::regclass, $1, false)', [nextVal]);
  const checkA = await client.query('SELECT nextval(\'public."ProductCategory_id_seq"\'::regclass) AS v');
  const checkB = await client.query('SELECT nextval(\'public.product_categories_id_seq\'::regclass) AS v');
  console.log({ nextVal, ProductCategory_id_seq_next: checkA.rows[0].v, product_categories_id_seq_next: checkB.rows[0].v });
  await client.end();
})().catch(async (e)=>{ console.error(e); process.exit(1); });
