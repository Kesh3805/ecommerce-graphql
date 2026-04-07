require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  const tables = ['User', 'Store', 'Category', 'Product', 'Variant', 'InventoryItem', 'InventoryLevel', 'Customer'];

  for (const table of tables) {
    const res = await client.query(`SELECT COUNT(*)::int AS c FROM public."${table}"`);
    console.log(`${table}: ${res.rows[0].c}`);
  }

  await client.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
