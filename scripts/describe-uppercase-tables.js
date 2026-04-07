require('dotenv').config();
const { Client } = require('pg');

const tables = [
  'User',
  'Store',
  'Category',
  'Product',
  'ProductSEO',
  'ProductOption',
  'OptionValue',
  'ProductCategory',
  'Variant',
  'InventoryItem',
  'InventoryLevel',
  'Cart',
  'CartItem',
  'Order',
  'OrderItem',
];

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  for (const table of tables) {
    const exists = await client.query(
      `select exists (
        select 1 from information_schema.tables
        where table_schema='public' and table_name=$1
      ) as exists`,
      [table],
    );

    if (!exists.rows[0].exists) {
      continue;
    }

    const cols = await client.query(
      `select column_name, data_type, is_nullable
       from information_schema.columns
       where table_schema='public' and table_name=$1
       order by ordinal_position`,
      [table],
    );

    console.log(`\n[${table}]`);
    for (const row of cols.rows) {
      console.log(`${row.column_name} | ${row.data_type} | nullable=${row.is_nullable}`);
    }
  }

  await client.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
