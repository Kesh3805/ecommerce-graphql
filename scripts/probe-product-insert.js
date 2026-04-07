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

    const seqA = await client.query(`SELECT nextval('public."Product_product_id_seq"') AS v`);
    const seqB = await client.query(`SELECT nextval('public.products_product_id_seq') AS v`);
    console.log('next Product_product_id_seq:', seqA.rows[0].v);
    console.log('next products_product_id_seq:', seqB.rows[0].v);

    const insert = await client.query(`
      INSERT INTO public."Product" (title, description, brand, status, store_id)
      VALUES ('Probe Insert', 'probe', 'probe', 'DRAFT', 1)
      RETURNING product_id
    `);

    console.log('inserted product_id:', insert.rows[0].product_id);
    await client.query('ROLLBACK');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
