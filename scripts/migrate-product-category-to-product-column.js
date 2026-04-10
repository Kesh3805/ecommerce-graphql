require('dotenv').config();
const { Client } = require('pg');

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    await client.query('ALTER TABLE public."Product" ADD COLUMN IF NOT EXISTS "category_id" integer');

    await client.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint
          WHERE conname = 'FK_Product_category_id'
        ) THEN
          ALTER TABLE public."Product"
          ADD CONSTRAINT "FK_Product_category_id"
          FOREIGN KEY ("category_id") REFERENCES public."Category"("category_id") ON DELETE SET NULL;
        END IF;
      END $$;
    `);

    await client.query(`
      WITH selected_links AS (
        SELECT DISTINCT ON (pc."product_id")
          pc."product_id",
          pc."category_id"
        FROM public."ProductCategory" pc
        ORDER BY pc."product_id", pc."id" ASC
      )
      UPDATE public."Product" p
      SET "category_id" = selected_links."category_id"
      FROM selected_links
      WHERE p."product_id" = selected_links."product_id"
        AND p."category_id" IS NULL
    `);

    await client.query('CREATE INDEX IF NOT EXISTS "IDX_Product_category_id" ON public."Product" ("category_id")');

    await client.query('DROP TABLE IF EXISTS public."ProductCategory" CASCADE');

    await client.query('COMMIT');
    console.log('Migrated category linkage to Product.category_id and dropped ProductCategory.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Migration failed:', error.message || error);
  process.exit(1);
});
