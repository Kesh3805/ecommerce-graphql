require('dotenv').config();
const { Client } = require('pg');

const targets = [
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
  { table: 'InventoryAdjustment', column: 'adjustment_id' },
  { table: 'InventoryReservation', column: 'reservation_id' },
  { table: 'Variant', column: 'variant_id' },
  { table: 'VariantOptionSelection', column: 'selection_id' },
  { table: 'Cart', column: 'cart_id' },
  { table: 'CartItem', column: 'cart_item_id' },
  { table: 'CartSession', column: 'cart_session_id' },
  { table: 'Order', column: 'order_id' },
  { table: 'OrderItem', column: 'order_item_id' },
  { table: 'IdempotencyKey', column: 'idempotency_id' },
  { table: 'ProductMedia', column: 'media_id' },
  { table: 'VariantMedia', column: 'variant_media_id' },
  { table: 'Customer', column: 'customer_id' },
];

function extractSequenceFromDefault(columnDefault) {
  if (!columnDefault) return null;
  const match = columnDefault.match(/nextval\('(.+?)'::regclass\)/i);
  if (!match) return null;
  return match[1].replace(/"/g, '');
}

(async () => {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    for (const { table, column } of targets) {
      const maxRes = await client.query(`SELECT COALESCE(MAX("${column}"), 0)::int AS max_id FROM public."${table}"`);
      const nextValue = Number(maxRes.rows[0].max_id) + 1;

      const colRes = await client.query(
        `SELECT column_default
         FROM information_schema.columns
         WHERE table_schema='public' AND table_name=$1 AND column_name=$2`,
        [table, column],
      );

      const defaultSeq = extractSequenceFromDefault(colRes.rows[0]?.column_default || null);
      const serialRes = await client.query(`SELECT pg_get_serial_sequence('public."${table}"', '${column}') AS seq`);
      const serialSeq = serialRes.rows[0]?.seq || null;

      const sequences = new Set();
      if (defaultSeq) sequences.add(defaultSeq);
      if (serialSeq) sequences.add(serialSeq);

      if (defaultSeq && !defaultSeq.includes('.')) {
        sequences.add(`public.${defaultSeq}`);
        const withoutQuotes = defaultSeq.replace(/"/g, '');
        sequences.add(`public.${withoutQuotes}`);
      }

      for (const seq of sequences) {
        const existsRes = await client.query('SELECT to_regclass($1) AS reg', [seq]);
        if (!existsRes.rows[0]?.reg) {
          continue;
        }
        await client.query('SELECT setval($1, $2, false)', [seq, nextValue]);
      }

      if (sequences.size > 0) {
        console.log(`${table}.${column} -> next ${nextValue} [${Array.from(sequences).join(', ')}]`);
      }
    }

    await client.query('COMMIT');
    console.log('✅ All ID sequences synchronized');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
