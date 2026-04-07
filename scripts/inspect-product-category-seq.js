require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    const maxRes = await client.query('SELECT COALESCE(MAX(id),0)::int AS max_id FROM public."ProductCategory"');

    const defaultRes = await client.query(`
      SELECT column_default
      FROM information_schema.columns
      WHERE table_schema='public' AND table_name='ProductCategory' AND column_name='id'
    `);

    const serialRes = await client.query("SELECT pg_get_serial_sequence('public.\"ProductCategory\"', 'id') AS seq");

    const seqRows = await client.query(`
      SELECT c.relname AS sequence_name
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'S'
        AND n.nspname = 'public'
        AND c.relname ILIKE '%product%categor%id%seq%'
      ORDER BY c.relname
    `);

    console.log('ProductCategory max id:', maxRes.rows[0].max_id);
    console.log('column_default:', defaultRes.rows[0]?.column_default ?? null);
    console.log('pg_get_serial_sequence:', serialRes.rows[0]?.seq ?? null);
    console.log('candidate sequences:', seqRows.rows.map((r) => r.sequence_name));

    for (const row of seqRows.rows) {
      const seq = `public."${row.sequence_name}"`;
      const nextRes = await client.query('SELECT nextval($1) AS next_val', [seq]);
      console.log(`${seq} nextval ->`, nextRes.rows[0].next_val);
    }
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
