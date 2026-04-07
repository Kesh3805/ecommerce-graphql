require('dotenv').config();
const { Client } = require('pg');

const sequenceTargets = [
  { table: 'User', column: 'user_id' },
  { table: 'Store', column: 'store_id' },
  { table: 'InventoryLocation', column: 'location_id' },
  { table: 'Category', column: 'category_id' },
  { table: 'Product', column: 'product_id' },
  { table: 'ProductSEO', column: 'product_seo_id' },
  { table: 'ProductOption', column: 'option_id' },
  { table: 'OptionValue', column: 'value_id' },
  { table: 'ProductCategory', column: 'id' },
  { table: 'InventoryItem', column: 'inventory_item_id' },
  { table: 'InventoryLevel', column: 'inventory_level_id' },
  { table: 'Variant', column: 'variant_id' },
  { table: 'Customer', column: 'customer_id' },
  { table: 'Cart', column: 'cart_id' },
  { table: 'CartItem', column: 'cart_item_id' },
  { table: 'CartSession', column: 'cart_session_id' },
  { table: 'Order', column: 'order_id' },
  { table: 'OrderItem', column: 'order_item_id' },
  { table: 'IdempotencyKey', column: 'idempotency_id' },
  { table: 'ProductMedia', column: 'media_id' },
  { table: 'VariantMedia', column: 'variant_media_id' },
  { table: 'VariantOptionSelection', column: 'selection_id' },
  { table: 'InventoryAdjustment', column: 'adjustment_id' },
  { table: 'InventoryReservation', column: 'reservation_id' },
];

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();

  try {
    await client.query('BEGIN');

    for (const { table, column } of sequenceTargets) {
      const sequenceRes = await client.query(
        `SELECT pg_get_serial_sequence('public."${table}"', '${column}') AS seq`,
      );
      const sequenceName = sequenceRes.rows[0]?.seq;
      if (!sequenceName) {
        continue;
      }

      await client.query(
        `SELECT setval($1, COALESCE((SELECT MAX("${column}") FROM public."${table}"), 1), true)`,
        [sequenceName],
      );

      const maxRes = await client.query(`SELECT COALESCE(MAX("${column}"), 1) AS max FROM public."${table}"`);
      console.log(`Synced ${table}.${column} -> ${maxRes.rows[0].max}`);
    }

    await client.query('COMMIT');
    console.log('✅ Sequence sync complete');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
