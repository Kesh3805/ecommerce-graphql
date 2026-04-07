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
  'Customer',
];

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  for (const table of tables) {
    const res = await client.query(
      `select column_name, is_nullable, column_default, data_type
       from information_schema.columns
       where table_schema = 'public' and table_name = $1
       order by ordinal_position`,
      [table],
    );

    console.log(`\n[${table}]`);
    for (const row of res.rows) {
      console.log(`${row.column_name} | ${row.data_type} | nullable=${row.is_nullable} | default=${row.column_default ?? 'null'}`);
    }
  }

  await client.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
