import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class DatabasePerformanceService implements OnModuleInit {
  private readonly logger = new Logger(DatabasePerformanceService.name);

  constructor(private readonly dataSource: DataSource) {}

  async onModuleInit(): Promise<void> {
    if (this.dataSource.options.type !== 'postgres') {
      return;
    }

    const statements = [
      'CREATE EXTENSION IF NOT EXISTS pg_trgm',
      'CREATE INDEX IF NOT EXISTS "IDX_Store_owner_user_id" ON "Store" ("owner_user_id")',
      'CREATE INDEX IF NOT EXISTS "IDX_Product_created_at_desc" ON "Product" ("created_at" DESC, "product_id" DESC)',
      'CREATE INDEX IF NOT EXISTS "IDX_Product_store_created_at_desc" ON "Product" ("store_id", "created_at" DESC, "product_id" DESC)',
      'CREATE INDEX IF NOT EXISTS "IDX_Product_store_status_created_at_desc" ON "Product" ("store_id", "status", "created_at" DESC, "product_id" DESC)',
      'CREATE INDEX IF NOT EXISTS "IDX_ProductCategory_product_id" ON "ProductCategory" ("product_id")',
      'CREATE INDEX IF NOT EXISTS "IDX_ProductOption_product_id" ON "ProductOption" ("product_id")',
      'CREATE INDEX IF NOT EXISTS "IDX_OptionValue_option_id" ON "OptionValue" ("option_id")',
      'CREATE INDEX IF NOT EXISTS "IDX_Metafield_owner_type_owner_id" ON "Metafield" ("owner_type", "owner_id")',
      'CREATE INDEX IF NOT EXISTS "IDX_Metafield_owner_type_owner_id_key" ON "Metafield" ("owner_type", "owner_id", "key")',
      'CREATE INDEX IF NOT EXISTS "IDX_ProductCountryAvailability_product_available" ON "ProductCountryAvailability" ("product_id", "is_available", "country_code")',
      'CREATE INDEX IF NOT EXISTS "IDX_ProductCountryAvailability_store_available" ON "ProductCountryAvailability" ("store_id", "is_available", "country_code")',
      'CREATE INDEX IF NOT EXISTS "IDX_ProductCountryAvailability_store_product_available" ON "ProductCountryAvailability" ("store_id", "product_id", "is_available")',
      'CREATE INDEX IF NOT EXISTS "IDX_Variant_product_id_runtime" ON "Variant" ("product_id")',
      'CREATE INDEX IF NOT EXISTS "IDX_InventoryLocation_store_id" ON "InventoryLocation" ("store_id")',
      'CREATE INDEX IF NOT EXISTS "IDX_InventoryLevel_inventory_item_id" ON "InventoryLevel" ("inventory_item_id")',
      'CREATE INDEX IF NOT EXISTS "IDX_InventoryReservation_inventory_item_id" ON "InventoryReservation" ("inventory_item_id")',
      'CREATE INDEX IF NOT EXISTS "IDX_Product_title_trgm" ON "Product" USING GIN ("title" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "IDX_Product_brand_trgm" ON "Product" USING GIN ("brand" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "IDX_Product_description_trgm" ON "Product" USING GIN ("description" gin_trgm_ops)',
      'CREATE INDEX IF NOT EXISTS "IDX_Product_handle_trgm" ON "Product" USING GIN ("handle" gin_trgm_ops)',
    ];

    for (const statement of statements) {
      try {
        await this.dataSource.query(statement);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Failed statement: ${statement}. Reason: ${message}`);
      }
    }

    this.logger.log('Database performance indexes ensured.');
  }
}
