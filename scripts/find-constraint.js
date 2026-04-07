require('dotenv').config();
const { Client } = require('pg');

const constraint = process.argv[2];
if (!constraint) {
  console.error('Usage: node scripts/find-constraint.js <constraint_name>');
  process.exit(1);
}

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const res = await client.query(
    `select con.conname, cls.relname as table_name, pg_get_constraintdef(con.oid) as definition
     from pg_constraint con
     join pg_class cls on cls.oid = con.conrelid
     join pg_namespace ns on ns.oid = con.connamespace
     where ns.nspname='public' and con.conname=$1`,
    [constraint],
  );

  console.log(JSON.stringify(res.rows, null, 2));
  await client.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
