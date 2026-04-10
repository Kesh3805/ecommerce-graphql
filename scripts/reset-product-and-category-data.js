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

    // Category-table design guardrails for DB-managed templates.
    await client.query('ALTER TABLE public."Category" ALTER COLUMN "metadata" SET DEFAULT \'{}\'::jsonb');
    await client.query('UPDATE public."Category" SET "metadata" = \'{}\'::jsonb WHERE "metadata" IS NULL');
    await client.query('ALTER TABLE public."Category" ALTER COLUMN "metadata" SET NOT NULL');
    await client.query('CREATE INDEX IF NOT EXISTS "IDX_Category_parent_id" ON public."Category" ("parent_id")');

    // Purge product/category-related data. Keep store/user/location/order shell tables intact.
    await client.query(`
      TRUNCATE TABLE
        public."CollectionProduct",
        public."OrderItem",
        public."CartItem",
        public."InventoryReservation",
        public."InventoryAdjustment",
        public."InventoryLevel",
        public."Variant",
        public."InventoryItem",
        public."OptionValue",
        public."ProductOption",
        public."ProductCountryAvailability",
        public."Metafield",
        public."Product",
        public."Brand",
        public."Category"
      RESTART IDENTITY CASCADE
    `);

    await client.query('COMMIT');
    console.log('Deleted all product/category-related rows and reset identities.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Reset failed:', error.message || error);
  process.exit(1);
});
