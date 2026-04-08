import 'dotenv/config';
import { Client } from 'pg';
import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    console.log('🌱 Seeding database...');
    await client.query('BEGIN');

    const alicePassword = await bcrypt.hash('password123', SALT_ROUNDS);
    const bobPassword = await bcrypt.hash('password123', SALT_ROUNDS);

    await client.query(
      `
      INSERT INTO public."User" (user_id, name, email, role, status, password_hash)
      VALUES
        (1, 'Alice Smith', 'alice@example.com', 'STORE_OWNER', 'active', $1),
        (2, 'Bob Jones', 'bob@example.com', 'STORE_OWNER', 'active', $2)
      ON CONFLICT (user_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        email = EXCLUDED.email,
        role = EXCLUDED.role,
        status = EXCLUDED.status,
        password_hash = EXCLUDED.password_hash
      `,
      [alicePassword, bobPassword],
    );

    await client.query(`
      INSERT INTO public."Store" (store_id, name, owner_user_id)
      VALUES
        (1, 'Alice''s Apparel', '11111111-1111-1111-1111-111111111111'),
        (2, 'Bob''s Electronics', '22222222-2222-2222-2222-222222222222')
      ON CONFLICT (store_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        owner_user_id = EXCLUDED.owner_user_id
    `);

    await client.query(`
      INSERT INTO public."InventoryLocation" (location_id, name, city, country, store_id)
      VALUES
        (1, 'Alice Main Warehouse', 'New York', 'US', 1),
        (2, 'Bob Main Warehouse', 'San Francisco', 'US', 2)
      ON CONFLICT (location_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        city = EXCLUDED.city,
        country = EXCLUDED.country,
        store_id = EXCLUDED.store_id
    `);

    await client.query(`
      INSERT INTO public."Category" (category_id, name, slug, parent_id, metadata)
      VALUES
        (1, 'Clothing', 'clothing', NULL, '{"icon":"shirt","featured":true}'::jsonb),
        (2, 'Electronics', 'electronics', NULL, '{"icon":"bolt","featured":true}'::jsonb),
        (3, 'T-Shirts', 't-shirts', 1, '{"icon":"tshirt","featured":false}'::jsonb),
        (4, 'Smartphones', 'smartphones', 2, '{"icon":"phone","featured":true}'::jsonb),
        (5, 'Laptops', 'laptops', 2, '{"icon":"laptop","featured":true}'::jsonb)
      ON CONFLICT (category_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        slug = EXCLUDED.slug,
        parent_id = EXCLUDED.parent_id,
        metadata = EXCLUDED.metadata
    `);

    await client.query(`
      INSERT INTO public."Product" (
        product_id,
        title,
        description,
        brand,
        status,
        store_id,
        handle,
        meta_title,
        meta_description,
        og_title,
        og_description,
        og_image,
        primary_image_url,
        media_urls
      )
      VALUES
        (1, 'Classic Cotton Tee', 'A comfortable everyday cotton t-shirt.', 'Alice Apparel', 'ACTIVE', 1, 'classic-cotton-tee', 'Classic Cotton Tee | Alice''s Apparel', 'Comfortable everyday cotton t-shirt.', 'Classic Cotton Tee', 'Classic Cotton Tee', 'https://example.com/images/classic-tee.jpg', 'https://example.com/images/classic-tee.jpg', '["https://example.com/images/classic-tee.jpg"]'::jsonb),
        (2, 'Urban Hoodie', 'A warm fleece hoodie for the urban explorer.', 'Alice Apparel', 'ACTIVE', 1, 'urban-hoodie', 'Urban Hoodie | Alice''s Apparel', 'Warm fleece hoodie for the urban explorer.', 'Urban Hoodie', 'Urban Hoodie', 'https://example.com/images/urban-hoodie.jpg', 'https://example.com/images/urban-hoodie.jpg', '["https://example.com/images/urban-hoodie.jpg"]'::jsonb),
        (3, 'ProPhone X', 'Flagship smartphone with a 108MP camera.', 'ProTech', 'ACTIVE', 2, 'prophone-x', 'ProPhone X | Bob''s Electronics', 'Flagship smartphone with 108MP camera.', 'ProPhone X', 'ProPhone X', 'https://example.com/images/prophone-x.jpg', 'https://example.com/images/prophone-x.jpg', '["https://example.com/images/prophone-x.jpg"]'::jsonb),
        (4, 'UltraBook Pro 15', 'Thin and light laptop with all-day battery life.', 'ProTech', 'ACTIVE', 2, 'ultrabook-pro-15', 'UltraBook Pro 15 | Bob''s Electronics', 'Thin and light laptop, all-day battery.', 'UltraBook Pro 15', 'UltraBook Pro 15', 'https://example.com/images/ultrabook-pro-15.jpg', 'https://example.com/images/ultrabook-pro-15.jpg', '["https://example.com/images/ultrabook-pro-15.jpg"]'::jsonb)
      ON CONFLICT (product_id)
      DO UPDATE SET
        title = EXCLUDED.title,
        description = EXCLUDED.description,
        brand = EXCLUDED.brand,
        status = EXCLUDED.status,
        store_id = EXCLUDED.store_id,
        handle = EXCLUDED.handle,
        meta_title = EXCLUDED.meta_title,
        meta_description = EXCLUDED.meta_description,
        og_title = EXCLUDED.og_title,
        og_description = EXCLUDED.og_description,
        og_image = EXCLUDED.og_image,
        primary_image_url = EXCLUDED.primary_image_url,
        media_urls = EXCLUDED.media_urls
    `);

    await client.query(`
      INSERT INTO public."ProductCategory" (id, product_id, category_id)
      VALUES
        (1, 1, 1),
        (2, 1, 3),
        (3, 2, 1),
        (4, 3, 2),
        (5, 3, 4),
        (6, 4, 2),
        (7, 4, 5)
      ON CONFLICT (id)
      DO UPDATE SET
        product_id = EXCLUDED.product_id,
        category_id = EXCLUDED.category_id
    `);

    await client.query(`
      INSERT INTO public."ProductOption" (option_id, name, position, product_id)
      VALUES
        (1, 'Size', 1, 1),
        (2, 'Color', 2, 1),
        (3, 'Storage', 1, 3),
        (4, 'Color', 2, 3),
        (5, 'Config', 1, 4)
      ON CONFLICT (option_id)
      DO UPDATE SET
        name = EXCLUDED.name,
        position = EXCLUDED.position,
        product_id = EXCLUDED.product_id
    `);

    await client.query(`
      INSERT INTO public."OptionValue" (value_id, value, position, option_id)
      VALUES
        (1, 'S', 0, 1),
        (2, 'M', 1, 1),
        (3, 'L', 2, 1),
        (4, 'XL', 3, 1),
        (5, 'White', 0, 2),
        (6, 'Black', 1, 2),
        (7, 'Navy', 2, 2),
        (8, '128GB', 0, 3),
        (9, '256GB', 1, 3),
        (10, '512GB', 2, 3),
        (11, 'Black', 0, 4),
        (12, 'Silver', 1, 4),
        (13, 'Gold', 2, 4),
        (14, '16GB / 512GB', 0, 5),
        (15, '32GB / 1TB', 1, 5)
      ON CONFLICT (value_id)
      DO UPDATE SET
        value = EXCLUDED.value,
        position = EXCLUDED.position,
        option_id = EXCLUDED.option_id
    `);

    await client.query(`
      INSERT INTO public."InventoryItem" (inventory_item_id, sku, tracked)
      VALUES
        (1, 'TEE-S-WHT', true),
        (2, 'TEE-M-WHT', true),
        (3, 'TEE-L-BLK', true),
        (4, 'TEE-XL-NVY', true),
        (5, 'PHN-128-BLK', true),
        (6, 'PHN-256-SLV', true),
        (7, 'PHN-512-GLD', true),
        (8, 'LPT-16-512', true),
        (9, 'LPT-32-1TB', true)
      ON CONFLICT (inventory_item_id)
      DO UPDATE SET
        sku = EXCLUDED.sku,
        tracked = EXCLUDED.tracked
    `);

    await client.query(`
      INSERT INTO public."InventoryLevel" (inventory_level_id, available_quantity, reserved_quantity, inventory_item_id, location_id)
      VALUES
        (1, 100, 0, 1, 1),
        (2, 100, 0, 2, 1),
        (3, 100, 0, 3, 1),
        (4, 100, 0, 4, 1),
        (5, 50, 0, 5, 2),
        (6, 50, 0, 6, 2),
        (7, 50, 0, 7, 2),
        (8, 30, 0, 8, 2),
        (9, 30, 0, 9, 2)
      ON CONFLICT (inventory_level_id)
      DO UPDATE SET
        available_quantity = EXCLUDED.available_quantity,
        reserved_quantity = EXCLUDED.reserved_quantity,
        inventory_item_id = EXCLUDED.inventory_item_id,
        location_id = EXCLUDED.location_id
    `);

    await client.query(`
      INSERT INTO public."Variant" (
        variant_id,
        product_id,
        option1_value,
        option2_value,
        sku,
        price,
        inventory_policy,
        inventory_item_id,
        is_default
      )
      VALUES
        (1, 1, 'S', 'White', 'TEE-S-WHT', 19.99, 'DENY', 1, true),
        (2, 1, 'M', 'White', 'TEE-M-WHT', 19.99, 'DENY', 2, false),
        (3, 1, 'L', 'Black', 'TEE-L-BLK', 19.99, 'DENY', 3, false),
        (4, 1, 'XL', 'Navy', 'TEE-XL-NVY', 21.99, 'DENY', 4, false),
        (5, 3, '128GB', 'Black', 'PHN-128-BLK', 799.00, 'DENY', 5, true),
        (6, 3, '256GB', 'Silver', 'PHN-256-SLV', 899.00, 'DENY', 6, false),
        (7, 3, '512GB', 'Gold', 'PHN-512-GLD', 999.00, 'DENY', 7, false),
        (8, 4, '16GB / 512GB', NULL, 'LPT-16-512', 1299.00, 'DENY', 8, true),
        (9, 4, '32GB / 1TB', NULL, 'LPT-32-1TB', 1599.00, 'DENY', 9, false)
      ON CONFLICT (variant_id)
      DO UPDATE SET
        product_id = EXCLUDED.product_id,
        option1_value = EXCLUDED.option1_value,
        option2_value = EXCLUDED.option2_value,
        sku = EXCLUDED.sku,
        price = EXCLUDED.price,
        inventory_policy = EXCLUDED.inventory_policy,
        inventory_item_id = EXCLUDED.inventory_item_id,
        is_default = EXCLUDED.is_default
    `);

    const generatedProductsByStore = new Map<number, number[]>();
    let nextProductId = 100;
    let nextProductCategoryId = 200;
    let nextOptionId = 100;
    let nextOptionValueId = 200;
    let nextVariantId = 100;
    let nextInventoryItemId = 100;
    let nextInventoryLevelId = 100;
    let nextCollectionId = 100;
    let nextCollectionRuleId = 100;
    let nextCollectionProductLinkId = 200;

    const catalogPlans = [
      {
        storeId: 1,
        locationId: 1,
        brand: 'Alice Apparel',
        categoryIds: [1, 3],
        baseTitles: ['Everyday Tee', 'Studio Hoodie', 'Athleisure Jogger', 'Soft Knit Cardigan', 'Layered Jacket'],
        optionTemplate: {
          names: ['Size', 'Color'],
          values: [
            ['S', 'M', 'L', 'XL'],
            ['Black', 'White', 'Navy', 'Sand'],
          ],
        },
      },
      {
        storeId: 2,
        locationId: 2,
        brand: 'Bob Electronics',
        categoryIds: [2, 4, 5],
        baseTitles: ['Smart Speaker', 'Noise Cancelling Headphones', 'UltraWide Monitor', 'Gaming Laptop', 'Portable SSD'],
        optionTemplate: {
          names: ['Config', 'Color'],
          values: [
            ['Base', 'Plus', 'Pro'],
            ['Black', 'Silver', 'Graphite'],
          ],
        },
      },
    ];

    for (const plan of catalogPlans) {
      generatedProductsByStore.set(plan.storeId, []);

      for (let i = 0; i < 36; i++) {
        const productId = nextProductId++;
        const title = `${plan.baseTitles[i % plan.baseTitles.length]} ${i + 1}`;
        const handle = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}-${plan.storeId}`;
        const mediaUrls = [
          `https://picsum.photos/seed/${handle}-1/1200/1200`,
          `https://picsum.photos/seed/${handle}-2/1200/1200`,
          `https://picsum.photos/seed/${handle}-3/1200/1200`,
        ];

        await client.query(
          `
          INSERT INTO public."Product" (
            product_id,
            title,
            description,
            brand,
            status,
            store_id,
            handle,
            meta_title,
            meta_description,
            og_title,
            og_description,
            og_image,
            primary_image_url,
            media_urls
          )
          VALUES ($1, $2, $3, $4, 'ACTIVE', $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
          ON CONFLICT (product_id)
          DO UPDATE SET
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            brand = EXCLUDED.brand,
            status = EXCLUDED.status,
            store_id = EXCLUDED.store_id,
            handle = EXCLUDED.handle,
            meta_title = EXCLUDED.meta_title,
            meta_description = EXCLUDED.meta_description,
            og_title = EXCLUDED.og_title,
            og_description = EXCLUDED.og_description,
            og_image = EXCLUDED.og_image,
            primary_image_url = EXCLUDED.primary_image_url,
            media_urls = EXCLUDED.media_urls
          `,
          [
            productId,
            title,
            `Premium ${title} from ${plan.brand}.`,
            plan.brand,
            plan.storeId,
            handle,
            `${title} | ${plan.brand}`,
            `Buy ${title} from ${plan.brand}.`,
            title,
            `Shop ${title}`,
            mediaUrls[0],
            mediaUrls[0],
            JSON.stringify(mediaUrls),
          ],
        );

        for (const categoryId of plan.categoryIds.slice(0, 2)) {
          await client.query(
            `
            INSERT INTO public."ProductCategory" (id, product_id, category_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (product_id, category_id)
            DO NOTHING
            `,
            [nextProductCategoryId++, productId, categoryId],
          );
        }

        const optionIds: number[] = [];
        for (let optionIndex = 0; optionIndex < plan.optionTemplate.names.length; optionIndex++) {
          const optionId = nextOptionId++;
          optionIds.push(optionId);

          await client.query(
            `
            INSERT INTO public."ProductOption" (option_id, name, position, product_id)
            VALUES ($1, $2, $3, $4)
            ON CONFLICT (option_id)
            DO UPDATE SET
              name = EXCLUDED.name,
              position = EXCLUDED.position,
              product_id = EXCLUDED.product_id
            `,
            [optionId, plan.optionTemplate.names[optionIndex], optionIndex + 1, productId],
          );

          for (const [valuePosition, optionValue] of plan.optionTemplate.values[optionIndex].entries()) {
            await client.query(
              `
              INSERT INTO public."OptionValue" (value_id, value, position, option_id)
              VALUES ($1, $2, $3, $4)
              ON CONFLICT (value_id)
              DO UPDATE SET
                value = EXCLUDED.value,
                position = EXCLUDED.position,
                option_id = EXCLUDED.option_id
              `,
              [nextOptionValueId++, optionValue, valuePosition, optionId],
            );
          }
        }

        for (let variantIndex = 0; variantIndex < 3; variantIndex++) {
          const inventoryItemId = nextInventoryItemId++;
          const variantId = nextVariantId++;
          const basePrice = plan.storeId === 1 ? 29 + i * 0.35 : 199 + i * 3.5;
          const price = Number((basePrice + variantIndex * (plan.storeId === 1 ? 4 : 35)).toFixed(2));
          const compareAtPrice = Number((price + (plan.storeId === 1 ? 8 : 60)).toFixed(2));
          const sku = `${plan.storeId === 1 ? 'ALC' : 'BOB'}-${productId}-${variantIndex + 1}`;

          await client.query(
            `
            INSERT INTO public."InventoryItem" (inventory_item_id, sku, tracked)
            VALUES ($1, $2, true)
            ON CONFLICT (inventory_item_id)
            DO UPDATE SET sku = EXCLUDED.sku
            `,
            [inventoryItemId, sku],
          );

          await client.query(
            `
            INSERT INTO public."InventoryLevel" (inventory_level_id, available_quantity, reserved_quantity, inventory_item_id, location_id)
            VALUES ($1, $2, 0, $3, $4)
            ON CONFLICT (inventory_level_id)
            DO UPDATE SET
              available_quantity = EXCLUDED.available_quantity,
              reserved_quantity = EXCLUDED.reserved_quantity,
              inventory_item_id = EXCLUDED.inventory_item_id,
              location_id = EXCLUDED.location_id
            `,
            [nextInventoryLevelId++, plan.storeId === 1 ? 120 - variantIndex * 5 : 70 - variantIndex * 4, inventoryItemId, plan.locationId],
          );

          await client.query(
            `
            INSERT INTO public."Variant" (
              variant_id,
              product_id,
              option1_value,
              option2_value,
              sku,
              price,
              compare_at_price,
              inventory_policy,
              inventory_item_id,
              is_default
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, 'DENY', $8, $9)
            ON CONFLICT (variant_id)
            DO UPDATE SET
              product_id = EXCLUDED.product_id,
              option1_value = EXCLUDED.option1_value,
              option2_value = EXCLUDED.option2_value,
              sku = EXCLUDED.sku,
              price = EXCLUDED.price,
              compare_at_price = EXCLUDED.compare_at_price,
              inventory_item_id = EXCLUDED.inventory_item_id,
              is_default = EXCLUDED.is_default
            `,
            [
              variantId,
              productId,
              plan.optionTemplate.values[0][variantIndex],
              plan.optionTemplate.values[1][variantIndex],
              sku,
              price,
              compareAtPrice,
              inventoryItemId,
              variantIndex === 0,
            ],
          );
        }

        generatedProductsByStore.get(plan.storeId)?.push(productId);
      }
    }

    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_product_store_status_published
        ON public."Product" (store_id, status, published_at DESC);
      CREATE INDEX IF NOT EXISTS idx_productcategory_category
        ON public."ProductCategory" (category_id);
      CREATE INDEX IF NOT EXISTS idx_collectionrule_collection_group
        ON public."CollectionRule" (collection_id, rule_group);
      CREATE INDEX IF NOT EXISTS idx_collection_store_visible_position
        ON public."Collection" (store_id, is_visible, position);
      CREATE INDEX IF NOT EXISTS idx_variant_product_price
        ON public."Variant" (product_id, price);
    `);

    for (const plan of catalogPlans) {
      const productIds = generatedProductsByStore.get(plan.storeId) || [];
      const manualCollectionId = nextCollectionId++;
      const automatedCollectionId = nextCollectionId++;

      await client.query(
        `
        INSERT INTO public."Collection" (
          collection_id,
          store_id,
          name,
          slug,
          description,
          collection_type,
          image_url,
          is_visible,
          position,
          meta_title,
          meta_description
        )
        VALUES
          ($1, $2, $3, $4, $5, 'MANUAL', $6, true, 1, $7, $8),
          ($9, $2, $10, $11, $12, 'AUTOMATED', $13, true, 2, $14, $15)
        ON CONFLICT (collection_id)
        DO UPDATE SET
          store_id = EXCLUDED.store_id,
          name = EXCLUDED.name,
          slug = EXCLUDED.slug,
          description = EXCLUDED.description,
          collection_type = EXCLUDED.collection_type,
          image_url = EXCLUDED.image_url,
          is_visible = EXCLUDED.is_visible,
          position = EXCLUDED.position,
          meta_title = EXCLUDED.meta_title,
          meta_description = EXCLUDED.meta_description
        `,
        [
          manualCollectionId,
          plan.storeId,
          `${plan.brand} Featured Picks`,
          `${plan.brand.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-featured`,
          `Manually curated products for ${plan.brand}.`,
          `https://picsum.photos/seed/${plan.storeId}-manual-collection/1600/900`,
          `${plan.brand} Featured Picks`,
          `Curated picks for ${plan.brand}`,
          automatedCollectionId,
          `${plan.brand} Auto Collection`,
          `${plan.brand.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-auto`,
          `Automatically matched products for ${plan.brand}.`,
          `https://picsum.photos/seed/${plan.storeId}-auto-collection/1600/900`,
          `${plan.brand} Auto Collection`,
          `Automated collection for ${plan.brand}`,
        ],
      );

      for (const [position, productId] of productIds.slice(0, 14).entries()) {
        await client.query(
          `
          INSERT INTO public."CollectionProduct" (id, collection_id, product_id, position)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (collection_id, product_id)
          DO UPDATE SET position = EXCLUDED.position
          `,
          [nextCollectionProductLinkId++, manualCollectionId, productId, position],
        );
      }

      await client.query('DELETE FROM public."CollectionRule" WHERE collection_id = $1', [automatedCollectionId]);

      if (plan.storeId === 1) {
        await client.query(
          `
          INSERT INTO public."CollectionRule" (rule_id, collection_id, rule_group, field, operator, value, value_type)
          VALUES ($1, $2, 0, 'brand', 'CONTAINS', 'Alice Apparel', 'STRING')
          ON CONFLICT (rule_id)
          DO UPDATE SET
            collection_id = EXCLUDED.collection_id,
            rule_group = EXCLUDED.rule_group,
            field = EXCLUDED.field,
            operator = EXCLUDED.operator,
            value = EXCLUDED.value,
            value_type = EXCLUDED.value_type
          `,
          [nextCollectionRuleId++, automatedCollectionId],
        );
      } else {
        await client.query(
          `
          INSERT INTO public."CollectionRule" (rule_id, collection_id, rule_group, field, operator, value, value_type)
          VALUES
            ($1, $2, 0, 'brand', 'CONTAINS', 'Bob Electronics', 'STRING'),
            ($3, $2, 0, 'category', 'EQUALS', '2', 'NUMBER')
          ON CONFLICT (rule_id)
          DO UPDATE SET
            collection_id = EXCLUDED.collection_id,
            rule_group = EXCLUDED.rule_group,
            field = EXCLUDED.field,
            operator = EXCLUDED.operator,
            value = EXCLUDED.value,
            value_type = EXCLUDED.value_type
          `,
          [nextCollectionRuleId++, automatedCollectionId, nextCollectionRuleId++, automatedCollectionId],
        );
      }
    }

    await client.query(`
      INSERT INTO public."Customer" (customer_id, user_id)
      VALUES
        (1, 1),
        (2, 2)
      ON CONFLICT (customer_id)
      DO UPDATE SET
        user_id = EXCLUDED.user_id
    `);

    const sequenceTargets: Array<{ table: string; column: string }> = [
      { table: 'User', column: 'user_id' },
      { table: 'Store', column: 'store_id' },
      { table: 'InventoryLocation', column: 'location_id' },
      { table: 'Category', column: 'category_id' },
      { table: 'Product', column: 'product_id' },
      { table: 'ProductOption', column: 'option_id' },
      { table: 'OptionValue', column: 'value_id' },
      { table: 'ProductCategory', column: 'id' },
      { table: 'InventoryItem', column: 'inventory_item_id' },
      { table: 'InventoryLevel', column: 'inventory_level_id' },
      { table: 'Variant', column: 'variant_id' },
      { table: 'Collection', column: 'collection_id' },
      { table: 'CollectionProduct', column: 'id' },
      { table: 'CollectionRule', column: 'rule_id' },
      { table: 'Customer', column: 'customer_id' },
    ];

    for (const { table, column } of sequenceTargets) {
      const maxRes = await client.query(
        `SELECT COALESCE(MAX("${column}"), 0)::int AS max_id FROM public."${table}"`,
      );
      const nextValue = Number(maxRes.rows[0].max_id) + 1;

      const serialRes = await client.query(
        `SELECT pg_get_serial_sequence('public."${table}"', '${column}') AS seq`,
      );
      const serialSeq = serialRes.rows[0]?.seq as string | null;

      const defaultRes = await client.query(
        `
          SELECT column_default
          FROM information_schema.columns
          WHERE table_schema='public' AND table_name=$1 AND column_name=$2
        `,
        [table, column],
      );

      const defaultText = (defaultRes.rows[0]?.column_default ?? '') as string;
      const defaultMatch = defaultText.match(/nextval\('(.+?)'::regclass\)/i);
      const defaultSeqRaw = defaultMatch?.[1] ?? null;

      const candidateSeqs = new Set<string>();
      if (serialSeq) {
        candidateSeqs.add(serialSeq);
      }

      if (defaultSeqRaw) {
        candidateSeqs.add(defaultSeqRaw);
        candidateSeqs.add(defaultSeqRaw.replace(/"/g, ''));

        if (!defaultSeqRaw.includes('.')) {
          candidateSeqs.add(`public.${defaultSeqRaw}`);
          const withoutQuotes = defaultSeqRaw.replace(/"/g, '');
          candidateSeqs.add(`public.${withoutQuotes}`);
        }
      }

      for (const seqName of candidateSeqs) {
        const existsRes = await client.query('SELECT to_regclass($1) AS reg', [seqName]);
        if (!existsRes.rows[0]?.reg) {
          continue;
        }

        await client.query('SELECT setval($1, $2, false)', [seqName, nextValue]);
      }
    }

    await client.query('COMMIT');
    console.log('✅ Seed complete!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Seed failed:', error);
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});
