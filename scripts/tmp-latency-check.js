const endpoint = process.env.GRAPHQL_ENDPOINT || 'http://localhost:3000/graphql';

async function fetchQ(name, query, variables) {
  const started = Date.now();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  const payload = await response.json();
  const elapsed = Date.now() - started;
  console.log(`${name}: ${elapsed}ms errors=${payload.errors ? 'yes' : 'no'}`);
  if (payload.errors) {
    console.log(payload.errors.map((entry) => entry.message).join(' | '));
  }

  return payload;
}

async function main() {
  const qStore = `
    query($slug: String!, $productLimit: Int!, $countryCode: String) {
      publicStoreBySlug(slug: $slug, productLimit: $productLimit, countryCode: $countryCode) {
        store_id
        name
        products { product_id }
      }
    }
  `;

  const qCols = `
    query($filter: CollectionFilterInput) {
      collections(filter: $filter) {
        collection_id
        slug
      }
    }
  `;

  const qCol = `
    query($slug: String!, $storeId: Int!) {
      collectionBySlug(slug: $slug, storeId: $storeId) {
        collection_id
        products(limit: 12) { product_id }
      }
    }
  `;

  const qProd = `
    query($handle: String!, $countryCode: String) {
      publicProductByHandle(handle: $handle, countryCode: $countryCode) {
        product_id
        handle
      }
    }
  `;

  const qStores = `
    query($storeLimit: Int!, $productLimit: Int!, $countryCode: String) {
      publicStores(storeLimit: $storeLimit, productLimit: $productLimit, countryCode: $countryCode) {
        store_id
        products { product_id }
      }
    }
  `;

  const storePayload = await fetchQ('publicStoreBySlug alice', qStore, {
    slug: 'alice-s-apparel',
    productLimit: 12,
  });

  const storeId = storePayload?.data?.publicStoreBySlug?.store_id;

  await fetchQ('publicStores', qStores, {
    storeLimit: 30,
    productLimit: 1,
  });

  if (storeId) {
    const collectionsPayload = await fetchQ('collections', qCols, {
      filter: { is_visible: true, store_id: storeId },
    });

    const firstSlug = collectionsPayload?.data?.collections?.[0]?.slug;
    if (firstSlug) {
      await fetchQ('collectionBySlug first', qCol, {
        slug: firstSlug,
        storeId,
      });
    }

    await fetchQ('collectionBySlug new-arrivals', qCol, {
      slug: 'new-arrivals',
      storeId,
    });

    await fetchQ('collectionBySlug summer-collection', qCol, {
      slug: 'summer-collection',
      storeId,
    });
  }

  await fetchQ('publicProductByHandle urban-hoodie', qProd, {
    handle: 'urban-hoodie',
  });

  await fetchQ('publicProductByHandle classic-cotton-tee', qProd, {
    handle: 'classic-cotton-tee',
  });

  await fetchQ('publicProductByHandle short-sleeve-t-shirts', qProd, {
    handle: 'short-sleeve-t-shirts',
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
