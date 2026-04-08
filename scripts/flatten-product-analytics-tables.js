require('dotenv').config();
const { Client } = require('pg');

async function tableExists(client, tableName) {
  const result = await client.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = $1
      ) AS exists
    `,
    [tableName],
  );

  return Boolean(result.rows[0]?.exists);
}

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

    // Add flattened analytics/recommendation columns directly on Product.
    await client.query(`ALTER TABLE public."Product" ADD COLUMN IF NOT EXISTS order_count integer NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE public."Product" ADD COLUMN IF NOT EXISTS order_count_30d integer NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE public."Product" ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE public."Product" ADD COLUMN IF NOT EXISTS view_count_30d integer NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE public."Product" ADD COLUMN IF NOT EXISTS add_to_cart_count integer NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE public."Product" ADD COLUMN IF NOT EXISTS add_to_cart_count_30d integer NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE public."Product" ADD COLUMN IF NOT EXISTS total_revenue numeric(15,2) NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE public."Product" ADD COLUMN IF NOT EXISTS revenue_30d numeric(15,2) NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE public."Product" ADD COLUMN IF NOT EXISTS best_selling_score double precision NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE public."Product" ADD COLUMN IF NOT EXISTS trending_score double precision NOT NULL DEFAULT 0`);
    await client.query(`ALTER TABLE public."Product" ADD COLUMN IF NOT EXISTS event_counters jsonb`);
    await client.query(`ALTER TABLE public."Product" ADD COLUMN IF NOT EXISTS related_product_ids integer[] NOT NULL DEFAULT '{}'::integer[]`);
    await client.query(`ALTER TABLE public."Product" ADD COLUMN IF NOT EXISTS copurchased_product_ids integer[] NOT NULL DEFAULT '{}'::integer[]`);
    await client.query(`ALTER TABLE public."Product" ADD COLUMN IF NOT EXISTS last_computed_at timestamp NOT NULL DEFAULT NOW()`);

    if (await tableExists(client, 'ProductStats')) {
      await client.query(`
        UPDATE public."Product" p
        SET
          order_count = COALESCE(ps.order_count, p.order_count),
          order_count_30d = COALESCE(ps.order_count_30d, p.order_count_30d),
          view_count = COALESCE(ps.view_count, p.view_count),
          view_count_30d = COALESCE(ps.view_count_30d, p.view_count_30d),
          add_to_cart_count = COALESCE(ps.add_to_cart_count, p.add_to_cart_count),
          add_to_cart_count_30d = COALESCE(ps.add_to_cart_count_30d, p.add_to_cart_count_30d),
          total_revenue = COALESCE(ps.total_revenue, p.total_revenue),
          revenue_30d = COALESCE(ps.revenue_30d, p.revenue_30d),
          best_selling_score = COALESCE(ps.best_selling_score, p.best_selling_score),
          trending_score = COALESCE(ps.trending_score, p.trending_score),
          last_computed_at = COALESCE(ps.last_computed_at, p.last_computed_at)
        FROM public."ProductStats" ps
        WHERE p.product_id = ps.product_id
      `);
    }

    if (await tableExists(client, 'ProductEvent')) {
      await client.query(`
        WITH event_agg AS (
          SELECT
            product_id,
            COALESCE(SUM(CASE WHEN event_type = 'purchase' THEN count ELSE 0 END), 0) AS purchase_count,
            COALESCE(SUM(CASE WHEN event_type = 'add_to_cart' THEN count ELSE 0 END), 0) AS add_to_cart_count,
            COALESCE(SUM(CASE WHEN event_type = 'view' THEN count ELSE 0 END), 0) AS view_count
          FROM public."ProductEvent"
          GROUP BY product_id
        )
        UPDATE public."Product" p
        SET
          order_count = GREATEST(p.order_count, ea.purchase_count),
          order_count_30d = GREATEST(p.order_count_30d, ea.purchase_count),
          add_to_cart_count = GREATEST(p.add_to_cart_count, ea.add_to_cart_count),
          add_to_cart_count_30d = GREATEST(p.add_to_cart_count_30d, ea.add_to_cart_count),
          view_count = GREATEST(p.view_count, ea.view_count),
          view_count_30d = GREATEST(p.view_count_30d, ea.view_count),
          event_counters = jsonb_build_object(
            'purchase', ea.purchase_count,
            'add_to_cart', ea.add_to_cart_count,
            'view', ea.view_count
          )
        FROM event_agg ea
        WHERE p.product_id = ea.product_id
      `);
    }

    if (await tableExists(client, 'ProductRelationship')) {
      await client.query(`
        WITH rel AS (
          SELECT
            source_product_id,
            ARRAY_AGG(DISTINCT related_product_id) AS related_ids
          FROM public."ProductRelationship"
          GROUP BY source_product_id
        )
        UPDATE public."Product" p
        SET related_product_ids = rel.related_ids
        FROM rel
        WHERE p.product_id = rel.source_product_id
      `);
    }

    if (await tableExists(client, 'ProductCopurchase')) {
      await client.query(`
        WITH pair_a AS (
          SELECT product_a_id AS product_id, ARRAY_AGG(DISTINCT product_b_id) AS ids
          FROM public."ProductCopurchase"
          GROUP BY product_a_id
        ),
        pair_b AS (
          SELECT product_b_id AS product_id, ARRAY_AGG(DISTINCT product_a_id) AS ids
          FROM public."ProductCopurchase"
          GROUP BY product_b_id
        )
        UPDATE public."Product" p
        SET copurchased_product_ids = pair_a.ids
        FROM pair_a
        WHERE p.product_id = pair_a.product_id
      `);

      await client.query(`
        WITH pair_b AS (
          SELECT product_b_id AS product_id, ARRAY_AGG(DISTINCT product_a_id) AS ids
          FROM public."ProductCopurchase"
          GROUP BY product_b_id
        )
        UPDATE public."Product" p
        SET copurchased_product_ids = ARRAY(
          SELECT DISTINCT v
          FROM UNNEST(COALESCE(p.copurchased_product_ids, '{}'::integer[]) || pair_b.ids) AS v
          WHERE v IS NOT NULL
        )
        FROM pair_b
        WHERE p.product_id = pair_b.product_id
      `);
    }

    // Drop deprecated extra product tables.
    await client.query('DROP TABLE IF EXISTS public."ProductEvent"');
    await client.query('DROP TABLE IF EXISTS public."ProductRelationship"');
    await client.query('DROP TABLE IF EXISTS public."ProductCopurchase"');
    await client.query('DROP TABLE IF EXISTS public."ProductStats"');

    await client.query('COMMIT');

    console.log('Product table updated with flattened analytics/recommendation columns.');
    console.log('Dropped extra product tables: ProductStats, ProductEvent, ProductRelationship, ProductCopurchase.');
    console.log('Variant table was not modified.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Failed to flatten/drop product analytics tables:', error.message);
  process.exit(1);
});
