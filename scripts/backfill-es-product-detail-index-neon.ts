import 'dotenv/config';

import { Client as ElasticsearchClient } from '@elastic/elasticsearch';
import { neon } from '@neondatabase/serverless';

type RawOption = {
  name?: string;
  values?: string[];
};

type RawVariant = {
  variant_id?: number;
  title?: string;
  sku?: string;
  option1_value?: string;
  option2_value?: string;
  option3_value?: string;
  price?: string | null;
  compare_at_price?: string | null;
};

type ProductRow = {
  product_id: number;
  store_id: number;
  store_name: string;
  title: string;
  brand: string | null;
  description: string | null;
  handle: string;
  media_urls: unknown;
  primary_image_url: string | null;
  og_image: string | null;
  options: unknown;
  variants: unknown;
  country_codes: unknown;
};

type IndexedProductDetailDocument = {
  product_id: number;
  store_id: number;
  store_name: string;
  title: string;
  brand?: string;
  description?: string;
  handle: string;
  image_url?: string;
  media_urls?: string[];
  price?: string;
  compare_at_price?: string;
  options?: Array<{ name: string; values: string[] }>;
  variants?: Array<{
    variant_id: number;
    title?: string;
    sku?: string;
    option1_value?: string;
    option2_value?: string;
    option3_value?: string;
    price?: string;
    compare_at_price?: string;
  }>;
  handle_lower: string;
  country_codes: string[];
  status: 'ACTIVE';
  updated_at: string;
};

const DEFAULT_INDEX = 'products_detail_v1';

function normalizeHandle(handle: string): string {
  return handle.trim().toLowerCase();
}

function parsePgTextArray(input: string): string[] {
  const trimmed = input.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) {
    return [];
  }

  const inner = trimmed.slice(1, -1);
  if (!inner) {
    return [];
  }

  return inner
    .split(',')
    .map((item) => item.replace(/^"|"$/g, '').trim())
    .filter((item) => item.length > 0);
}

function toStringArray(input: unknown): string[] {
  if (Array.isArray(input)) {
    return input
      .map((item) => String(item ?? '').trim())
      .filter((item) => item.length > 0);
  }

  if (typeof input === 'string') {
    const maybeArray = input.trim();
    if (maybeArray.startsWith('{') && maybeArray.endsWith('}')) {
      return parsePgTextArray(maybeArray);
    }

    try {
      const parsed = JSON.parse(maybeArray) as unknown;
      return toStringArray(parsed);
    } catch {
      return maybeArray.length > 0 ? [maybeArray] : [];
    }
  }

  return [];
}

function toJsonArray<T>(input: unknown): T[] {
  if (Array.isArray(input)) {
    return input as T[];
  }

  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input) as unknown;
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      return [];
    }
  }

  return [];
}

function pickDefaultVariant(variants: RawVariant[]): RawVariant | undefined {
  const pricedVariants = variants
    .filter((variant) => variant.price != null && String(variant.price).trim().length > 0)
    .sort((a, b) => Number(a.price ?? 0) - Number(b.price ?? 0));

  return pricedVariants[0] ?? variants[0];
}

function sanitizeOptions(rawOptions: RawOption[]): Array<{ name: string; values: string[] }> {
  return rawOptions
    .map((option) => ({
      name: String(option.name ?? '').trim(),
      values: toStringArray(option.values),
    }))
    .filter((option) => option.name.length > 0);
}

function sanitizeVariants(rawVariants: RawVariant[]): IndexedProductDetailDocument['variants'] {
  return rawVariants
    .map((variant) => {
      const variantId = Number(variant.variant_id ?? 0);
      if (!Number.isFinite(variantId) || variantId <= 0) {
        return null;
      }

      return {
        variant_id: variantId,
        title: variant.title ?? undefined,
        sku: variant.sku ?? undefined,
        option1_value: variant.option1_value ?? undefined,
        option2_value: variant.option2_value ?? undefined,
        option3_value: variant.option3_value ?? undefined,
        price: variant.price != null ? String(variant.price) : undefined,
        compare_at_price: variant.compare_at_price != null ? String(variant.compare_at_price) : undefined,
      };
    })
    .filter((variant): variant is NonNullable<typeof variant> => variant != null);
}

function parseConcurrency(input: string | undefined): number {
  const parsed = Number(input ?? '8');
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 8;
  }

  return Math.min(Math.floor(parsed), 32);
}

async function ensureIndex(client: ElasticsearchClient, index: string): Promise<void> {
  const exists = await client.indices.exists({ index });
  if (exists) {
    return;
  }

  await client.indices.create({
    index,
    mappings: {
      dynamic: true,
      properties: {
        handle_lower: { type: 'keyword' },
        product_id: { type: 'integer' },
        store_id: { type: 'integer' },
        country_codes: { type: 'keyword' },
        status: { type: 'keyword' },
        updated_at: { type: 'date' },
      },
    },
  });
}

async function main(): Promise<void> {
  const databaseUrl = (process.env.DATABASE_URL ?? '').trim();
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required');
  }

  const esNode = (process.env.ELASTICSEARCH_NODE ?? '').trim();
  if (!esNode) {
    throw new Error('ELASTICSEARCH_NODE is required');
  }

  const esUsername = (process.env.ELASTICSEARCH_USERNAME ?? '').trim();
  const esPassword = process.env.ELASTICSEARCH_PASSWORD ?? '';
  const esIndex = (process.env.ELASTICSEARCH_PRODUCT_DETAIL_INDEX ?? DEFAULT_INDEX).trim() || DEFAULT_INDEX;
  const concurrency = parseConcurrency(process.env.ES_BACKFILL_CONCURRENCY);

  const sql = neon(databaseUrl);
  const esClient = new ElasticsearchClient({
    node: esNode,
    ...(esUsername && esPassword
      ? {
          auth: {
            username: esUsername,
            password: esPassword,
          },
        }
      : {}),
  });

  await ensureIndex(esClient, esIndex);

  const rows = (await sql`
    WITH options AS (
      SELECT
        option.product_id,
        jsonb_agg(
          jsonb_build_object(
            'name', option.name,
            'values', COALESCE(
              (
                SELECT jsonb_agg(value.value ORDER BY value.position)
                FROM "OptionValue" value
                WHERE value.option_id = option.option_id
              ),
              '[]'::jsonb
            )
          )
          ORDER BY option.position
        ) AS options
      FROM "ProductOption" option
      GROUP BY option.product_id
    ),
    variants AS (
      SELECT
        variant.product_id,
        jsonb_agg(
          jsonb_build_object(
            'variant_id', variant.variant_id,
            'title', COALESCE(NULLIF(concat_ws(' / ', variant.option1_value, variant.option2_value, variant.option3_value), ''), 'Default'),
            'sku', variant.sku,
            'option1_value', variant.option1_value,
            'option2_value', variant.option2_value,
            'option3_value', variant.option3_value,
            'price', CASE WHEN variant.price IS NULL THEN NULL ELSE variant.price::text END,
            'compare_at_price', CASE WHEN variant.compare_at_price IS NULL THEN NULL ELSE variant.compare_at_price::text END
          )
          ORDER BY variant.is_default DESC, variant.variant_id ASC
        ) AS variants
      FROM "Variant" variant
      GROUP BY variant.product_id
    ),
    countries AS (
      SELECT
        availability.product_id,
        array_agg(DISTINCT availability.country_code ORDER BY availability.country_code) AS country_codes
      FROM "ProductCountryAvailability" availability
      WHERE availability.product_id IS NOT NULL
        AND availability.is_available = true
      GROUP BY availability.product_id
    )
    SELECT
      product.product_id,
      product.store_id,
      store.name AS store_name,
      product.title,
      product.brand,
      product.description,
      COALESCE(NULLIF(trim(product.handle), ''), product.product_id::text) AS handle,
      CASE
        WHEN jsonb_typeof(product.media_urls) = 'array' THEN ARRAY(SELECT jsonb_array_elements_text(product.media_urls))
        ELSE ARRAY[]::text[]
      END AS media_urls,
      product.primary_image_url,
      product.og_image,
      COALESCE(options.options, '[]'::jsonb) AS options,
      COALESCE(variants.variants, '[]'::jsonb) AS variants,
      COALESCE(countries.country_codes, ARRAY[]::varchar[]) AS country_codes
    FROM "Product" product
    INNER JOIN "Store" store ON store.store_id = product.store_id
    LEFT JOIN options ON options.product_id = product.product_id
    LEFT JOIN variants ON variants.product_id = product.product_id
    LEFT JOIN countries ON countries.product_id = product.product_id
    WHERE product.status = 'ACTIVE'
    ORDER BY product.product_id ASC;
  `) as ProductRow[];

  console.log('Active products fetched from Neon:', rows.length);

  if (rows.length === 0) {
    await esClient.indices.refresh({ index: esIndex });
    const emptyCount = await esClient.count({ index: esIndex });
    console.log('No active products to index. Current index count:', emptyCount.count);
    return;
  }

  const documents = rows.map((row) => {
    const mediaUrls = toStringArray(row.media_urls);
    const options = sanitizeOptions(toJsonArray<RawOption>(row.options));
    const rawVariants = toJsonArray<RawVariant>(row.variants);
    const variants = sanitizeVariants(rawVariants);
    const countryCodes = toStringArray(row.country_codes).map((code) => code.toUpperCase()).sort();

    const defaultVariant = pickDefaultVariant(rawVariants);

    const document: IndexedProductDetailDocument = {
      product_id: Number(row.product_id),
      store_id: Number(row.store_id),
      store_name: String(row.store_name ?? ''),
      title: String(row.title ?? ''),
      brand: row.brand ?? undefined,
      description: row.description ?? undefined,
      handle: String(row.handle ?? ''),
      image_url: mediaUrls[0] ?? row.primary_image_url ?? row.og_image ?? undefined,
      media_urls: mediaUrls,
      price: defaultVariant?.price != null ? String(defaultVariant.price) : undefined,
      compare_at_price: defaultVariant?.compare_at_price != null ? String(defaultVariant.compare_at_price) : undefined,
      options,
      variants,
      handle_lower: normalizeHandle(String(row.handle ?? '')),
      country_codes: countryCodes,
      status: 'ACTIVE',
      updated_at: new Date().toISOString(),
    };

    return document;
  });

  let successCount = 0;
  let failCount = 0;
  const batchSize = 200;
  const inFlight: Promise<void>[] = [];

  const indexBatch = async (slice: IndexedProductDetailDocument[]): Promise<void> => {
    const operations = slice.flatMap((document) => [
      {
        index: {
          _index: esIndex,
          _id: normalizeHandle(document.handle),
        },
      },
      document,
    ]);

    const response = await esClient.bulk({
      refresh: false,
      operations,
    });

    if (!response.errors) {
      successCount += slice.length;
      return;
    }

    for (const item of response.items) {
      const result = item.index;
      if (!result || result.error) {
        failCount += 1;
      } else {
        successCount += 1;
      }
    }
  };

  for (let index = 0; index < documents.length; index += batchSize) {
    const batch = documents.slice(index, index + batchSize);
    const job = indexBatch(batch);
    inFlight.push(job);

    if (inFlight.length >= concurrency) {
      await Promise.all(inFlight.splice(0, inFlight.length));
    }

    if ((index / batchSize + 1) % 5 === 0 || index + batchSize >= documents.length) {
      const done = Math.min(index + batchSize, documents.length);
      console.log('Prepared/queued docs: ' + done + '/' + documents.length);
    }
  }

  if (inFlight.length > 0) {
    await Promise.all(inFlight);
  }

  await esClient.indices.refresh({ index: esIndex });
  const count = await esClient.count({ index: esIndex });

  console.log('Index:', esIndex);
  console.log('Indexed success:', successCount);
  console.log('Indexed failed:', failCount);
  console.log('Current ES count:', count.count);

  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Neon -> Elasticsearch backfill failed:', error);
  process.exit(1);
});
