require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  const tablesRes = await client.query(
    "select tablename from pg_tables where schemaname = 'public' order by tablename",
  );
  const tables = tablesRes.rows.map((r) => r.tablename);

  const groups = new Map();
  for (const name of tables) {
    const key = name.toLowerCase();
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(name);
  }

  for (const [key, names] of groups.entries()) {
    if (names.length < 2) continue;
    const sorted = [...names].sort((a, b) => a.localeCompare(b));
    const counts = [];
    for (const n of sorted) {
      const c = await client.query(`select count(*)::int as c from public."${n}"`);
      counts.push(`${n}:${c.rows[0].c}`);
    }
    console.log(`${key} => ${counts.join(' | ')}`);
  }

  await client.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
