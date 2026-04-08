import 'dotenv/config';

import { NestFactory } from '@nestjs/core';

import { AppModule } from '../src/app.module';
import { ProductStatus } from '../src/common/enums/ecommerce.enums';
import { ProductService } from '../src/modules/catalog/product.service';

function parseConcurrency(raw: string | undefined): number {
  const parsed = Number(raw ?? '8');
  if (!Number.isFinite(parsed) || parsed < 1) {
    return 8;
  }

  return Math.min(Math.floor(parsed), 32);
}

async function main(): Promise<void> {
  const startedAt = Date.now();
  const app = await NestFactory.createApplicationContext(AppModule.forRoot(), {
    logger: ['error', 'warn'],
  });

  try {
    const productService = app.get(ProductService, { strict: false }) as any;

    await productService.ensureProductDetailIndex();

    const pageSize = 200;
    let page = 1;
    const allHandles: string[] = [];

    while (true) {
      const response = await productService.findAll(
        { status: ProductStatus.ACTIVE },
        { page, limit: pageSize },
      );

      for (const product of response.items ?? []) {
        const handle = (product?.handle ?? '').trim();
        if (handle) {
          allHandles.push(handle);
        }
      }

      if (!response.hasNextPage) {
        break;
      }

      page += 1;
    }

    const handles = [...new Set(allHandles)];

    console.log('Active product handles discovered:', handles.length);

    if (handles.length === 0) {
      console.log('No active handles found. Index existence check completed.');
      return;
    }

    const concurrency = parseConcurrency(process.env.ES_BACKFILL_CONCURRENCY);
    let cursor = 0;
    let successCount = 0;
    let failCount = 0;

    const worker = async (): Promise<void> => {
      while (true) {
        const current = cursor;
        cursor += 1;

        if (current >= handles.length) {
          return;
        }

        const handle = handles[current];

        try {
          await productService.syncPublicProductToSearchIndex(handle);
          successCount += 1;
        } catch (error) {
          failCount += 1;
          console.error('Failed to sync handle ' + handle + ':', error);
        }

        const done = successCount + failCount;
        if (done % 25 === 0 || done === handles.length) {
          console.log('Progress: ' + done + '/' + handles.length + ' synced');
        }
      }
    };

    await Promise.all(Array.from({ length: Math.min(concurrency, handles.length) }, () => worker()));

    const durationMs = Date.now() - startedAt;
    console.log('Backfill complete');
    console.log('Success:', successCount);
    console.log('Failed:', failCount);
    console.log('Duration (ms):', durationMs);

    if (failCount > 0) {
      process.exitCode = 1;
    }
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('Fatal backfill failure:', error);
  process.exit(1);
});