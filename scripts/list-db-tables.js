require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  const result = await client.query(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );

  for (const row of result.rows) {
    console.log(row.tablename);
  }

  await client.end();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
