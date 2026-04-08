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

    // Add flat columns to Product without dropping or changing existing tables.
    await client.query(`
      ALTER TABLE "Product"
      ADD COLUMN IF NOT EXISTS "handle" varchar(255),
      ADD COLUMN IF NOT EXISTS "meta_title" varchar(255),
      ADD COLUMN IF NOT EXISTS "meta_description" text,
      ADD COLUMN IF NOT EXISTS "og_title" varchar(255),
      ADD COLUMN IF NOT EXISTS "og_description" text,
      ADD COLUMN IF NOT EXISTS "og_image" text,
      ADD COLUMN IF NOT EXISTS "primary_image_url" text,
      ADD COLUMN IF NOT EXISTS "media_urls" jsonb
    `);

    // Backfill SEO fields from ProductSEO.
    await client.query(`
      UPDATE "Product" p
      SET
        "handle" = COALESCE(p."handle", s."handle"),
        "meta_title" = COALESCE(p."meta_title", s."meta_title"),
        "meta_description" = COALESCE(p."meta_description", s."meta_description"),
        "og_title" = COALESCE(p."og_title", s."og_title"),
        "og_description" = COALESCE(p."og_description", s."og_description"),
        "og_image" = COALESCE(p."og_image", s."og_image")
      FROM "ProductSEO" s
      WHERE s."product_id" = p."product_id"
    `);

    // Backfill media fields from ProductMedia.
    await client.query(`
      WITH ordered_media AS (
        SELECT
          pm."product_id",
          pm."url",
          pm."is_cover",
          pm."position"
        FROM "ProductMedia" pm
      ),
      media_agg AS (
        SELECT
          product_id,
          jsonb_agg(url ORDER BY position ASC NULLS LAST, "url" ASC) AS media_urls,
          (
            array_remove(
              array_agg(CASE WHEN is_cover = true THEN url END ORDER BY position ASC NULLS LAST),
              NULL
            )
          )[1] AS cover_url,
          (
            array_remove(array_agg(url ORDER BY position ASC NULLS LAST), NULL)
          )[1] AS first_url
        FROM ordered_media
        GROUP BY product_id
      )
      UPDATE "Product" p
      SET
        "media_urls" = COALESCE(p."media_urls", m.media_urls),
        "primary_image_url" = COALESCE(p."primary_image_url", m.cover_url, m.first_url)
      FROM media_agg m
      WHERE m.product_id = p."product_id"
    `);

    await client.query('CREATE UNIQUE INDEX IF NOT EXISTS "IDX_Product_handle_unique" ON "Product" ("handle") WHERE "handle" IS NOT NULL');
    await client.query('CREATE INDEX IF NOT EXISTS "IDX_Product_store_status_published" ON "Product" ("store_id", "status", "published_at")');

    await client.query('COMMIT');
    console.log('Product flatten migration completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Failed to flatten product schema:', error.message);
  process.exit(1);
});
