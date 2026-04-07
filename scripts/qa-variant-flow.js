require('dotenv').config();

const endpoint = process.env.QA_GRAPHQL_URL || 'http://localhost:4100/graphql';

async function gql(query, variables = {}) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.errors?.length) {
    throw new Error(JSON.stringify(payload.errors));
  }

  return payload.data;
}

(async () => {
  const timestamp = Date.now();
  const storeId = 1;

  const created = await gql(
    `mutation($input: CreateProductInput!) {
      createProduct(input: $input) { product_id }
    }`,
    {
      input: {
        title: `QA Variant Product ${timestamp}`,
        description: 'qa',
        brand: 'qa',
        store_id: storeId,
        status: 'DRAFT',
        seo: { handle: `qa-variant-product-${timestamp}` },
      },
    },
  );

  const productId = Number(created.createProduct.product_id);

  await gql(
    `mutation($input: AddProductOptionInput!) {
      addProductOption(input: $input) { option_id }
    }`,
    { input: { product_id: productId, name: 'Size', values: ['S', 'M'], position: 0 } },
  );

  await gql(
    `mutation($input: AddProductOptionInput!) {
      addProductOption(input: $input) { option_id }
    }`,
    { input: { product_id: productId, name: 'Color', values: ['Black', 'White'], position: 1 } },
  );

  const locationsResult = await gql(
    `query($storeId: Int!) {
      locations(storeId: $storeId) { location_id is_active }
    }`,
    { storeId },
  );

  const locations = locationsResult.locations || [];
  const activeLocation = locations.find((loc) => loc.is_active) || locations[0];

  const rows = [
    { option1: 'S', option2: 'Black', sku: `QA-${timestamp}-S-BLK`, price: 101, policy: 'DENY', qty: 11 },
    { option1: 'S', option2: 'White', sku: `QA-${timestamp}-S-WHT`, price: 102, policy: 'CONTINUE', qty: 12 },
    { option1: 'M', option2: 'Black', sku: `QA-${timestamp}-M-BLK`, price: 103, policy: 'DENY', qty: 13 },
    { option1: 'M', option2: 'White', sku: `QA-${timestamp}-M-WHT`, price: 104, policy: 'CONTINUE', qty: 14 },
  ];

  for (const row of rows) {
    const variantResult = await gql(
      `mutation($input: CreateVariantInput!) {
        createVariant(input: $input) {
          variant_id
          inventory_item_id
          inventory_policy
        }
      }`,
      {
        input: {
          product_id: productId,
          option1_value: row.option1,
          option2_value: row.option2,
          sku: row.sku,
          price: row.price,
          inventory_policy: row.policy,
          create_inventory: true,
        },
      },
    );

    const inventoryItemId = Number(variantResult.createVariant.inventory_item_id || 0);

    if (activeLocation && inventoryItemId > 0) {
      await gql(
        `mutation($input: SetInventoryLevelInput!) {
          setInventoryLevel(input: $input) {
            level { inventory_level_id available_quantity }
          }
        }`,
        {
          input: {
            inventory_item_id: inventoryItemId,
            location_id: Number(activeLocation.location_id),
            available_quantity: row.qty,
          },
        },
      );
    }
  }

  const variantsResult = await gql(
    `query($productId: Int!) {
      variants(productId: $productId) {
        variant_id
        sku
        inventory_policy
        inventory_item { total_available }
      }
    }`,
    { productId },
  );

  const variants = variantsResult.variants || [];
  const policies = [...new Set(variants.map((v) => v.inventory_policy))].sort().join(',');
  const totalAvailable = variants.reduce((sum, v) => sum + Number(v.inventory_item?.total_available || 0), 0);

  console.log(
    JSON.stringify(
      {
        ok: true,
        productId,
        variantCount: variants.length,
        policies,
        totalAvailable,
      },
      null,
      2,
    ),
  );
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
