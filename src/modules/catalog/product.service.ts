import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, ILike, In, Repository } from 'typeorm';
import { ProductStatus } from '../../common/enums/ecommerce.enums';
import { CreateProductInput, UpdateProductInput, ProductFilterInput, PaginationInput, AddProductOptionInput } from './dto';
import { PaginatedProductsResponse } from './dto/product.response';
import { Category, OptionValue, Product, ProductCategory, ProductOption, ProductSEO, Store } from './entities';

const DEFAULT_PAGE_SIZE = 20;
const MAX_OPTIONS_PER_PRODUCT = 3;

@Injectable()
export class ProductService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(Product) private readonly productRepo: Repository<Product>,
    @InjectRepository(ProductSEO) private readonly seoRepo: Repository<ProductSEO>,
    @InjectRepository(ProductOption) private readonly optionRepo: Repository<ProductOption>,
    @InjectRepository(OptionValue) private readonly optionValueRepo: Repository<OptionValue>,
    @InjectRepository(ProductCategory) private readonly productCategoryRepo: Repository<ProductCategory>,
    @InjectRepository(Category) private readonly categoryRepo: Repository<Category>,
    @InjectRepository(Store) private readonly storeRepo: Repository<Store>,
  ) {}

  async findAll(filter: ProductFilterInput = {}, pagination: PaginationInput = {}): Promise<PaginatedProductsResponse> {
    const page = pagination.page ?? 1;
    const limit = pagination.limit ?? DEFAULT_PAGE_SIZE;
    const skip = (page - 1) * limit;

    const where: Record<string, unknown> = {};
    if (filter.store_id) where.store_id = filter.store_id;
    if (filter.status) where.status = filter.status;

    const [items, total] = await this.productRepo.findAndCount({
      where: {
        ...where,
        ...(filter.search
          ? [
              { ...where, title: ILike(`%${filter.search}%`) },
              { ...where, description: ILike(`%${filter.search}%`) },
              { ...where, brand: ILike(`%${filter.search}%`) },
            ]
          : where),
      },
      relations: {
        seo: true,
        options: { values: true },
        category_links: { category: true },
      },
      order: {
        created_at: 'DESC',
      },
      skip,
      take: limit,
    });

    const filtered = filter.category_id
      ? items.filter((item) => (item.category_links ?? []).some((link) => link.category_id === filter.category_id))
      : items;

    const mapped = filtered.map((item) => ({
      ...item,
      categories: (item.category_links ?? []).map((link) => link.category),
      options: (item.options ?? []).map((option) => ({
        ...option,
        values: [...(option.values ?? [])].sort((a, b) => a.position - b.position),
      })),
    }));

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items: mapped,
      total,
      page,
      limit,
      totalPages,
      hasNextPage: page < totalPages,
      hasPreviousPage: page > 1,
    };
  }

  async findOne(productId: number): Promise<Product> {
    const product = await this.productRepo.findOne({
      where: { product_id: productId },
      relations: {
        seo: true,
        options: { values: true },
        category_links: { category: true },
        variants: {
          inventory_item: {
            levels: true,
          },
        },
      },
    });

    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} not found`);
    }

    return {
      ...product,
      categories: (product.category_links ?? []).map((link) => link.category),
      options: (product.options ?? []).map((option) => ({
        ...option,
        values: [...(option.values ?? [])].sort((a, b) => a.position - b.position),
      })),
    };
  }

  async findByHandle(handle: string): Promise<Product> {
    const seo = await this.seoRepo.findOne({ where: { handle } });
    if (!seo) {
      throw new NotFoundException(`Product with handle '${handle}' not found`);
    }

    return this.findOne(seo.product_id);
  }

  async findByCategory(categoryId: number, pagination: PaginationInput = {}): Promise<PaginatedProductsResponse> {
    return this.findAll({ category_id: categoryId }, pagination);
  }

  async create(input: CreateProductInput): Promise<Product> {
    const { category_ids, seo, ...productData } = input;

    const store = await this.storeRepo.findOne({ where: { store_id: productData.store_id } });
    if (!store) {
      throw new NotFoundException(`Store with ID ${productData.store_id} not found`);
    }

    return this.dataSource.transaction(async (manager) => {
      if (seo?.handle) {
        const existingHandle = await manager.findOne(ProductSEO, {
          where: { handle: seo.handle },
        });
        if (existingHandle) {
          throw new ConflictException(`SEO handle '${seo.handle}' already exists`);
        }
      }

      const product = manager.create(Product, {
        ...productData,
        status: ProductStatus.DRAFT,
      });
      const savedProduct = await manager.save(Product, product);

      if (seo) {
        await manager.save(
          ProductSEO,
          manager.create(ProductSEO, {
            ...seo,
            product_id: savedProduct.product_id,
          }),
        );
      }

      if (category_ids && category_ids.length > 0) {
        const categories = await manager.find(Category, { where: { category_id: In(category_ids) } });
        if (categories.length !== category_ids.length) {
          throw new NotFoundException('One or more categories not found');
        }

        await manager.save(
          ProductCategory,
          category_ids.map((category_id) =>
            manager.create(ProductCategory, {
              product_id: savedProduct.product_id,
              category_id,
            }),
          ),
        );
      }

      return this.findOne(savedProduct.product_id);
    });
  }

  async update(input: UpdateProductInput): Promise<Product> {
    const { product_id, category_ids, seo, ...productData } = input;

    await this.findOne(product_id);

    return this.dataSource.transaction(async (manager) => {
      if (seo?.handle) {
        const existingHandle = await manager
          .createQueryBuilder(ProductSEO, 'seo')
          .where('seo.handle = :handle', { handle: seo.handle })
          .andWhere('seo.product_id != :productId', { productId: product_id })
          .getOne();

        if (existingHandle) {
          throw new ConflictException(`SEO handle '${seo.handle}' already exists`);
        }
      }

      await manager.update(Product, { product_id }, productData);

      if (category_ids !== undefined) {
        await manager.delete(ProductCategory, { product_id });

        if (category_ids.length > 0) {
          const categories = await manager.find(Category, { where: { category_id: In(category_ids) } });
          if (categories.length !== category_ids.length) {
            throw new NotFoundException('One or more categories not found');
          }

          await manager.save(
            ProductCategory,
            category_ids.map((category_id) =>
              manager.create(ProductCategory, {
                product_id,
                category_id,
              }),
            ),
          );
        }
      }

      if (seo) {
        const existingSeo = await manager.findOne(ProductSEO, { where: { product_id } });
        if (existingSeo) {
          await manager.update(ProductSEO, { product_id }, seo);
        } else {
          await manager.save(
            ProductSEO,
            manager.create(ProductSEO, {
              product_id,
              ...seo,
            }),
          );
        }
      }

      return this.findOne(product_id);
    });
  }

  async delete(productId: number): Promise<boolean> {
    await this.findOne(productId);
    await this.productRepo.delete({ product_id: productId });
    return true;
  }

  async addOption(input: AddProductOptionInput): Promise<ProductOption> {
    const { product_id, name, values, position } = input;
    await this.findOne(product_id);

    const optionCount = await this.optionRepo.count({ where: { product_id } });
    if (optionCount >= MAX_OPTIONS_PER_PRODUCT) {
      throw new ConflictException(`Products can have a maximum of ${MAX_OPTIONS_PER_PRODUCT} options`);
    }

    const optionPosition =
      position ??
      (await this.optionRepo
        .createQueryBuilder('option')
        .select('COALESCE(MAX(option.position), -1)', 'max')
        .where('option.product_id = :productId', { productId: product_id })
        .getRawOne<{ max: string }>()
        .then((row) => Number(row.max) + 1));

    return this.dataSource.transaction(async (manager) => {
      const option = await manager.save(
        ProductOption,
        manager.create(ProductOption, {
          product_id,
          name,
          position: optionPosition,
        }),
      );

      const optionValues = values.map((value, idx) =>
        manager.create(OptionValue, {
          option_id: option.option_id,
          value,
          position: idx,
        }),
      );

      await manager.save(OptionValue, optionValues);

      return manager.findOneOrFail(ProductOption, {
        where: { option_id: option.option_id },
        relations: { values: true },
      });
    });
  }

  async removeOption(optionId: number): Promise<boolean> {
    const option = await this.optionRepo.findOne({ where: { option_id: optionId } });
    if (!option) {
      throw new NotFoundException(`Option with ID ${optionId} not found`);
    }

    await this.optionRepo.delete({ option_id: optionId });
    return true;
  }

  async publishProduct(productId: number): Promise<Product> {
    const product = await this.findOne(productId);

    if (product.status === ProductStatus.ACTIVE) {
      throw new ConflictException('Product is already published');
    }

    await this.productRepo.update(
      { product_id: productId },
      {
        status: ProductStatus.ACTIVE,
        published_at: new Date(),
      },
    );

    return this.findOne(productId);
  }

  async archiveProduct(productId: number): Promise<Product> {
    await this.findOne(productId);

    await this.productRepo.update(
      { product_id: productId },
      {
        status: ProductStatus.ARCHIVED,
      },
    );

    return this.findOne(productId);
  }
}
