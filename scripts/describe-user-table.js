require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  const res = await client.query(
    `select column_name, is_nullable, column_default, data_type
     from information_schema.columns
     where table_schema = 'public' and table_name = 'User'
     order by ordinal_position`,
  );
  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
