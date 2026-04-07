require('dotenv').config();
const { Client } = require('pg');

const tableMappings = [
  { lower: 'users', upper: 'User', pk: 'user_id' },
  { lower: 'stores', upper: 'Store', pk: 'store_id' },
  { lower: 'categories', upper: 'Category', pk: 'category_id' },
  { lower: 'products', upper: 'Product', pk: 'product_id' },
  { lower: 'product_seo', upper: 'ProductSEO', pk: 'product_seo_id' },
  { lower: 'product_options', upper: 'ProductOption', pk: 'option_id' },
  { lower: 'option_values', upper: 'OptionValue', pk: 'value_id' },
  { lower: 'product_categories', upper: 'ProductCategory', pk: 'id' },
  { lower: 'variants', upper: 'Variant', pk: 'variant_id' },
  { lower: 'variant_option_selections', upper: 'VariantOptionSelection', pk: 'selection_id' },
  { lower: 'inventory_items', upper: 'InventoryItem', pk: 'inventory_item_id' },
  { lower: 'inventory_levels', upper: 'InventoryLevel', pk: 'inventory_level_id' },
  { lower: 'inventory_locations', upper: 'InventoryLocation', pk: 'location_id' },
  { lower: 'inventory_adjustments', upper: 'InventoryAdjustment', pk: 'adjustment_id' },
  { lower: 'inventory_reservations', upper: 'InventoryReservation', pk: 'reservation_id' },
  { lower: 'carts', upper: 'Cart', pk: 'cart_id' },
  { lower: 'cart_items', upper: 'CartItem', pk: 'cart_item_id' },
  { lower: 'cart_sessions', upper: 'CartSession', pk: 'cart_session_id' },
  { lower: 'orders', upper: 'Order', pk: 'order_id' },
  { lower: 'order_items', upper: 'OrderItem', pk: 'order_item_id' },
  { lower: 'idempotency_keys', upper: 'IdempotencyKey', pk: 'idempotency_id' },
  { lower: 'product_media', upper: 'ProductMedia', pk: 'media_id' },
  { lower: 'variant_media', upper: 'VariantMedia', pk: 'variant_media_id' },
];

async function tableExists(client, tableName) {
  const res = await client.query(
    `select exists (
      select 1 from information_schema.tables
      where table_schema = 'public' and table_name = $1
    ) as exists`,
    [tableName],
  );
  return res.rows[0].exists;
}

async function getColumns(client, tableName) {
  const res = await client.query(
    `select column_name from information_schema.columns
     where table_schema = 'public' and table_name = $1
     order by ordinal_position`,
    [tableName],
  );
  return res.rows.map((r) => r.column_name);
}

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  await client.query('BEGIN');

  try {
    for (const mapping of tableMappings) {
      const lowerExists = await tableExists(client, mapping.lower);
      const upperExists = await tableExists(client, mapping.upper);

      if (!lowerExists) {
        continue;
      }

      if (!upperExists) {
        await client.query(`ALTER TABLE public.${mapping.lower} RENAME TO "${mapping.upper}"`);
        console.log(`Renamed ${mapping.lower} -> ${mapping.upper}`);
        continue;
      }

      const lowerCols = await getColumns(client, mapping.lower);
      const upperCols = await getColumns(client, mapping.upper);
      const commonCols = lowerCols.filter((col) => upperCols.includes(col));

      if (commonCols.length > 0) {
        const quotedCols = commonCols.map((c) => `"${c}"`).join(', ');
        const hasPk = commonCols.includes(mapping.pk);
        const upsert = hasPk ? ` ON CONFLICT ("${mapping.pk}") DO NOTHING` : '';

        await client.query(
          `INSERT INTO public."${mapping.upper}" (${quotedCols})
           SELECT ${quotedCols} FROM public.${mapping.lower}${upsert}`,
        );
        console.log(`Merged rows ${mapping.lower} -> ${mapping.upper}`);
      }

      await client.query(`DROP TABLE public.${mapping.lower} CASCADE`);
      console.log(`Dropped lowercase table ${mapping.lower}`);
    }

    await client.query('COMMIT');
    console.log('Table casing migration completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
