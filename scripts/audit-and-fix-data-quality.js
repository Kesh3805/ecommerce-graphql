require('dotenv').config();
const { Client } = require('pg');

function createClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

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

async function countRows(client, tableName) {
  if (!(await tableExists(client, tableName))) {
    return null;
  }

  const result = await client.query(`SELECT COUNT(*)::int AS c FROM public."${tableName}"`);
  return Number(result.rows[0]?.c ?? 0);
}

async function querySingleInt(client, sql) {
  const result = await client.query(sql);
  return Number(result.rows[0]?.c ?? 0);
}

async function run() {
  const client = createClient();
  await client.connect();

  const report = {
    before: {},
    findings: {},
    fixes: {},
    after: {},
  };

  try {
    const trackedTables = [
      'Product',
      'Variant',
      'Category',
      'ProductCategory',
      'ProductOption',
      'OptionValue',
      'Collection',
      'CollectionProduct',
      'CollectionRule',
      'Cart',
      'CartItem',
      'Order',
      'OrderItem',
      'InventoryItem',
      'InventoryLevel',
      'Metafield',
    ];

    for (const table of trackedTables) {
      report.before[table] = await countRows(client, table);
    }

    await client.query('BEGIN');

    const hasProduct = await tableExists(client, 'Product');
    const hasVariant = await tableExists(client, 'Variant');
    const hasCategory = await tableExists(client, 'Category');
    const hasProductCategory = await tableExists(client, 'ProductCategory');
    const hasProductOption = await tableExists(client, 'ProductOption');
    const hasOptionValue = await tableExists(client, 'OptionValue');
    const hasCollection = await tableExists(client, 'Collection');
    const hasCollectionProduct = await tableExists(client, 'CollectionProduct');
    const hasCollectionRule = await tableExists(client, 'CollectionRule');
    const hasCart = await tableExists(client, 'Cart');
    const hasCartItem = await tableExists(client, 'CartItem');
    const hasOrder = await tableExists(client, 'Order');
    const hasOrderItem = await tableExists(client, 'OrderItem');
    const hasInventoryItem = await tableExists(client, 'InventoryItem');
    const hasInventoryLevel = await tableExists(client, 'InventoryLevel');
    const hasMetafield = await tableExists(client, 'Metafield');

    // 1) Orphan checks + fixes
    if (hasProductCategory && hasProduct && hasCategory) {
      const productCategoryOrphans = await querySingleInt(
        client,
        `
          SELECT COUNT(*)::int AS c
          FROM public."ProductCategory" pc
          LEFT JOIN public."Product" p ON p.product_id = pc.product_id
          LEFT JOIN public."Category" c ON c.category_id = pc.category_id
          WHERE p.product_id IS NULL OR c.category_id IS NULL
        `,
      );

      report.findings.productCategoryOrphans = productCategoryOrphans;

      const deleted = await client.query(
        `
          DELETE FROM public."ProductCategory" pc
          USING public."ProductCategory" src
          LEFT JOIN public."Product" p ON p.product_id = src.product_id
          LEFT JOIN public."Category" c ON c.category_id = src.category_id
          WHERE pc.id = src.id
            AND (p.product_id IS NULL OR c.category_id IS NULL)
          RETURNING pc.id
        `,
      );

      report.fixes.productCategoryOrphansDeleted = deleted.rowCount;
    }

    if (hasCollectionProduct && hasCollection && hasProduct) {
      const collectionProductOrphans = await querySingleInt(
        client,
        `
          SELECT COUNT(*)::int AS c
          FROM public."CollectionProduct" cp
          LEFT JOIN public."Collection" c ON c.collection_id = cp.collection_id
          LEFT JOIN public."Product" p ON p.product_id = cp.product_id
          WHERE c.collection_id IS NULL OR p.product_id IS NULL
        `,
      );

      report.findings.collectionProductOrphans = collectionProductOrphans;

      const deleted = await client.query(
        `
          DELETE FROM public."CollectionProduct" cp
          USING public."CollectionProduct" src
          LEFT JOIN public."Collection" c ON c.collection_id = src.collection_id
          LEFT JOIN public."Product" p ON p.product_id = src.product_id
          WHERE cp.id = src.id
            AND (c.collection_id IS NULL OR p.product_id IS NULL)
          RETURNING cp.id
        `,
      );

      report.fixes.collectionProductOrphansDeleted = deleted.rowCount;
    }

    if (hasCollectionRule && hasCollection) {
      const collectionRuleOrphans = await querySingleInt(
        client,
        `
          SELECT COUNT(*)::int AS c
          FROM public."CollectionRule" cr
          LEFT JOIN public."Collection" c ON c.collection_id = cr.collection_id
          WHERE c.collection_id IS NULL
        `,
      );

      report.findings.collectionRuleOrphans = collectionRuleOrphans;

      const deleted = await client.query(
        `
          DELETE FROM public."CollectionRule" cr
          USING public."CollectionRule" src
          LEFT JOIN public."Collection" c ON c.collection_id = src.collection_id
          WHERE cr.rule_id = src.rule_id
            AND c.collection_id IS NULL
          RETURNING cr.rule_id
        `,
      );

      report.fixes.collectionRuleOrphansDeleted = deleted.rowCount;
    }

    if (hasCartItem && hasCart && hasVariant) {
      const cartItemOrphans = await querySingleInt(
        client,
        `
          SELECT COUNT(*)::int AS c
          FROM public."CartItem" ci
          LEFT JOIN public."Cart" c ON c.cart_id = ci.cart_id
          LEFT JOIN public."Variant" v ON v.variant_id = ci.variant_id
          WHERE c.cart_id IS NULL OR v.variant_id IS NULL
        `,
      );

      report.findings.cartItemOrphans = cartItemOrphans;

      const deleted = await client.query(
        `
          DELETE FROM public."CartItem" ci
          USING public."CartItem" src
          LEFT JOIN public."Cart" c ON c.cart_id = src.cart_id
          LEFT JOIN public."Variant" v ON v.variant_id = src.variant_id
          WHERE ci.cart_item_id = src.cart_item_id
            AND (c.cart_id IS NULL OR v.variant_id IS NULL)
          RETURNING ci.cart_item_id
        `,
      );

      report.fixes.cartItemOrphansDeleted = deleted.rowCount;
    }

    if (hasOrderItem && hasOrder && hasVariant) {
      const orderItemOrphans = await querySingleInt(
        client,
        `
          SELECT COUNT(*)::int AS c
          FROM public."OrderItem" oi
          LEFT JOIN public."Order" o ON o.order_id = oi.order_id
          LEFT JOIN public."Variant" v ON v.variant_id = oi.variant_id
          WHERE o.order_id IS NULL OR v.variant_id IS NULL
        `,
      );

      report.findings.orderItemOrphans = orderItemOrphans;

      const deleted = await client.query(
        `
          DELETE FROM public."OrderItem" oi
          USING public."OrderItem" src
          LEFT JOIN public."Order" o ON o.order_id = src.order_id
          LEFT JOIN public."Variant" v ON v.variant_id = src.variant_id
          WHERE oi.order_item_id = src.order_item_id
            AND (o.order_id IS NULL OR v.variant_id IS NULL)
          RETURNING oi.order_item_id
        `,
      );

      report.fixes.orderItemOrphansDeleted = deleted.rowCount;
    }

    if (hasInventoryLevel && hasInventoryItem) {
      const inventoryLevelOrphans = await querySingleInt(
        client,
        `
          SELECT COUNT(*)::int AS c
          FROM public."InventoryLevel" il
          LEFT JOIN public."InventoryItem" ii ON ii.inventory_item_id = il.inventory_item_id
          WHERE ii.inventory_item_id IS NULL
        `,
      );

      report.findings.inventoryLevelOrphans = inventoryLevelOrphans;

      const deleted = await client.query(
        `
          DELETE FROM public."InventoryLevel" il
          USING public."InventoryLevel" src
          LEFT JOIN public."InventoryItem" ii ON ii.inventory_item_id = src.inventory_item_id
          WHERE il.inventory_level_id = src.inventory_level_id
            AND ii.inventory_item_id IS NULL
          RETURNING il.inventory_level_id
        `,
      );

      report.fixes.inventoryLevelOrphansDeleted = deleted.rowCount;
    }

    if (hasOptionValue && hasProductOption) {
      const optionValueOrphans = await querySingleInt(
        client,
        `
          SELECT COUNT(*)::int AS c
          FROM public."OptionValue" ov
          LEFT JOIN public."ProductOption" po ON po.option_id = ov.option_id
          WHERE po.option_id IS NULL
        `,
      );

      report.findings.optionValueOrphans = optionValueOrphans;

      const deleted = await client.query(
        `
          DELETE FROM public."OptionValue" ov
          USING public."OptionValue" src
          LEFT JOIN public."ProductOption" po ON po.option_id = src.option_id
          WHERE ov.value_id = src.value_id
            AND po.option_id IS NULL
          RETURNING ov.value_id
        `,
      );

      report.fixes.optionValueOrphansDeleted = deleted.rowCount;
    }

    if (hasProductOption && hasProduct) {
      const productOptionOrphans = await querySingleInt(
        client,
        `
          SELECT COUNT(*)::int AS c
          FROM public."ProductOption" po
          LEFT JOIN public."Product" p ON p.product_id = po.product_id
          WHERE p.product_id IS NULL
        `,
      );

      report.findings.productOptionOrphans = productOptionOrphans;

      const deleted = await client.query(
        `
          DELETE FROM public."ProductOption" po
          USING public."ProductOption" src
          LEFT JOIN public."Product" p ON p.product_id = src.product_id
          WHERE po.option_id = src.option_id
            AND p.product_id IS NULL
          RETURNING po.option_id
        `,
      );

      report.fixes.productOptionOrphansDeleted = deleted.rowCount;
    }

    if (hasVariant && hasProduct) {
      const variantProductOrphans = await querySingleInt(
        client,
        `
          SELECT COUNT(*)::int AS c
          FROM public."Variant" v
          LEFT JOIN public."Product" p ON p.product_id = v.product_id
          WHERE p.product_id IS NULL
        `,
      );

      report.findings.variantProductOrphans = variantProductOrphans;

      const deleted = await client.query(
        `
          DELETE FROM public."Variant" v
          USING public."Variant" src
          LEFT JOIN public."Product" p ON p.product_id = src.product_id
          WHERE v.variant_id = src.variant_id
            AND p.product_id IS NULL
          RETURNING v.variant_id
        `,
      );

      report.fixes.variantProductOrphansDeleted = deleted.rowCount;
    }

    if (hasVariant && hasInventoryItem) {
      const variantInventoryOrphans = await querySingleInt(
        client,
        `
          SELECT COUNT(*)::int AS c
          FROM public."Variant" v
          LEFT JOIN public."InventoryItem" ii ON ii.inventory_item_id = v.inventory_item_id
          WHERE v.inventory_item_id IS NOT NULL
            AND ii.inventory_item_id IS NULL
        `,
      );

      report.findings.variantInventoryOrphans = variantInventoryOrphans;

      const updated = await client.query(
        `
          UPDATE public."Variant" v
          SET inventory_item_id = NULL
          FROM public."Variant" src
          LEFT JOIN public."InventoryItem" ii ON ii.inventory_item_id = src.inventory_item_id
          WHERE v.variant_id = src.variant_id
            AND src.inventory_item_id IS NOT NULL
            AND ii.inventory_item_id IS NULL
          RETURNING v.variant_id
        `,
      );

      report.fixes.variantInventoryOrphansNullified = updated.rowCount;
    }

    if (hasMetafield) {
      // Remove malformed metafields
      const malformedMetafields = await querySingleInt(
        client,
        `
          SELECT COUNT(*)::int AS c
          FROM public."Metafield"
          WHERE owner_type IS NULL
             OR btrim(owner_type) = ''
             OR key IS NULL
             OR btrim(key) = ''
        `,
      );

      report.findings.malformedMetafields = malformedMetafields;

      const deletedMalformed = await client.query(
        `
          DELETE FROM public."Metafield"
          WHERE owner_type IS NULL
             OR btrim(owner_type) = ''
             OR key IS NULL
             OR btrim(key) = ''
          RETURNING id
        `,
      );

      report.fixes.malformedMetafieldsDeleted = deletedMalformed.rowCount;

      // Remove orphan product metafields
      if (hasProduct) {
        const orphanProductMetafields = await querySingleInt(
          client,
          `
            SELECT COUNT(*)::int AS c
            FROM public."Metafield" m
            LEFT JOIN public."Product" p ON p.product_id = m.owner_id
            WHERE lower(m.owner_type) = 'product'
              AND p.product_id IS NULL
          `,
        );

        report.findings.orphanProductMetafields = orphanProductMetafields;

        const deletedOrphanProductMetafields = await client.query(
          `
            DELETE FROM public."Metafield" m
            USING public."Metafield" src
            LEFT JOIN public."Product" p ON p.product_id = src.owner_id
            WHERE m.id = src.id
              AND lower(src.owner_type) = 'product'
              AND p.product_id IS NULL
            RETURNING m.id
          `,
        );

        report.fixes.orphanProductMetafieldsDeleted = deletedOrphanProductMetafields.rowCount;
      }

      // Remove orphan category metafields
      if (hasCategory) {
        const orphanCategoryMetafields = await querySingleInt(
          client,
          `
            SELECT COUNT(*)::int AS c
            FROM public."Metafield" m
            LEFT JOIN public."Category" c ON c.category_id = m.owner_id
            WHERE lower(m.owner_type) = 'category'
              AND c.category_id IS NULL
          `,
        );

        report.findings.orphanCategoryMetafields = orphanCategoryMetafields;

        const deletedOrphanCategoryMetafields = await client.query(
          `
            DELETE FROM public."Metafield" m
            USING public."Metafield" src
            LEFT JOIN public."Category" c ON c.category_id = src.owner_id
            WHERE m.id = src.id
              AND lower(src.owner_type) = 'category'
              AND c.category_id IS NULL
            RETURNING m.id
          `,
        );

        report.fixes.orphanCategoryMetafieldsDeleted = deletedOrphanCategoryMetafields.rowCount;
      }

      // Deduplicate metafields by owner_type/owner_id/key (keep newest id)
      const duplicateMetafieldRows = await querySingleInt(
        client,
        `
          SELECT COALESCE(SUM(cnt - 1), 0)::int AS c
          FROM (
            SELECT lower(owner_type) AS owner_type_norm, owner_id, lower(key) AS key_norm, COUNT(*)::int AS cnt
            FROM public."Metafield"
            GROUP BY lower(owner_type), owner_id, lower(key)
            HAVING COUNT(*) > 1
          ) d
        `,
      );

      report.findings.duplicateMetafields = duplicateMetafieldRows;

      const dedupeResult = await client.query(
        `
          WITH ranked AS (
            SELECT
              id,
              ROW_NUMBER() OVER (
                PARTITION BY lower(owner_type), owner_id, lower(key)
                ORDER BY id DESC
              ) AS rn
            FROM public."Metafield"
          )
          DELETE FROM public."Metafield" m
          USING ranked r
          WHERE m.id = r.id
            AND r.rn > 1
          RETURNING m.id
        `,
      );

      report.fixes.duplicateMetafieldsDeleted = dedupeResult.rowCount;
    }

    // 2) Missing core data normalization
    if (hasProduct) {
      const productsMissingHandle = await querySingleInt(
        client,
        `
          SELECT COUNT(*)::int AS c
          FROM public."Product"
          WHERE handle IS NULL OR btrim(handle) = ''
        `,
      );
      report.findings.productsMissingHandle = productsMissingHandle;

      const handleFix = await client.query(
        `
          WITH normalized AS (
            SELECT
              product_id,
              CASE
                WHEN btrim(regexp_replace(lower(COALESCE(title, '')), '[^a-z0-9]+', '-', 'g')) = '' THEN 'product'
                ELSE btrim(regexp_replace(lower(COALESCE(title, '')), '[^a-z0-9]+', '-', 'g'), '-')
              END AS base
            FROM public."Product"
            WHERE handle IS NULL OR btrim(handle) = ''
          )
          UPDATE public."Product" p
          SET handle = normalized.base || '-' || p.product_id::text
          FROM normalized
          WHERE p.product_id = normalized.product_id
          RETURNING p.product_id
        `,
      );
      report.fixes.productsHandleBackfilled = handleFix.rowCount;

      const productsMissingPrimaryImage = await querySingleInt(
        client,
        `
          SELECT COUNT(*)::int AS c
          FROM public."Product"
          WHERE (primary_image_url IS NULL OR btrim(primary_image_url) = '')
            AND media_urls IS NOT NULL
            AND jsonb_typeof(media_urls) = 'array'
            AND jsonb_array_length(media_urls) > 0
        `,
      );
      report.findings.productsMissingPrimaryImage = productsMissingPrimaryImage;

      const imageFix = await client.query(
        `
          UPDATE public."Product"
          SET primary_image_url = media_urls ->> 0
          WHERE (primary_image_url IS NULL OR btrim(primary_image_url) = '')
            AND media_urls IS NOT NULL
            AND jsonb_typeof(media_urls) = 'array'
            AND jsonb_array_length(media_urls) > 0
          RETURNING product_id
        `,
      );
      report.fixes.productsPrimaryImageBackfilled = imageFix.rowCount;

      const analyticsNulls = await querySingleInt(
        client,
        `
          SELECT COUNT(*)::int AS c
          FROM public."Product"
          WHERE order_count IS NULL
             OR order_count_30d IS NULL
             OR view_count IS NULL
             OR view_count_30d IS NULL
             OR add_to_cart_count IS NULL
             OR add_to_cart_count_30d IS NULL
             OR total_revenue IS NULL
             OR revenue_30d IS NULL
             OR best_selling_score IS NULL
             OR trending_score IS NULL
             OR related_product_ids IS NULL
             OR copurchased_product_ids IS NULL
             OR last_computed_at IS NULL
        `,
      );
      report.findings.productsWithNullAnalytics = analyticsNulls;

      const analyticsFix = await client.query(
        `
          UPDATE public."Product"
          SET
            order_count = COALESCE(order_count, 0),
            order_count_30d = COALESCE(order_count_30d, 0),
            view_count = COALESCE(view_count, 0),
            view_count_30d = COALESCE(view_count_30d, 0),
            add_to_cart_count = COALESCE(add_to_cart_count, 0),
            add_to_cart_count_30d = COALESCE(add_to_cart_count_30d, 0),
            total_revenue = COALESCE(total_revenue, 0),
            revenue_30d = COALESCE(revenue_30d, 0),
            best_selling_score = COALESCE(best_selling_score, 0),
            trending_score = COALESCE(trending_score, 0),
            related_product_ids = COALESCE(related_product_ids, '{}'::integer[]),
            copurchased_product_ids = COALESCE(copurchased_product_ids, '{}'::integer[]),
            last_computed_at = COALESCE(last_computed_at, NOW())
          WHERE order_count IS NULL
             OR order_count_30d IS NULL
             OR view_count IS NULL
             OR view_count_30d IS NULL
             OR add_to_cart_count IS NULL
             OR add_to_cart_count_30d IS NULL
             OR total_revenue IS NULL
             OR revenue_30d IS NULL
             OR best_selling_score IS NULL
             OR trending_score IS NULL
             OR related_product_ids IS NULL
             OR copurchased_product_ids IS NULL
             OR last_computed_at IS NULL
          RETURNING product_id
        `,
      );
      report.fixes.productsAnalyticsNormalized = analyticsFix.rowCount;
    }

    // 3) Category hierarchy sanity
    if (hasCategory) {
      const selfParentCategories = await querySingleInt(
        client,
        `
          SELECT COUNT(*)::int AS c
          FROM public."Category"
          WHERE parent_id IS NOT NULL
            AND parent_id = category_id
        `,
      );
      report.findings.categoriesSelfParent = selfParentCategories;

      const selfParentFix = await client.query(
        `
          UPDATE public."Category"
          SET parent_id = NULL
          WHERE parent_id IS NOT NULL
            AND parent_id = category_id
          RETURNING category_id
        `,
      );
      report.fixes.categoriesSelfParentFixed = selfParentFix.rowCount;

      const missingParentCategories = await querySingleInt(
        client,
        `
          SELECT COUNT(*)::int AS c
          FROM public."Category" c
          LEFT JOIN public."Category" p ON p.category_id = c.parent_id
          WHERE c.parent_id IS NOT NULL
            AND p.category_id IS NULL
        `,
      );
      report.findings.categoriesMissingParent = missingParentCategories;

      const missingParentFix = await client.query(
        `
          UPDATE public."Category" c
          SET parent_id = NULL
          WHERE c.parent_id IS NOT NULL
            AND NOT EXISTS (
              SELECT 1
              FROM public."Category" p
              WHERE p.category_id = c.parent_id
            )
          RETURNING c.category_id
        `,
      );
      report.fixes.categoriesMissingParentFixed = missingParentFix.rowCount;
    }

    await client.query('COMMIT');

    for (const table of trackedTables) {
      report.after[table] = await countRows(client, table);
    }

    console.log('Data quality audit/fix completed.');
    console.log(JSON.stringify(report, null, 2));
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Data quality audit/fix failed:', error.message);
  process.exit(1);
});
