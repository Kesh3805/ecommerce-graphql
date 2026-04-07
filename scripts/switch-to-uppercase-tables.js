require('dotenv').config();
const { Client } = require('pg');

const mappings = [
  ['users', 'User'],
  ['stores', 'Store'],
  ['categories', 'Category'],
  ['products', 'Product'],
  ['product_seo', 'ProductSEO'],
  ['product_options', 'ProductOption'],
  ['option_values', 'OptionValue'],
  ['product_categories', 'ProductCategory'],
  ['variants', 'Variant'],
  ['variant_option_selections', 'VariantOptionSelection'],
  ['inventory_items', 'InventoryItem'],
  ['inventory_levels', 'InventoryLevel'],
  ['inventory_locations', 'InventoryLocation'],
  ['inventory_adjustments', 'InventoryAdjustment'],
  ['inventory_reservations', 'InventoryReservation'],
  ['carts', 'Cart'],
  ['cart_items', 'CartItem'],
  ['cart_sessions', 'CartSession'],
  ['orders', 'Order'],
  ['order_items', 'OrderItem'],
  ['idempotency_keys', 'IdempotencyKey'],
  ['product_media', 'ProductMedia'],
  ['variant_media', 'VariantMedia'],
];

async function tableExists(client, tableName) {
  const res = await client.query(
    `select exists (
      select 1 from information_schema.tables
      where table_schema='public' and table_name=$1
    ) as exists`,
    [tableName],
  );
  return res.rows[0].exists;
}

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  await client.query('BEGIN');

  try {
    for (const [lower, upper] of mappings) {
      const lowerExists = await tableExists(client, lower);
      const upperExists = await tableExists(client, upper);

      if (!lowerExists) {
        continue;
      }

      if (upperExists) {
        await client.query(`DROP TABLE public."${upper}" CASCADE`);
        console.log(`Dropped legacy uppercase table ${upper}`);
      }

      await client.query(`ALTER TABLE public.${lower} RENAME TO "${upper}"`);
      console.log(`Renamed ${lower} -> ${upper}`);
    }

    await client.query('COMMIT');
    console.log('Switched to uppercase tables successfully.');
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
