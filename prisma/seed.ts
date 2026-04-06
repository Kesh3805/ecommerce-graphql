import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import * as bcrypt from "bcrypt";

const SALT_ROUNDS = 10;

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log("🌱 Seeding database...");

  // ──────────────────────────────────────────────
  // 1. Users
  // ──────────────────────────────────────────────
  const alicePassword = await bcrypt.hash("password123", SALT_ROUNDS);
  const bobPassword = await bcrypt.hash("password123", SALT_ROUNDS);

  const alice = await prisma.user.upsert({
    where: { email: "alice@example.com" },
    update: {},
    create: {
      email: "alice@example.com",
      name: "Alice Smith",
      password_hash: alicePassword,
      role: "STORE_OWNER",
      status: "ACTIVE",
    },
  });

  const bob = await prisma.user.upsert({
    where: { email: "bob@example.com" },
    update: {},
    create: {
      email: "bob@example.com",
      name: "Bob Jones",
      password_hash: bobPassword,
      role: "STORE_OWNER",
      status: "ACTIVE",
    },
  });

  console.log(`✅ Users: alice(${alice.user_id}), bob(${bob.user_id})`);

  // ──────────────────────────────────────────────
  // 2. Stores
  // ──────────────────────────────────────────────
  const aliceStore = await prisma.store.upsert({
    where: { store_id: 1 },
    update: {},
    create: { name: "Alice's Apparel", user_id: alice.user_id },
  });

  const bobStore = await prisma.store.upsert({
    where: { store_id: 2 },
    update: {},
    create: { name: "Bob's Electronics", user_id: bob.user_id },
  });

  console.log(
    `✅ Stores: ${aliceStore.name}(${aliceStore.store_id}), ${bobStore.name}(${bobStore.store_id})`
  );

  // ──────────────────────────────────────────────
  // 3. Categories (with hierarchy)
  // ──────────────────────────────────────────────
  const catClothing = await prisma.category.upsert({
    where: { category_id: 1 },
    update: {},
    create: {
      name: "Clothing",
      parent_id: null,
      metadata: { icon: "shirt", featured: true },
    },
  });

  const catElectronics = await prisma.category.upsert({
    where: { category_id: 2 },
    update: {},
    create: {
      name: "Electronics",
      parent_id: null,
      metadata: { icon: "bolt", featured: true },
    },
  });

  const catTshirts = await prisma.category.upsert({
    where: { category_id: 3 },
    update: {},
    create: {
      name: "T-Shirts",
      parent_id: catClothing.category_id,
      metadata: { icon: "tshirt", featured: false },
    },
  });

  const catPhones = await prisma.category.upsert({
    where: { category_id: 4 },
    update: {},
    create: {
      name: "Smartphones",
      parent_id: catElectronics.category_id,
      metadata: { icon: "phone", featured: true },
    },
  });

  const catLaptops = await prisma.category.upsert({
    where: { category_id: 5 },
    update: {},
    create: {
      name: "Laptops",
      parent_id: catElectronics.category_id,
      metadata: { icon: "laptop", featured: true },
    },
  });

  console.log(
    `✅ Categories: Clothing, Electronics, T-Shirts, Smartphones, Laptops`
  );

  // ──────────────────────────────────────────────
  // 4. Products (Alice's store — Clothing)
  // ──────────────────────────────────────────────
  const productTee = await prisma.product.upsert({
    where: { product_id: 1 },
    update: {},
    create: {
      title: "Classic Cotton Tee",
      description: "A comfortable everyday cotton t-shirt.",
      store_id: aliceStore.store_id,
      attributes: {
        create: [
          { attribute_key: "material", value: "100% Cotton" },
          { attribute_key: "fit", value: "Regular" },
        ],
      },
      seo: {
        create: {
          handle: "classic-cotton-tee",
          meta_title: "Classic Cotton Tee | Alice's Apparel",
          meta_description: "Comfortable everyday cotton t-shirt.",
          og_title: "Classic Cotton Tee",
          og_image: "https://example.com/images/classic-tee.jpg",
        },
      },
    },
  });

  const productHoodie = await prisma.product.upsert({
    where: { product_id: 2 },
    update: {},
    create: {
      title: "Urban Hoodie",
      description: "A warm fleece hoodie for the urban explorer.",
      store_id: aliceStore.store_id,
      attributes: {
        create: [
          { attribute_key: "material", value: "80% Cotton, 20% Polyester" },
          { attribute_key: "fit", value: "Oversized" },
        ],
      },
      seo: {
        create: {
          handle: "urban-hoodie",
          meta_title: "Urban Hoodie | Alice's Apparel",
          meta_description: "Warm fleece hoodie for the urban explorer.",
          og_title: "Urban Hoodie",
          og_image: "https://example.com/images/urban-hoodie.jpg",
        },
      },
    },
  });

  // Bob's store — Electronics
  const productPhone = await prisma.product.upsert({
    where: { product_id: 3 },
    update: {},
    create: {
      title: "ProPhone X",
      description: "Flagship smartphone with a 108MP camera.",
      store_id: bobStore.store_id,
      attributes: {
        create: [
          { attribute_key: "brand", value: "ProTech" },
          { attribute_key: "display", value: "6.7-inch AMOLED" },
          { attribute_key: "battery", value: "5000mAh" },
        ],
      },
      seo: {
        create: {
          handle: "prophone-x",
          meta_title: "ProPhone X | Bob's Electronics",
          meta_description: "Flagship smartphone with 108MP camera.",
          og_title: "ProPhone X",
          og_image: "https://example.com/images/prophone-x.jpg",
        },
      },
    },
  });

  const productLaptop = await prisma.product.upsert({
    where: { product_id: 4 },
    update: {},
    create: {
      title: "UltraBook Pro 15",
      description: "Thin and light laptop with all-day battery life.",
      store_id: bobStore.store_id,
      attributes: {
        create: [
          { attribute_key: "brand", value: "ProTech" },
          { attribute_key: "display", value: '15.6-inch IPS' },
          { attribute_key: "ram", value: "16GB" },
          { attribute_key: "storage", value: "512GB SSD" },
        ],
      },
      seo: {
        create: {
          handle: "ultrabook-pro-15",
          meta_title: "UltraBook Pro 15 | Bob's Electronics",
          meta_description: "Thin and light laptop, all-day battery.",
          og_title: "UltraBook Pro 15",
          og_image: "https://example.com/images/ultrabook-pro-15.jpg",
        },
      },
    },
  });

  console.log(
    `✅ Products: Classic Cotton Tee, Urban Hoodie, ProPhone X, UltraBook Pro 15`
  );

  // ──────────────────────────────────────────────
  // 5. Product ↔ Category links
  // ──────────────────────────────────────────────
  await prisma.productCategory.createMany({
    data: [
      { product_id: productTee.product_id, category_id: catClothing.category_id },
      { product_id: productTee.product_id, category_id: catTshirts.category_id },
      { product_id: productHoodie.product_id, category_id: catClothing.category_id },
      { product_id: productPhone.product_id, category_id: catElectronics.category_id },
      { product_id: productPhone.product_id, category_id: catPhones.category_id },
      { product_id: productLaptop.product_id, category_id: catElectronics.category_id },
      { product_id: productLaptop.product_id, category_id: catLaptops.category_id },
    ],
    skipDuplicates: true,
  });

  console.log(`✅ Product-Category links created`);

  // ──────────────────────────────────────────────
  // 6. Options + Variants + Inventory (Tee)
  // ──────────────────────────────────────────────
  const teeOptionSize = await prisma.productOption.create({
    data: {
      name: "Size",
      position: 1,
      product_id: productTee.product_id,
      values: { create: [{ value: "S" }, { value: "M" }, { value: "L" }, { value: "XL" }] },
    },
  });

  const teeOptionColor = await prisma.productOption.create({
    data: {
      name: "Color",
      position: 2,
      product_id: productTee.product_id,
      values: { create: [{ value: "White" }, { value: "Black" }, { value: "Navy" }] },
    },
  });

  const teeVariants = [
    { option1_value: "S", option2_value: "White", sku: "TEE-S-WHT", price: 19.99 },
    { option1_value: "M", option2_value: "White", sku: "TEE-M-WHT", price: 19.99 },
    { option1_value: "L", option2_value: "Black", sku: "TEE-L-BLK", price: 19.99 },
    { option1_value: "XL", option2_value: "Navy", sku: "TEE-XL-NVY", price: 21.99 },
  ];

  for (const v of teeVariants) {
    const inv = await prisma.inventoryItem.create({
      data: {
        sku: v.sku,
        tracked: true,
        levels: { create: { available_quantity: 100 } },
      },
    });
    await prisma.variant.create({
      data: {
        product_id: productTee.product_id,
        ...v,
        inventory_item_id: inv.inventory_item_id,
      },
    });
  }

  // Variants for ProPhone X
  const phoneVariants = [
    { option1_value: "128GB", option2_value: "Black", sku: "PHN-128-BLK", price: 799.0 },
    { option1_value: "256GB", option2_value: "Silver", sku: "PHN-256-SLV", price: 899.0 },
    { option1_value: "512GB", option2_value: "Gold", sku: "PHN-512-GLD", price: 999.0 },
  ];

  await prisma.productOption.create({
    data: {
      name: "Storage",
      position: 1,
      product_id: productPhone.product_id,
      values: { create: [{ value: "128GB" }, { value: "256GB" }, { value: "512GB" }] },
    },
  });
  await prisma.productOption.create({
    data: {
      name: "Color",
      position: 2,
      product_id: productPhone.product_id,
      values: { create: [{ value: "Black" }, { value: "Silver" }, { value: "Gold" }] },
    },
  });

  for (const v of phoneVariants) {
    const inv = await prisma.inventoryItem.create({
      data: {
        sku: v.sku,
        tracked: true,
        levels: { create: { available_quantity: 50 } },
      },
    });
    await prisma.variant.create({
      data: {
        product_id: productPhone.product_id,
        ...v,
        inventory_item_id: inv.inventory_item_id,
      },
    });
  }

  // Variants for UltraBook Pro 15
  const laptopVariants = [
    { option1_value: "16GB / 512GB", sku: "LPT-16-512", price: 1299.0 },
    { option1_value: "32GB / 1TB", sku: "LPT-32-1TB", price: 1599.0 },
  ];

  await prisma.productOption.create({
    data: {
      name: "Config",
      position: 1,
      product_id: productLaptop.product_id,
      values: { create: [{ value: "16GB / 512GB" }, { value: "32GB / 1TB" }] },
    },
  });

  for (const v of laptopVariants) {
    const inv = await prisma.inventoryItem.create({
      data: {
        sku: v.sku,
        tracked: true,
        levels: { create: { available_quantity: 30 } },
      },
    });
    await prisma.variant.create({
      data: {
        product_id: productLaptop.product_id,
        ...v,
        inventory_item_id: inv.inventory_item_id,
      },
    });
  }

  console.log(`✅ Options, variants, and inventory seeded`);

  // ──────────────────────────────────────────────
  // 7. Customers
  // ──────────────────────────────────────────────
  await prisma.customer.createMany({
    data: [
      { user_id: alice.user_id },
      { user_id: bob.user_id },
    ],
    skipDuplicates: true,
  });

  console.log(`✅ Customers seeded`);
  console.log("🎉 Seed complete!");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
