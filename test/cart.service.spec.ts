import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';
import { CartService } from '../src/modules/cart/cart.service';
import { InventoryService } from '../src/modules/inventory';
import { Cart, CartItem } from '../src/modules/cart/entities';
import { Variant } from '../src/modules/variant/entities';

const mockDataSource = {
  transaction: jest.fn((cb) =>
    cb({
      save: jest.fn(),
      create: (_entity: unknown, payload: unknown) => payload,
    }),
  ),
};

const mockInventoryService = {
  createReservation: jest.fn(),
  releaseReservationsByCartItem: jest.fn(),
};

const mockCartRepo = {
  save: jest.fn(),
  create: jest.fn((v) => v),
  findOne: jest.fn(),
};

const mockCartItemRepo = {
  findOne: jest.fn(),
  save: jest.fn(),
  delete: jest.fn(),
};

const mockVariantRepo = {
  findOne: jest.fn(),
};

describe('CartService', () => {
  let service: CartService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CartService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: getRepositoryToken(Cart), useValue: mockCartRepo },
        { provide: getRepositoryToken(CartItem), useValue: mockCartItemRepo },
        { provide: getRepositoryToken(Variant), useValue: mockVariantRepo },
      ],
    }).compile();

    service = module.get<CartService>(CartService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('creates reservation when adding item to cart', async () => {
    mockCartRepo.findOne.mockResolvedValue({ cart_id: 1, status: 'ACTIVE', items: [] });
    mockVariantRepo.findOne.mockResolvedValue({
      variant_id: 5,
      inventory_item_id: 9,
      price: 12,
      sku: 'SKU-1',
      option1_value: 'Red',
      option2_value: 'M',
    });
    mockCartItemRepo.findOne.mockResolvedValue(null);

    await service.addToCart({ cart_id: 1, variant_id: 5, quantity: 2 });

    expect(mockInventoryService.createReservation).toHaveBeenCalled();
  });
});
