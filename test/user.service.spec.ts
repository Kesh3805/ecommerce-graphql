/**
 * GK POC GraphQL Service
 * (c) 2025
 */

import { Test, TestingModule } from '@nestjs/testing';
import { UserService } from '../src/modules/user/user.service';
import { UserRepository } from '../src/modules/user/repository/user.repository';
import { CustomLoggerService } from '../src/common/logger/logger.service';
import { NotFoundException } from '@nestjs/common';
import { USER_ERRORS } from '../src/common/constants/constant';

const mockUserRepository = {
  findById: jest.fn(),
  findAll: jest.fn(),
  create: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  findByEmail: jest.fn(),
};

const mockLogger = {
  setContext: jest.fn(),
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
};

describe('UserService', () => {
  let service: UserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: UserRepository, useValue: mockUserRepository },
        { provide: CustomLoggerService, useValue: mockLogger },
      ],
    }).compile();

    service = module.get<UserService>(UserService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('findOne', () => {
    it('should return a user when found', async () => {
      const mockUser = { id: 1, email: 'test@example.com', name: 'Test User' };
      mockUserRepository.findById.mockResolvedValue(mockUser);

      const result = await service.findOne(1);

      expect(result).toEqual(mockUser);
      expect(mockUserRepository.findById).toHaveBeenCalledWith(1);
    });

    it('should throw NotFoundException when user not found', async () => {
      mockUserRepository.findById.mockResolvedValue(null);

      await expect(service.findOne(9999)).rejects.toThrow(NotFoundException);
      await expect(service.findOne(9999)).rejects.toThrow(USER_ERRORS.NOT_FOUND);
    });
  });

  describe('remove', () => {
    it('should return true when user is deleted successfully', async () => {
      mockUserRepository.delete.mockResolvedValue(undefined);

      const result = await service.remove(1);

      expect(result).toBe(true);
      expect(mockUserRepository.delete).toHaveBeenCalledWith(1);
    });
  });
});
