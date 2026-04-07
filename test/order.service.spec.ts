import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { OrderService } from '../src/modules/order/order.service';
import { InventoryService } from '../src/modules/inventory';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Cart, CartItem } from '../src/modules/cart/entities';
import { IdempotencyKey, Order, OrderItem } from '../src/modules/order/entities';

const mockDataSource = {
  transaction: jest.fn(),
};

const mockInventoryService = {
  consumeReservationsForCart: jest.fn(),
};

const mockOrderRepo = {
  findOne: jest.fn(),
};

const mockOrderItemRepo = {};

const mockIdempotencyRepo = {
  findOne: jest.fn(),
};

const mockCartRepo = {};

const mockCartItemRepo = {};

describe('OrderService', () => {
  let service: OrderService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OrderService,
        { provide: DataSource, useValue: mockDataSource },
        { provide: InventoryService, useValue: mockInventoryService },
        { provide: getRepositoryToken(Order), useValue: mockOrderRepo },
        { provide: getRepositoryToken(OrderItem), useValue: mockOrderItemRepo },
        { provide: getRepositoryToken(IdempotencyKey), useValue: mockIdempotencyRepo },
        { provide: getRepositoryToken(Cart), useValue: mockCartRepo },
        { provide: getRepositoryToken(CartItem), useValue: mockCartItemRepo },
      ],
    }).compile();

    service = module.get<OrderService>(OrderService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns stored order when idempotency key already exists', async () => {
    const storedOrder = { order_id: 101, total: 50, items: [] } as unknown as Order;
    mockIdempotencyRepo.findOne.mockResolvedValue({ order: storedOrder });

    const result = await service.createOrder({
      cart_id: 10,
      idempotency_key: 'idem-001',
    });

    expect(result).toBe(storedOrder);
    expect(mockDataSource.transaction).not.toHaveBeenCalled();
  });

  it('falls back to transactional create when idempotency key is new', async () => {
    const createdOrder = { order_id: 202, total: 90, items: [] } as unknown as Order;
    mockIdempotencyRepo.findOne.mockResolvedValue(null);
    mockDataSource.transaction.mockResolvedValue(createdOrder);

    const result = await service.createOrder({
      cart_id: 11,
      idempotency_key: 'idem-002',
    });

    expect(mockDataSource.transaction).toHaveBeenCalled();
    expect(result).toBe(createdOrder);
  });
});
