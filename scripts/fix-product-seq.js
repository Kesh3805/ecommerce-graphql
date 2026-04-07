require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  try {
    await client.query('BEGIN');

    const maxRes = await client.query('SELECT COALESCE(MAX(product_id), 0)::int AS max_id FROM public."Product"');
    const maxId = Number(maxRes.rows[0].max_id || 0);
    const nextValue = maxId + 1;

    const seqNames = ['public."Product_product_id_seq"', 'public.products_product_id_seq'];

    for (const seqName of seqNames) {
      const exists = await client.query('SELECT to_regclass($1) AS seq', [seqName]);

      if (exists.rows[0].seq) {
        await client.query(`SELECT setval('${seqName}', $1, false)`, [nextValue]);
        console.log(`Set ${seqName} to next value ${nextValue}`);
      }
    }

    await client.query(`
      ALTER TABLE public."Product"
      ALTER COLUMN product_id SET DEFAULT nextval('public."Product_product_id_seq"'::regclass)
    `);

    await client.query('COMMIT');
    console.log('✅ Product sequence fixed');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
