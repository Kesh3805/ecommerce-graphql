import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AdjustmentReason } from '../../common/enums/ecommerce.enums';
import { Store } from '../catalog/entities';
import { Variant } from '../variant/entities';
import { AdjustInventoryInput, CreateLocationInput, ReserveInventoryInput, SetInventoryLevelInput, TransferInventoryInput, UpdateLocationInput } from './dto';
import { AdjustInventoryResponse, TransferInventoryResponse } from './dto/inventory.response';
import { InventoryAdjustment, InventoryItemEntity, InventoryLevelEntity, InventoryReservation, Location } from './entities';

interface CreateReservationInput {
  inventory_item_id: number;
  cart_id: number;
  quantity: number;
  expires_at: Date;
}

@Injectable()
export class InventoryService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Store) private readonly storeRepo: Repository<Store>,
    @InjectRepository(Location) private readonly locationRepo: Repository<Location>,
    @InjectRepository(InventoryItemEntity) private readonly inventoryItemRepo: Repository<InventoryItemEntity>,
    @InjectRepository(InventoryLevelEntity) private readonly levelRepo: Repository<InventoryLevelEntity>,
    @InjectRepository(InventoryAdjustment) private readonly adjustmentRepo: Repository<InventoryAdjustment>,
    @InjectRepository(InventoryReservation) private readonly reservationRepo: Repository<InventoryReservation>,
    @InjectRepository(Variant) private readonly variantRepo: Repository<Variant>,
  ) {}

  // Allowed table/column combinations for sequence sync to prevent SQL injection
  private static readonly ALLOWED_TABLE_COLUMNS: ReadonlyMap<string, readonly string[]> = new Map([
    ['InventoryAdjustment', ['adjustment_id']],
    ['InventoryReservation', ['reservation_id']],
    ['InventoryLevel', ['inventory_level_id']],
    ['InventoryItem', ['inventory_item_id']],
    ['Location', ['location_id']],
  ]);

  private async syncTableIdSequence(manager: EntityManager, table: string, column: string): Promise<void> {
    // Validate table and column against whitelist to prevent SQL injection
    const allowedColumns = InventoryService.ALLOWED_TABLE_COLUMNS.get(table);
    if (!allowedColumns || !allowedColumns.includes(column)) {
      throw new Error(`Invalid table/column combination: ${table}/${column}`);
    }

    const maxRes = await manager.query(`SELECT COALESCE(MAX("${column}"), 0)::int AS max_id FROM public."${table}"`);
    const nextValue = Number(maxRes[0]?.max_id ?? 0) + 1;

    const serialRes = await manager.query(`SELECT pg_get_serial_sequence('public."${table}"', '${column}') AS seq`);
    const serialSeq = serialRes[0]?.seq as string | null;

    const defaultRes = await manager.query(
      `
        SELECT column_default
        FROM information_schema.columns
        WHERE table_schema='public' AND table_name=$1 AND column_name=$2
      `,
      [table, column],
    );

    const defaultText = (defaultRes[0]?.column_default ?? '') as string;
    const defaultMatch = defaultText.match(/nextval\('(.+?)'::regclass\)/i);
    const defaultSeqRaw = defaultMatch?.[1] ?? null;

    const candidateSeqs = new Set<string>();
    if (serialSeq) {
      candidateSeqs.add(serialSeq);
    }

    if (defaultSeqRaw) {
      candidateSeqs.add(defaultSeqRaw);
      candidateSeqs.add(defaultSeqRaw.replace(/"/g, ''));

      if (!defaultSeqRaw.includes('.')) {
        candidateSeqs.add(`public.${defaultSeqRaw}`);
        const withoutQuotes = defaultSeqRaw.replace(/"/g, '');
        candidateSeqs.add(`public.${withoutQuotes}`);
      }
    }

    for (const seqName of candidateSeqs) {
      const existsRes = await manager.query('SELECT to_regclass($1) AS reg', [seqName]);
      if (!existsRes[0]?.reg) {
        continue;
      }

      await manager.query('SELECT setval($1, $2, false)', [seqName, nextValue]);
    }
  }

  async createReservation(input: CreateReservationInput): Promise<InventoryReservation> {
    const { inventory_item_id, cart_id, quantity, expires_at } = input;

    return this.dataSource.transaction(async (manager) => {
      const level = await manager
        .createQueryBuilder(InventoryLevelEntity, 'level')
        .setLock('pessimistic_write')
        .where('level.inventory_item_id = :inventoryItemId', { inventoryItemId: inventory_item_id })
        .orderBy('level.available_quantity', 'DESC')
        .getOne();

      if (!level) {
        throw new NotFoundException(`Inventory level not found for item ${inventory_item_id}`);
      }

      if (level.available_quantity < quantity) {
        throw new BadRequestException(`Insufficient inventory. Available: ${level.available_quantity}, Requested: ${quantity}`);
      }

      level.available_quantity -= quantity;
      level.reserved_quantity += quantity;
      await manager.save(InventoryLevelEntity, level);

      await this.syncTableIdSequence(manager, 'InventoryAdjustment', 'adjustment_id');
      await manager.save(
        InventoryAdjustment,
        manager.create(InventoryAdjustment, {
          inventory_level_id: level.inventory_level_id,
          quantity: -quantity,
          reason: AdjustmentReason.RESERVED,
          notes: `Reserved for cart ${cart_id}`,
        }),
      );

      await this.syncTableIdSequence(manager, 'InventoryReservation', 'reservation_id');

      return manager.save(
        InventoryReservation,
        manager.create(InventoryReservation, {
          inventory_item_id,
          cart_id,
          quantity,
          expires_at,
        }),
      );
    });
  }

  /**
   * Create reservation with an existing transaction manager (for atomic operations)
   */
  async createReservationWithManager(manager: EntityManager, input: CreateReservationInput): Promise<InventoryReservation> {
    const { inventory_item_id, cart_id, quantity, expires_at } = input;

    const level = await manager
      .createQueryBuilder(InventoryLevelEntity, 'level')
      .setLock('pessimistic_write')
      .where('level.inventory_item_id = :inventoryItemId', { inventoryItemId: inventory_item_id })
      .orderBy('level.available_quantity', 'DESC')
      .getOne();

    if (!level) {
      throw new NotFoundException(`Inventory level not found for item ${inventory_item_id}`);
    }

    if (level.available_quantity < quantity) {
      throw new BadRequestException(`Insufficient inventory. Available: ${level.available_quantity}, Requested: ${quantity}`);
    }

    level.available_quantity -= quantity;
    level.reserved_quantity += quantity;
    await manager.save(InventoryLevelEntity, level);

    await this.syncTableIdSequence(manager, 'InventoryAdjustment', 'adjustment_id');
    await manager.save(
      InventoryAdjustment,
      manager.create(InventoryAdjustment, {
        inventory_level_id: level.inventory_level_id,
        quantity: -quantity,
        reason: AdjustmentReason.RESERVED,
        notes: `Reserved for cart ${cart_id}`,
      }),
    );

    await this.syncTableIdSequence(manager, 'InventoryReservation', 'reservation_id');

    return manager.save(
      InventoryReservation,
      manager.create(InventoryReservation, {
        inventory_item_id,
        cart_id,
        quantity,
        expires_at,
      }),
    );
  }

  async releaseReservationsByCartItem(cart_id: number, variant_id: number, quantity: number): Promise<void> {
    const variant = await this.variantRepo.findOne({ where: { variant_id } });
    if (!variant?.inventory_item_id) {
      return;
    }

    await this.dataSource.transaction(async (manager) => {
      const reservations = await manager.find(InventoryReservation, {
        where: { cart_id, inventory_item_id: variant.inventory_item_id },
        order: { created_at: 'ASC' },
      });

      let toRelease = quantity;
      for (const reservation of reservations) {
        if (toRelease <= 0) {
          break;
        }

        const releaseQty = Math.min(toRelease, reservation.quantity);
        reservation.quantity -= releaseQty;
        toRelease -= releaseQty;

        if (reservation.quantity === 0) {
          await manager.delete(InventoryReservation, { reservation_id: reservation.reservation_id });
        } else {
          await manager.save(InventoryReservation, reservation);
        }

        const level = await manager
          .createQueryBuilder(InventoryLevelEntity, 'level')
          .setLock('pessimistic_write')
          .where('level.inventory_item_id = :inventoryItemId', { inventoryItemId: variant.inventory_item_id })
          .orderBy('level.reserved_quantity', 'DESC')
          .getOne();

        if (level) {
          level.available_quantity += releaseQty;
          level.reserved_quantity = Math.max(0, level.reserved_quantity - releaseQty);
          await manager.save(InventoryLevelEntity, level);

          await this.syncTableIdSequence(manager, 'InventoryAdjustment', 'adjustment_id');
          await manager.save(
            InventoryAdjustment,
            manager.create(InventoryAdjustment, {
              inventory_level_id: level.inventory_level_id,
              quantity: releaseQty,
              reason: AdjustmentReason.UNRESERVED,
              notes: `Released from cart ${cart_id}`,
            }),
          );
        }
      }
    });
  }

  /**
   * Release reservations with an existing transaction manager (for atomic operations)
   */
  async releaseReservationsByCartItemWithManager(manager: EntityManager, cart_id: number, variant_id: number, quantity: number): Promise<void> {
    const variant = await manager.findOne(Variant, { where: { variant_id } });
    if (!variant?.inventory_item_id) {
      return;
    }

    const reservations = await manager.find(InventoryReservation, {
      where: { cart_id, inventory_item_id: variant.inventory_item_id },
      order: { created_at: 'ASC' },
    });

    let toRelease = quantity;
    for (const reservation of reservations) {
      if (toRelease <= 0) {
        break;
      }

      const releaseQty = Math.min(toRelease, reservation.quantity);
      reservation.quantity -= releaseQty;
      toRelease -= releaseQty;

      if (reservation.quantity === 0) {
        await manager.delete(InventoryReservation, { reservation_id: reservation.reservation_id });
      } else {
        await manager.save(InventoryReservation, reservation);
      }

      const level = await manager
        .createQueryBuilder(InventoryLevelEntity, 'level')
        .setLock('pessimistic_write')
        .where('level.inventory_item_id = :inventoryItemId', { inventoryItemId: variant.inventory_item_id })
        .orderBy('level.reserved_quantity', 'DESC')
        .getOne();

      if (level) {
        level.available_quantity += releaseQty;
        level.reserved_quantity = Math.max(0, level.reserved_quantity - releaseQty);
        await manager.save(InventoryLevelEntity, level);

        await this.syncTableIdSequence(manager, 'InventoryAdjustment', 'adjustment_id');
        await manager.save(
          InventoryAdjustment,
          manager.create(InventoryAdjustment, {
            inventory_level_id: level.inventory_level_id,
            quantity: releaseQty,
            reason: AdjustmentReason.UNRESERVED,
            notes: `Released from cart ${cart_id}`,
          }),
        );
      }
    }
  }

  async consumeReservationsForCart(cart_id: number): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      const reservations = await manager.find(InventoryReservation, {
        where: { cart_id },
      });

      for (const reservation of reservations) {
        const level = await manager
          .createQueryBuilder(InventoryLevelEntity, 'level')
          .setLock('pessimistic_write')
          .where('level.inventory_item_id = :inventoryItemId', { inventoryItemId: reservation.inventory_item_id })
          .orderBy('level.reserved_quantity', 'DESC')
          .getOne();

        if (level) {
          level.reserved_quantity = Math.max(0, level.reserved_quantity - reservation.quantity);
          await manager.save(InventoryLevelEntity, level);

          await this.syncTableIdSequence(manager, 'InventoryAdjustment', 'adjustment_id');
          await manager.save(
            InventoryAdjustment,
            manager.create(InventoryAdjustment, {
              inventory_level_id: level.inventory_level_id,
              quantity: -reservation.quantity,
              reason: AdjustmentReason.SOLD,
              notes: `Reservation consumed for cart ${cart_id}`,
            }),
          );
        }

        await manager.delete(InventoryReservation, { reservation_id: reservation.reservation_id });
      }
    });
  }

  async findLocationsByStore(storeId: number): Promise<Location[]> {
    return this.locationRepo.find({
      where: { store_id: storeId },
      order: { name: 'ASC' },
    });
  }

  async findLocation(locationId: number): Promise<Location> {
    const location = await this.locationRepo.findOne({ where: { location_id: locationId } });
    if (!location) {
      throw new NotFoundException(`Location with ID ${locationId} not found`);
    }

    return location;
  }

  async createLocation(input: CreateLocationInput): Promise<Location> {
    const store = await this.storeRepo.findOne({ where: { store_id: input.store_id } });
    if (!store) {
      throw new NotFoundException(`Store with ID ${input.store_id} not found`);
    }

    return this.dataSource.transaction(async (manager) => {
      await this.syncTableIdSequence(manager, 'InventoryLocation', 'location_id');

      const location = await manager.save(Location, manager.create(Location, input));

      return location;
    });
  }

  async updateLocation(input: UpdateLocationInput): Promise<Location> {
    const { location_id, ...updateData } = input;
    await this.findLocation(location_id);

    await this.locationRepo.update({ location_id }, updateData);
    return this.findLocation(location_id);
  }

  async deleteLocation(locationId: number): Promise<boolean> {
    await this.findLocation(locationId);

    const levelsCount = await this.levelRepo.count({ where: { location_id: locationId } });
    if (levelsCount > 0) {
      throw new BadRequestException('Cannot delete location with existing inventory. Transfer or delete inventory first.');
    }

    await this.locationRepo.delete({ location_id: locationId });
    return true;
  }

  async findInventoryItem(inventoryItemId: number): Promise<InventoryItemEntity> {
    const item = await this.inventoryItemRepo.findOne({
      where: { inventory_item_id: inventoryItemId },
      relations: { levels: { location: true } },
    });

    if (!item) {
      throw new NotFoundException(`Inventory item with ID ${inventoryItemId} not found`);
    }

    return this.mapInventoryItem(item);
  }

  async findInventoryLevelsByVariant(variantId: number): Promise<InventoryLevelEntity[]> {
    const variant = await this.variantRepo.findOne({
      where: { variant_id: variantId },
      relations: { inventory_item: { levels: { location: true } } },
    });

    if (!variant) {
      throw new NotFoundException(`Variant with ID ${variantId} not found`);
    }

    return variant.inventory_item?.levels ?? [];
  }

  async adjustInventory(input: AdjustInventoryInput): Promise<AdjustInventoryResponse> {
    const { inventory_item_id, location_id, quantity, reason, notes } = input;

    await this.findInventoryItem(inventory_item_id);
    await this.findLocation(location_id);

    return this.dataSource.transaction(async (manager) => {
      let level = await manager
        .createQueryBuilder(InventoryLevelEntity, 'level')
        .setLock('pessimistic_write')
        .where('level.inventory_item_id = :inventoryItemId', { inventoryItemId: inventory_item_id })
        .andWhere('level.location_id = :locationId', { locationId: location_id })
        .getOne();

      if (!level) {
        await this.syncTableIdSequence(manager, 'InventoryLevel', 'inventory_level_id');
        level = await manager.save(
          InventoryLevelEntity,
          manager.create(InventoryLevelEntity, {
            inventory_item_id,
            location_id,
            available_quantity: 0,
            reserved_quantity: 0,
          }),
        );
      }

      const newQuantity = level.available_quantity + quantity;
      if (newQuantity < 0) {
        throw new BadRequestException(`Cannot adjust inventory below 0. Current: ${level.available_quantity}, Adjustment: ${quantity}`);
      }

      level.available_quantity = newQuantity;
      const updatedLevel = await manager.save(InventoryLevelEntity, level);

      await this.syncTableIdSequence(manager, 'InventoryAdjustment', 'adjustment_id');
      const adjustment = await manager.save(
        InventoryAdjustment,
        manager.create(InventoryAdjustment, {
          inventory_level_id: level.inventory_level_id,
          quantity,
          reason,
          notes,
        }),
      );

      const hydratedLevel = await manager.findOneOrFail(InventoryLevelEntity, {
        where: { inventory_level_id: updatedLevel.inventory_level_id },
        relations: { location: true },
      });

      return {
        level: hydratedLevel,
        adjustment,
      };
    });
  }

  async setInventoryLevel(input: SetInventoryLevelInput): Promise<AdjustInventoryResponse> {
    const { inventory_item_id, location_id, available_quantity, notes } = input;

    await this.findInventoryItem(inventory_item_id);
    await this.findLocation(location_id);

    return this.dataSource.transaction(async (manager) => {
      let level = await manager
        .createQueryBuilder(InventoryLevelEntity, 'level')
        .setLock('pessimistic_write')
        .where('level.inventory_item_id = :inventoryItemId', { inventoryItemId: inventory_item_id })
        .andWhere('level.location_id = :locationId', { locationId: location_id })
        .getOne();

      const previousQuantity = level?.available_quantity ?? 0;
      const adjustmentQuantity = available_quantity - previousQuantity;

      if (!level) {
        await this.syncTableIdSequence(manager, 'InventoryLevel', 'inventory_level_id');
        level = manager.create(InventoryLevelEntity, {
          inventory_item_id,
          location_id,
          available_quantity,
          reserved_quantity: 0,
        });
      } else {
        level.available_quantity = available_quantity;
      }

      const savedLevel = await manager.save(InventoryLevelEntity, level);

      await this.syncTableIdSequence(manager, 'InventoryAdjustment', 'adjustment_id');
      const adjustment = await manager.save(
        InventoryAdjustment,
        manager.create(InventoryAdjustment, {
          inventory_level_id: savedLevel.inventory_level_id,
          quantity: adjustmentQuantity,
          reason: AdjustmentReason.CORRECTION,
          notes: notes ?? `Set inventory to ${available_quantity}`,
        }),
      );

      const hydratedLevel = await manager.findOneOrFail(InventoryLevelEntity, {
        where: { inventory_level_id: savedLevel.inventory_level_id },
        relations: { location: true },
      });

      return {
        level: hydratedLevel,
        adjustment,
      };
    });
  }

  async reserveInventory(input: ReserveInventoryInput): Promise<InventoryLevelEntity> {
    const { inventory_item_id, location_id, quantity } = input;

    return this.dataSource.transaction(async (manager) => {
      const level = await manager
        .createQueryBuilder(InventoryLevelEntity, 'level')
        .setLock('pessimistic_write')
        .where('level.inventory_item_id = :inventoryItemId', { inventoryItemId: inventory_item_id })
        .andWhere('level.location_id = :locationId', { locationId: location_id })
        .getOne();

      if (!level) {
        throw new NotFoundException('Inventory level not found for this item and location');
      }

      if (level.available_quantity < quantity) {
        throw new BadRequestException(`Insufficient inventory. Available: ${level.available_quantity}, Requested: ${quantity}`);
      }

      level.available_quantity -= quantity;
      level.reserved_quantity += quantity;
      const saved = await manager.save(InventoryLevelEntity, level);

      await this.syncTableIdSequence(manager, 'InventoryAdjustment', 'adjustment_id');
      await manager.save(
        InventoryAdjustment,
        manager.create(InventoryAdjustment, {
          inventory_level_id: level.inventory_level_id,
          quantity: -quantity,
          reason: AdjustmentReason.RESERVED,
          notes: `Reserved ${quantity} units`,
        }),
      );

      return manager.findOneOrFail(InventoryLevelEntity, {
        where: { inventory_level_id: saved.inventory_level_id },
        relations: { location: true },
      });
    });
  }

  async unreserveInventory(input: ReserveInventoryInput): Promise<InventoryLevelEntity> {
    const { inventory_item_id, location_id, quantity } = input;

    return this.dataSource.transaction(async (manager) => {
      const level = await manager
        .createQueryBuilder(InventoryLevelEntity, 'level')
        .setLock('pessimistic_write')
        .where('level.inventory_item_id = :inventoryItemId', { inventoryItemId: inventory_item_id })
        .andWhere('level.location_id = :locationId', { locationId: location_id })
        .getOne();

      if (!level) {
        throw new NotFoundException('Inventory level not found for this item and location');
      }

      if (level.reserved_quantity < quantity) {
        throw new BadRequestException(`Cannot unreserve more than reserved. Reserved: ${level.reserved_quantity}, Requested: ${quantity}`);
      }

      level.available_quantity += quantity;
      level.reserved_quantity -= quantity;
      const saved = await manager.save(InventoryLevelEntity, level);

      await this.syncTableIdSequence(manager, 'InventoryAdjustment', 'adjustment_id');
      await manager.save(
        InventoryAdjustment,
        manager.create(InventoryAdjustment, {
          inventory_level_id: level.inventory_level_id,
          quantity,
          reason: AdjustmentReason.UNRESERVED,
          notes: `Unreserved ${quantity} units`,
        }),
      );

      return manager.findOneOrFail(InventoryLevelEntity, {
        where: { inventory_level_id: saved.inventory_level_id },
        relations: { location: true },
      });
    });
  }

  async transferInventory(input: TransferInventoryInput): Promise<TransferInventoryResponse> {
    const { inventory_item_id, from_location_id, to_location_id, quantity, notes } = input;

    if (from_location_id === to_location_id) {
      throw new BadRequestException('Cannot transfer to the same location');
    }

    await this.findInventoryItem(inventory_item_id);
    await this.findLocation(from_location_id);
    await this.findLocation(to_location_id);

    return this.dataSource.transaction(async (manager) => {
      const fromLevel = await manager
        .createQueryBuilder(InventoryLevelEntity, 'level')
        .setLock('pessimistic_write')
        .where('level.inventory_item_id = :inventoryItemId', { inventoryItemId: inventory_item_id })
        .andWhere('level.location_id = :locationId', { locationId: from_location_id })
        .getOne();

      if (!fromLevel) {
        throw new NotFoundException('Source inventory level not found');
      }

      if (fromLevel.available_quantity < quantity) {
        throw new BadRequestException(`Insufficient inventory at source. Available: ${fromLevel.available_quantity}, Requested: ${quantity}`);
      }

      let toLevel = await manager
        .createQueryBuilder(InventoryLevelEntity, 'level')
        .setLock('pessimistic_write')
        .where('level.inventory_item_id = :inventoryItemId', { inventoryItemId: inventory_item_id })
        .andWhere('level.location_id = :locationId', { locationId: to_location_id })
        .getOne();

      if (!toLevel) {
        await this.syncTableIdSequence(manager, 'InventoryLevel', 'inventory_level_id');
        toLevel = await manager.save(
          InventoryLevelEntity,
          manager.create(InventoryLevelEntity, {
            inventory_item_id,
            location_id: to_location_id,
            available_quantity: 0,
            reserved_quantity: 0,
          }),
        );
      }

      fromLevel.available_quantity -= quantity;
      toLevel.available_quantity += quantity;

      const updatedFromLevel = await manager.save(InventoryLevelEntity, fromLevel);
      const updatedToLevel = await manager.save(InventoryLevelEntity, toLevel);

      const transferNote = notes ?? `Transfer of ${quantity} units`;
      await this.syncTableIdSequence(manager, 'InventoryAdjustment', 'adjustment_id');
      await manager.save(InventoryAdjustment, [
        manager.create(InventoryAdjustment, {
          inventory_level_id: fromLevel.inventory_level_id,
          quantity: -quantity,
          reason: AdjustmentReason.TRANSFER,
          notes: `${transferNote} (outbound)`,
        }),
        manager.create(InventoryAdjustment, {
          inventory_level_id: toLevel.inventory_level_id,
          quantity,
          reason: AdjustmentReason.TRANSFER,
          notes: `${transferNote} (inbound)`,
        }),
      ]);

      const hydratedFrom = await manager.findOneOrFail(InventoryLevelEntity, {
        where: { inventory_level_id: updatedFromLevel.inventory_level_id },
        relations: { location: true },
      });
      const hydratedTo = await manager.findOneOrFail(InventoryLevelEntity, {
        where: { inventory_level_id: updatedToLevel.inventory_level_id },
        relations: { location: true },
      });

      return {
        from_level: hydratedFrom,
        to_level: hydratedTo,
        quantity_transferred: quantity,
      };
    });
  }

  async getAdjustmentHistory(inventoryLevelId: number): Promise<InventoryAdjustment[]> {
    const level = await this.levelRepo.findOne({ where: { inventory_level_id: inventoryLevelId } });
    if (!level) {
      throw new NotFoundException(`Inventory level with ID ${inventoryLevelId} not found`);
    }

    return this.adjustmentRepo.find({
      where: { inventory_level_id: inventoryLevelId },
      order: { created_at: 'DESC' },
      take: 100,
    });
  }

  private mapInventoryItem(item: InventoryItemEntity): InventoryItemEntity {
    const totalAvailable = (item.levels ?? []).reduce((sum, level) => sum + level.available_quantity, 0);
    const totalReserved = (item.levels ?? []).reduce((sum, level) => sum + level.reserved_quantity, 0);

    return {
      ...item,
      total_available: totalAvailable,
      total_reserved: totalReserved,
    };
  }
}
