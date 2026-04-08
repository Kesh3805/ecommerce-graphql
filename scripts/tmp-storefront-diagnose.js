require('dotenv').config();
const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const storeStatus = await client.query(`
    select s.store_id, s.name, p.status, count(*)::int as cnt
    from "Store" s
    left join "Product" p on p.store_id = s.store_id
    group by s.store_id, s.name, p.status
    order by s.store_id, p.status
  `);

  console.log('STORE_STATUS_COUNTS');
  console.table(storeStatus.rows);

  const aliceProducts = await client.query(`
    select
      p.product_id,
      p.title,
      p.status,
      coalesce(seo.handle, '') as handle,
      p.store_id,
      s.name as store_name
    from "Product" p
    join "Store" s on s.store_id = p.store_id
    left join "ProductSEO" seo on seo.product_id = p.product_id
    where lower(s.name) like '%alice%'
    order by p.product_id
  `);

  console.log('ALICE_PRODUCTS');
  console.table(aliceProducts.rows);

  await client.end();
})();
