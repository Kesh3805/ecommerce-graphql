require('dotenv').config();
const { Client } = require('pg');

const CATEGORY_TEMPLATE_VERSION = 3;
const COLLECTION_PRESET_VERSION = 1;

const COLLECTION_TYPE_AUTOMATED = 'AUTOMATED';
const RULE_OPERATOR_EQUALS = 'EQUALS';
const RULE_OPERATOR_GREATER_THAN_OR_EQUAL = 'GREATER_THAN_OR_EQUAL';
const RULE_OPERATOR_LESS_THAN_OR_EQUAL = 'LESS_THAN_OR_EQUAL';
const RULE_VALUE_TYPE_STRING = 'STRING';
const RULE_VALUE_TYPE_NUMBER = 'NUMBER';

function node(name, slug, profile, children = []) {
  return { name, slug, profile, children };
}

const CATEGORY_TREE = [
  node('Men', 'men', 'apparel', [
    node('Clothing', 'men-clothing', 'apparel', [
      node('Tops', 'men-tops', 'apparel', [
        node('T-Shirts', 'men-t-shirts', 'apparel'),
        node('Shirts & Polos', 'men-shirts-polos', 'apparel'),
        node('Hoodies & Sweatshirts', 'men-hoodies-sweatshirts', 'apparel'),
      ]),
      node('Bottoms', 'men-bottoms', 'apparel', [
        node('Jeans', 'men-jeans', 'apparel'),
        node('Trousers & Chinos', 'men-trousers-chinos', 'apparel'),
        node('Shorts', 'men-shorts', 'apparel'),
      ]),
      node('Ethnic Wear', 'men-ethnic-wear', 'apparel', [
        node('Kurtas', 'men-kurtas', 'apparel'),
        node('Sherwanis', 'men-sherwanis', 'apparel'),
      ]),
    ]),
    node('Footwear', 'men-footwear', 'footwear', [
      node('Casual Shoes', 'men-casual-shoes', 'footwear', [
        node('Sneakers', 'men-sneakers', 'footwear'),
        node('Loafers', 'men-loafers', 'footwear'),
      ]),
      node('Formal Shoes', 'men-formal-shoes', 'footwear', [
        node('Oxfords', 'men-oxfords', 'footwear'),
        node('Derbies', 'men-derbies', 'footwear'),
      ]),
      node('Sandals & Floaters', 'men-sandals-floaters', 'footwear', [
        node('Sandals', 'men-sandals', 'footwear'),
        node('Flip-Flops', 'men-flip-flops', 'footwear'),
      ]),
    ]),
    node('Accessories', 'men-accessories', 'accessories', [
      node('Watches', 'men-watches', 'accessories', [
        node('Analog Watches', 'men-analog-watches', 'accessories'),
        node('Smart Watches', 'men-smart-watches', 'accessories'),
      ]),
      node('Bags & Wallets', 'men-bags-wallets', 'accessories', [
        node('Backpacks', 'men-backpacks', 'accessories'),
        node('Wallets', 'men-wallets', 'accessories'),
      ]),
    ]),
  ]),
  node('Women', 'women', 'apparel', [
    node('Clothing', 'women-clothing', 'apparel', [
      node('Tops', 'women-tops', 'apparel', [
        node('T-Shirts', 'women-t-shirts', 'apparel'),
        node('Blouses & Shirts', 'women-blouses-shirts', 'apparel'),
        node('Sweaters & Cardigans', 'women-sweaters-cardigans', 'apparel'),
      ]),
      node('Bottoms', 'women-bottoms', 'apparel', [
        node('Jeans', 'women-jeans', 'apparel'),
        node('Skirts', 'women-skirts', 'apparel'),
        node('Leggings', 'women-leggings', 'apparel'),
      ]),
      node('Dresses & Jumpsuits', 'women-dresses-jumpsuits', 'apparel', [
        node('Casual Dresses', 'women-casual-dresses', 'apparel'),
        node('Evening Dresses', 'women-evening-dresses', 'apparel'),
      ]),
    ]),
    node('Footwear', 'women-footwear', 'footwear', [
      node('Flats & Sandals', 'women-flats-sandals', 'footwear', [
        node('Flats', 'women-flats', 'footwear'),
        node('Heeled Sandals', 'women-heeled-sandals', 'footwear'),
      ]),
      node('Heels', 'women-heels', 'footwear', [
        node('Pumps', 'women-pumps', 'footwear'),
        node('Block Heels', 'women-block-heels', 'footwear'),
      ]),
      node('Boots', 'women-boots', 'footwear', [
        node('Ankle Boots', 'women-ankle-boots', 'footwear'),
        node('Knee-High Boots', 'women-knee-high-boots', 'footwear'),
      ]),
    ]),
    node('Accessories', 'women-accessories', 'accessories', [
      node('Handbags', 'women-handbags', 'accessories', [
        node('Tote Bags', 'women-tote-bags', 'accessories'),
        node('Crossbody Bags', 'women-crossbody-bags', 'accessories'),
      ]),
      node('Jewelry', 'women-jewelry', 'accessories', [
        node('Earrings', 'women-earrings', 'accessories'),
        node('Necklaces', 'women-necklaces', 'accessories'),
      ]),
      node('Sunglasses', 'women-sunglasses', 'accessories', [
        node('Cat-Eye', 'women-cat-eye-sunglasses', 'accessories'),
        node('Aviators', 'women-aviator-sunglasses', 'accessories'),
      ]),
    ]),
  ]),
  node('Kids', 'kids', 'kids', [
    node('Boys', 'kids-boys', 'kids', [
      node('Clothing', 'kids-boys-clothing', 'kids', [
        node('T-Shirts', 'kids-boys-t-shirts', 'kids'),
        node('Jeans', 'kids-boys-jeans', 'kids'),
      ]),
      node('Footwear', 'kids-boys-footwear', 'footwear', [
        node('Sneakers', 'kids-boys-sneakers', 'footwear'),
        node('Sandals', 'kids-boys-sandals', 'footwear'),
      ]),
      node('Toys & Learning', 'kids-boys-toys-learning', 'kids', [
        node('STEM Toys', 'kids-boys-stem-toys', 'kids'),
        node('Action Figures', 'kids-boys-action-figures', 'kids'),
      ]),
    ]),
    node('Girls', 'kids-girls', 'kids', [
      node('Clothing', 'kids-girls-clothing', 'kids', [
        node('Dresses', 'kids-girls-dresses', 'kids'),
        node('Tops', 'kids-girls-tops', 'kids'),
      ]),
      node('Footwear', 'kids-girls-footwear', 'footwear', [
        node('Flats', 'kids-girls-flats', 'footwear'),
        node('Sneakers', 'kids-girls-sneakers', 'footwear'),
      ]),
      node('Toys & Learning', 'kids-girls-toys-learning', 'kids', [
        node('Dolls', 'kids-girls-dolls', 'kids'),
        node('Art & Craft Kits', 'kids-girls-art-craft-kits', 'kids'),
      ]),
    ]),
    node('Baby', 'kids-baby', 'kids', [
      node('Clothing', 'kids-baby-clothing', 'kids', [
        node('Bodysuits', 'kids-baby-bodysuits', 'kids'),
        node('Sleepwear', 'kids-baby-sleepwear', 'kids'),
      ]),
      node('Essentials', 'kids-baby-essentials', 'kids', [
        node('Diapers', 'kids-baby-diapers', 'kids'),
        node('Feeding Accessories', 'kids-baby-feeding-accessories', 'kids'),
      ]),
    ]),
  ]),
  node('Electronics', 'electronics', 'electronics', [
    node('Mobiles & Tablets', 'electronics-mobiles-tablets', 'electronics', [
      node('Smartphones', 'electronics-smartphones', 'electronics', [
        node('Android Phones', 'electronics-android-phones', 'electronics'),
        node('iOS Phones', 'electronics-ios-phones', 'electronics'),
      ]),
      node('Tablets', 'electronics-tablets', 'electronics', [
        node('Android Tablets', 'electronics-android-tablets', 'electronics'),
        node('iPads', 'electronics-ipads', 'electronics'),
      ]),
      node('Accessories', 'electronics-mobile-accessories', 'electronics', [
        node('Phone Cases', 'electronics-phone-cases', 'electronics'),
        node('Chargers', 'electronics-chargers', 'electronics'),
      ]),
    ]),
    node('Computers', 'electronics-computers', 'electronics', [
      node('Laptops', 'electronics-laptops', 'electronics', [
        node('Ultrabooks', 'electronics-ultrabooks', 'electronics'),
        node('Gaming Laptops', 'electronics-gaming-laptops', 'electronics'),
      ]),
      node('Desktop & Components', 'electronics-desktop-components', 'electronics', [
        node('Monitors', 'electronics-monitors', 'electronics'),
        node('Graphic Cards', 'electronics-graphic-cards', 'electronics'),
      ]),
      node('Storage', 'electronics-storage', 'electronics', [
        node('SSDs', 'electronics-ssds', 'electronics'),
        node('External Hard Drives', 'electronics-external-hard-drives', 'electronics'),
      ]),
    ]),
    node('TV & Audio', 'electronics-tv-audio', 'electronics', [
      node('Televisions', 'electronics-televisions', 'electronics', [
        node('Smart TVs', 'electronics-smart-tvs', 'electronics'),
        node('OLED TVs', 'electronics-oled-tvs', 'electronics'),
      ]),
      node('Audio', 'electronics-audio', 'electronics', [
        node('Soundbars', 'electronics-soundbars', 'electronics'),
        node('Headphones', 'electronics-headphones', 'electronics'),
      ]),
      node('Cameras', 'electronics-cameras', 'electronics', [
        node('DSLR Cameras', 'electronics-dslr-cameras', 'electronics'),
        node('Mirrorless Cameras', 'electronics-mirrorless-cameras', 'electronics'),
      ]),
    ]),
  ]),
  node('Home & Living', 'home-living', 'home', [
    node('Furniture', 'home-furniture', 'home', [
      node('Living Room', 'home-living-room', 'home', [
        node('Sofas', 'home-sofas', 'home'),
        node('Coffee Tables', 'home-coffee-tables', 'home'),
      ]),
      node('Bedroom', 'home-bedroom', 'home', [
        node('Beds', 'home-beds', 'home'),
        node('Wardrobes', 'home-wardrobes', 'home'),
      ]),
      node('Office', 'home-office', 'home', [
        node('Desks', 'home-desks', 'home'),
        node('Office Chairs', 'home-office-chairs', 'home'),
      ]),
    ]),
    node('Kitchen & Dining', 'home-kitchen-dining', 'home', [
      node('Cookware', 'home-cookware', 'home', [
        node('Pots & Pans', 'home-pots-pans', 'home'),
        node('Pressure Cookers', 'home-pressure-cookers', 'home'),
      ]),
      node('Appliances', 'home-appliances', 'home', [
        node('Mixer Grinders', 'home-mixer-grinders', 'home'),
        node('Microwave Ovens', 'home-microwave-ovens', 'home'),
      ]),
      node('Dinnerware', 'home-dinnerware', 'home', [
        node('Plates', 'home-plates', 'home'),
        node('Cutlery', 'home-cutlery', 'home'),
      ]),
    ]),
    node('Home Decor', 'home-decor', 'home', [
      node('Lighting', 'home-lighting', 'home', [
        node('Ceiling Lights', 'home-ceiling-lights', 'home'),
        node('Table Lamps', 'home-table-lamps', 'home'),
      ]),
      node('Soft Furnishing', 'home-soft-furnishing', 'home', [
        node('Curtains', 'home-curtains', 'home'),
        node('Cushions', 'home-cushions', 'home'),
      ]),
      node('Wall Decor', 'home-wall-decor', 'home', [
        node('Wall Art', 'home-wall-art', 'home'),
        node('Mirrors', 'home-mirrors', 'home'),
      ]),
    ]),
  ]),
  node('Beauty & Personal Care', 'beauty-personal-care', 'beauty', [
    node('Makeup', 'beauty-makeup', 'beauty', [
      node('Face', 'beauty-face', 'beauty', [
        node('Foundation', 'beauty-foundation', 'beauty'),
        node('Concealer', 'beauty-concealer', 'beauty'),
      ]),
      node('Eyes', 'beauty-eyes', 'beauty', [
        node('Eyeliner', 'beauty-eyeliner', 'beauty'),
        node('Mascara', 'beauty-mascara', 'beauty'),
      ]),
      node('Lips', 'beauty-lips', 'beauty', [
        node('Lipstick', 'beauty-lipstick', 'beauty'),
        node('Lip Gloss', 'beauty-lip-gloss', 'beauty'),
      ]),
    ]),
    node('Skincare', 'beauty-skincare', 'beauty', [
      node('Cleansers', 'beauty-cleansers', 'beauty', [
        node('Face Wash', 'beauty-face-wash', 'beauty'),
        node('Cleansing Balm', 'beauty-cleansing-balm', 'beauty'),
      ]),
      node('Moisturizers', 'beauty-moisturizers', 'beauty', [
        node('Day Cream', 'beauty-day-cream', 'beauty'),
        node('Night Cream', 'beauty-night-cream', 'beauty'),
      ]),
      node('Sun Care', 'beauty-sun-care', 'beauty', [
        node('Sunscreen', 'beauty-sunscreen', 'beauty'),
        node('After Sun Gel', 'beauty-after-sun-gel', 'beauty'),
      ]),
    ]),
    node('Haircare', 'beauty-haircare', 'beauty', [
      node('Shampoo & Conditioner', 'beauty-shampoo-conditioner', 'beauty', [
        node('Shampoo', 'beauty-shampoo', 'beauty'),
        node('Conditioner', 'beauty-conditioner', 'beauty'),
      ]),
      node('Styling', 'beauty-styling', 'beauty', [
        node('Hair Serum', 'beauty-hair-serum', 'beauty'),
        node('Hair Spray', 'beauty-hair-spray', 'beauty'),
      ]),
      node('Tools', 'beauty-tools', 'beauty', [
        node('Hair Dryer', 'beauty-hair-dryer', 'beauty'),
        node('Hair Straightener', 'beauty-hair-straightener', 'beauty'),
      ]),
    ]),
  ]),
  node('Sports & Outdoors', 'sports-outdoors', 'sports', [
    node('Fitness', 'sports-fitness', 'sports', [
      node('Cardio Equipment', 'sports-cardio-equipment', 'sports', [
        node('Treadmills', 'sports-treadmills', 'sports'),
        node('Exercise Bikes', 'sports-exercise-bikes', 'sports'),
      ]),
      node('Strength Training', 'sports-strength-training', 'sports', [
        node('Dumbbells', 'sports-dumbbells', 'sports'),
        node('Resistance Bands', 'sports-resistance-bands', 'sports'),
      ]),
      node('Yoga', 'sports-yoga', 'sports', [
        node('Yoga Mats', 'sports-yoga-mats', 'sports'),
        node('Yoga Blocks', 'sports-yoga-blocks', 'sports'),
      ]),
    ]),
    node('Outdoor', 'sports-outdoor', 'sports', [
      node('Camping', 'sports-camping', 'sports', [
        node('Tents', 'sports-tents', 'sports'),
        node('Sleeping Bags', 'sports-sleeping-bags', 'sports'),
      ]),
      node('Cycling', 'sports-cycling', 'sports', [
        node('Bicycles', 'sports-bicycles', 'sports'),
        node('Helmets', 'sports-helmets', 'sports'),
      ]),
      node('Trekking', 'sports-trekking', 'sports', [
        node('Backpacks', 'sports-backpacks', 'sports'),
        node('Trekking Poles', 'sports-trekking-poles', 'sports'),
      ]),
    ]),
    node('Sportswear', 'sports-sportswear', 'sports', [
      node('Men Sportswear', 'sports-men-sportswear', 'sports', [
        node('Performance T-Shirts', 'sports-men-performance-tshirts', 'sports'),
        node('Training Shorts', 'sports-men-training-shorts', 'sports'),
      ]),
      node('Women Sportswear', 'sports-women-sportswear', 'sports', [
        node('Sports Bras', 'sports-women-sports-bras', 'sports'),
        node('Leggings', 'sports-women-leggings', 'sports'),
      ]),
      node('Footwear', 'sports-footwear', 'sports', [
        node('Running Shoes', 'sports-running-shoes', 'sports'),
        node('Training Shoes', 'sports-training-shoes', 'sports'),
      ]),
    ]),
  ]),
  node('Automotive', 'automotive', 'automotive', [
    node('Car Accessories', 'automotive-car-accessories', 'automotive', [
      node('Interior', 'automotive-interior', 'automotive', [
        node('Seat Covers', 'automotive-seat-covers', 'automotive'),
        node('Car Organizers', 'automotive-car-organizers', 'automotive'),
      ]),
      node('Exterior', 'automotive-exterior', 'automotive', [
        node('Car Covers', 'automotive-car-covers', 'automotive'),
        node('Wipers', 'automotive-wipers', 'automotive'),
      ]),
      node('Electronics', 'automotive-electronics', 'automotive', [
        node('Dash Cams', 'automotive-dash-cams', 'automotive'),
        node('Car Chargers', 'automotive-car-chargers', 'automotive'),
      ]),
    ]),
    node('Bike Accessories', 'automotive-bike-accessories', 'automotive', [
      node('Riding Gear', 'automotive-riding-gear', 'automotive', [
        node('Helmets', 'automotive-helmets', 'automotive'),
        node('Riding Gloves', 'automotive-riding-gloves', 'automotive'),
      ]),
      node('Protection', 'automotive-protection', 'automotive', [
        node('Crash Guards', 'automotive-crash-guards', 'automotive'),
        node('Bike Covers', 'automotive-bike-covers', 'automotive'),
      ]),
      node('Maintenance', 'automotive-maintenance', 'automotive', [
        node('Chain Lubes', 'automotive-chain-lubes', 'automotive'),
        node('Cleaning Kits', 'automotive-cleaning-kits', 'automotive'),
      ]),
    ]),
    node('Tyres & Care', 'automotive-tyres-care', 'automotive', [
      node('Car Tyres', 'automotive-car-tyres', 'automotive', [
        node('All-Season Tyres', 'automotive-all-season-tyres', 'automotive'),
        node('Performance Tyres', 'automotive-performance-tyres', 'automotive'),
      ]),
      node('Bike Tyres', 'automotive-bike-tyres', 'automotive', [
        node('Tubeless Tyres', 'automotive-tubeless-tyres', 'automotive'),
        node('Off-Road Tyres', 'automotive-off-road-tyres', 'automotive'),
      ]),
      node('Car Care', 'automotive-car-care', 'automotive', [
        node('Polish', 'automotive-polish', 'automotive'),
        node('Wash Shampoos', 'automotive-wash-shampoos', 'automotive'),
      ]),
    ]),
  ]),
  node('Pets', 'pets', 'pets', [
    node('Dog Supplies', 'pets-dog-supplies', 'pets', [
      node('Food', 'pets-dog-food', 'pets', [
        node('Dry Dog Food', 'pets-dry-dog-food', 'pets'),
        node('Wet Dog Food', 'pets-wet-dog-food', 'pets'),
      ]),
      node('Grooming', 'pets-dog-grooming', 'pets', [
        node('Dog Shampoo', 'pets-dog-shampoo', 'pets'),
        node('Grooming Brushes', 'pets-grooming-brushes', 'pets'),
      ]),
      node('Accessories', 'pets-dog-accessories', 'pets', [
        node('Dog Beds', 'pets-dog-beds', 'pets'),
        node('Dog Leashes', 'pets-dog-leashes', 'pets'),
      ]),
    ]),
    node('Cat Supplies', 'pets-cat-supplies', 'pets', [
      node('Food', 'pets-cat-food', 'pets', [
        node('Dry Cat Food', 'pets-dry-cat-food', 'pets'),
        node('Wet Cat Food', 'pets-wet-cat-food', 'pets'),
      ]),
      node('Litter', 'pets-cat-litter', 'pets', [
        node('Clumping Litter', 'pets-clumping-litter', 'pets'),
        node('Litter Boxes', 'pets-litter-boxes', 'pets'),
      ]),
      node('Accessories', 'pets-cat-accessories', 'pets', [
        node('Cat Trees', 'pets-cat-trees', 'pets'),
        node('Cat Toys', 'pets-cat-toys', 'pets'),
      ]),
    ]),
    node('Small Pets', 'pets-small-pets', 'pets', [
      node('Bird Supplies', 'pets-bird-supplies', 'pets', [
        node('Bird Food', 'pets-bird-food', 'pets'),
        node('Bird Cages', 'pets-bird-cages', 'pets'),
      ]),
      node('Fish Supplies', 'pets-fish-supplies', 'pets', [
        node('Aquarium Filters', 'pets-aquarium-filters', 'pets'),
        node('Fish Food', 'pets-fish-food', 'pets'),
      ]),
      node('Rabbit Supplies', 'pets-rabbit-supplies', 'pets', [
        node('Hay', 'pets-rabbit-hay', 'pets'),
        node('Hutch Accessories', 'pets-hutch-accessories', 'pets'),
      ]),
    ]),
  ]),
];

function metafieldDefinition({
  namespace,
  key,
  label,
  value_type,
  owner_type,
  is_required = false,
  is_filterable = false,
  options = null,
  validation = null,
  sort_order = 0,
}) {
  return {
    namespace,
    key,
    label,
    value_type,
    owner_type,
    is_required,
    is_filterable,
    options,
    validation,
    sort_order,
  };
}

const BASE_METAFIELD_DEFINITIONS = [
  metafieldDefinition({
    namespace: 'seo',
    key: 'title_tag',
    label: 'SEO Title',
    value_type: 'single_line_text',
    owner_type: 'PRODUCT',
    sort_order: 10,
  }),
  metafieldDefinition({
    namespace: 'seo',
    key: 'meta_description',
    label: 'SEO Meta Description',
    value_type: 'multi_line_text',
    owner_type: 'PRODUCT',
    sort_order: 20,
  }),
  metafieldDefinition({
    namespace: 'storefront',
    key: 'badge_text',
    label: 'Storefront Badge Text',
    value_type: 'single_line_text',
    owner_type: 'PRODUCT',
    is_filterable: true,
    sort_order: 30,
  }),
  metafieldDefinition({
    namespace: 'storefront',
    key: 'highlights',
    label: 'Storefront Highlights',
    value_type: 'json',
    owner_type: 'PRODUCT',
    sort_order: 40,
  }),
  metafieldDefinition({
    namespace: 'specs',
    key: 'material',
    label: 'Material',
    value_type: 'single_line_text',
    owner_type: 'PRODUCT',
    is_filterable: true,
    sort_order: 50,
  }),
  metafieldDefinition({
    namespace: 'specs',
    key: 'dimensions',
    label: 'Dimensions',
    value_type: 'single_line_text',
    owner_type: 'PRODUCT',
    sort_order: 60,
  }),
  metafieldDefinition({
    namespace: 'specs',
    key: 'weight',
    label: 'Weight',
    value_type: 'number_decimal',
    owner_type: 'PRODUCT',
    sort_order: 70,
  }),
  metafieldDefinition({
    namespace: 'variant',
    key: 'color_hex',
    label: 'Variant Color Hex',
    value_type: 'single_line_text',
    owner_type: 'VARIANT',
    sort_order: 80,
  }),
  metafieldDefinition({
    namespace: 'variant',
    key: 'size_guide',
    label: 'Variant Size Guide',
    value_type: 'multi_line_text',
    owner_type: 'VARIANT',
    sort_order: 90,
  }),
  metafieldDefinition({
    namespace: 'variant',
    key: 'swatch_image_url',
    label: 'Variant Swatch Image URL',
    value_type: 'single_line_text',
    owner_type: 'VARIANT',
    sort_order: 100,
  }),
];

const CATEGORY_PROFILE_TEMPLATES = {
  apparel: {
    option_templates: [
      { name: 'Size', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL'] },
      { name: 'Color', values: ['Black', 'White', 'Blue', 'Grey', 'Beige', 'Olive'] },
      { name: 'Fit', values: ['Slim', 'Regular', 'Relaxed', 'Oversized'] },
    ],
    metafield_definitions: [
      metafieldDefinition({
        namespace: 'care',
        key: 'instructions',
        label: 'Care Instructions',
        value_type: 'multi_line_text',
        owner_type: 'PRODUCT',
        sort_order: 110,
      }),
    ],
    automation_keywords: ['apparel', 'fashion', 'new-arrivals'],
  },
  kids: {
    option_templates: [
      { name: 'Age Group', values: ['0-6M', '6-12M', '1-2Y', '3-4Y', '5-6Y', '7-8Y', '9-10Y'] },
      { name: 'Color', values: ['Blue', 'Pink', 'Yellow', 'Green', 'White'] },
      { name: 'Size', values: ['S', 'M', 'L', 'XL'] },
    ],
    metafield_definitions: [
      metafieldDefinition({
        namespace: 'specs',
        key: 'age_group',
        label: 'Recommended Age Group',
        value_type: 'single_line_text',
        owner_type: 'PRODUCT',
        is_filterable: true,
        sort_order: 120,
      }),
      metafieldDefinition({
        namespace: 'safety',
        key: 'warnings',
        label: 'Safety Warnings',
        value_type: 'multi_line_text',
        owner_type: 'PRODUCT',
        sort_order: 130,
      }),
    ],
    automation_keywords: ['kids', 'school', 'family'],
  },
  footwear: {
    option_templates: [
      { name: 'Size', values: ['5', '6', '7', '8', '9', '10', '11', '12'] },
      { name: 'Color', values: ['Black', 'White', 'Brown', 'Navy', 'Tan'] },
      { name: 'Width', values: ['Narrow', 'Regular', 'Wide'] },
    ],
    metafield_definitions: [
      metafieldDefinition({
        namespace: 'specs',
        key: 'upper_material',
        label: 'Upper Material',
        value_type: 'single_line_text',
        owner_type: 'PRODUCT',
        sort_order: 110,
      }),
      metafieldDefinition({
        namespace: 'specs',
        key: 'sole_material',
        label: 'Sole Material',
        value_type: 'single_line_text',
        owner_type: 'PRODUCT',
        sort_order: 120,
      }),
    ],
    automation_keywords: ['footwear', 'running', 'seasonal'],
  },
  accessories: {
    option_templates: [
      { name: 'Color', values: ['Black', 'Brown', 'Tan', 'Gold', 'Silver'] },
      { name: 'Material', values: ['Leather', 'PU', 'Metal', 'Fabric'] },
    ],
    metafield_definitions: [
      metafieldDefinition({
        namespace: 'specs',
        key: 'strap_type',
        label: 'Strap Type',
        value_type: 'single_line_text',
        owner_type: 'PRODUCT',
        sort_order: 110,
      }),
    ],
    automation_keywords: ['accessories', 'gift', 'trending'],
  },
  electronics: {
    option_templates: [
      { name: 'Color', values: ['Black', 'White', 'Silver', 'Blue', 'Graphite'] },
      { name: 'Storage', values: ['64GB', '128GB', '256GB', '512GB', '1TB'] },
      { name: 'Warranty', values: ['6 Months', '12 Months', '24 Months'] },
    ],
    metafield_definitions: [
      metafieldDefinition({
        namespace: 'specs',
        key: 'battery_capacity',
        label: 'Battery Capacity',
        value_type: 'single_line_text',
        owner_type: 'PRODUCT',
        sort_order: 110,
      }),
      metafieldDefinition({
        namespace: 'specs',
        key: 'connectivity',
        label: 'Connectivity',
        value_type: 'single_line_text',
        owner_type: 'PRODUCT',
        sort_order: 120,
      }),
      metafieldDefinition({
        namespace: 'warranty',
        key: 'coverage',
        label: 'Warranty Coverage',
        value_type: 'multi_line_text',
        owner_type: 'PRODUCT',
        sort_order: 130,
      }),
    ],
    automation_keywords: ['electronics', 'new-arrivals', 'best-arrivals'],
  },
  home: {
    option_templates: [
      { name: 'Size', values: ['Small', 'Medium', 'Large', 'Queen', 'King'] },
      { name: 'Color', values: ['White', 'Grey', 'Brown', 'Beige', 'Black'] },
      { name: 'Material', values: ['Wood', 'Metal', 'Glass', 'Cotton', 'Ceramic'] },
    ],
    metafield_definitions: [
      metafieldDefinition({
        namespace: 'specs',
        key: 'assembly_required',
        label: 'Assembly Required',
        value_type: 'boolean',
        owner_type: 'PRODUCT',
        sort_order: 110,
      }),
      metafieldDefinition({
        namespace: 'specs',
        key: 'room_type',
        label: 'Room Type',
        value_type: 'single_line_text',
        owner_type: 'PRODUCT',
        is_filterable: true,
        sort_order: 120,
      }),
    ],
    automation_keywords: ['home', 'living', 'seasonal'],
  },
  beauty: {
    option_templates: [
      { name: 'Shade', values: ['Light', 'Medium', 'Deep', 'Rose', 'Nude'] },
      { name: 'Size', values: ['10ml', '30ml', '50ml', '100ml'] },
    ],
    metafield_definitions: [
      metafieldDefinition({
        namespace: 'specs',
        key: 'skin_type',
        label: 'Skin Type',
        value_type: 'single_line_text',
        owner_type: 'PRODUCT',
        is_filterable: true,
        sort_order: 110,
      }),
      metafieldDefinition({
        namespace: 'specs',
        key: 'ingredients',
        label: 'Ingredients',
        value_type: 'multi_line_text',
        owner_type: 'PRODUCT',
        sort_order: 120,
      }),
      metafieldDefinition({
        namespace: 'specs',
        key: 'expiry_date',
        label: 'Expiry Date',
        value_type: 'single_line_text',
        owner_type: 'PRODUCT',
        sort_order: 130,
      }),
    ],
    automation_keywords: ['beauty', 'summer-collection', 'new-arrivals'],
  },
  sports: {
    option_templates: [
      { name: 'Size', values: ['XS', 'S', 'M', 'L', 'XL'] },
      { name: 'Color', values: ['Black', 'Blue', 'Grey', 'Red', 'Green'] },
      { name: 'Activity', values: ['Running', 'Training', 'Yoga', 'Cycling', 'Trekking'] },
    ],
    metafield_definitions: [
      metafieldDefinition({
        namespace: 'specs',
        key: 'activity_type',
        label: 'Activity Type',
        value_type: 'single_line_text',
        owner_type: 'PRODUCT',
        is_filterable: true,
        sort_order: 110,
      }),
      metafieldDefinition({
        namespace: 'specs',
        key: 'performance_rating',
        label: 'Performance Rating',
        value_type: 'number_decimal',
        owner_type: 'PRODUCT',
        sort_order: 120,
      }),
    ],
    automation_keywords: ['sports', 'outdoor', 'best-arrivals'],
  },
  automotive: {
    option_templates: [
      { name: 'Vehicle Type', values: ['Car', 'Bike', 'SUV', 'Truck'] },
      { name: 'Color', values: ['Black', 'Grey', 'Silver', 'Red'] },
    ],
    metafield_definitions: [
      metafieldDefinition({
        namespace: 'specs',
        key: 'vehicle_compatibility',
        label: 'Vehicle Compatibility',
        value_type: 'single_line_text',
        owner_type: 'PRODUCT',
        is_filterable: true,
        sort_order: 110,
      }),
      metafieldDefinition({
        namespace: 'warranty',
        key: 'months',
        label: 'Warranty Months',
        value_type: 'number_integer',
        owner_type: 'PRODUCT',
        sort_order: 120,
      }),
    ],
    automation_keywords: ['automotive', 'best-sellers'],
  },
  pets: {
    option_templates: [
      { name: 'Pet Type', values: ['Dog', 'Cat', 'Bird', 'Fish', 'Rabbit'] },
      { name: 'Life Stage', values: ['Baby', 'Adult', 'Senior'] },
    ],
    metafield_definitions: [
      metafieldDefinition({
        namespace: 'specs',
        key: 'breed_size',
        label: 'Breed Size',
        value_type: 'single_line_text',
        owner_type: 'PRODUCT',
        is_filterable: true,
        sort_order: 110,
      }),
      metafieldDefinition({
        namespace: 'specs',
        key: 'ingredients',
        label: 'Ingredients',
        value_type: 'multi_line_text',
        owner_type: 'PRODUCT',
        sort_order: 120,
      }),
    ],
    automation_keywords: ['pets', 'new-arrivals'],
  },
};

const COLLECTION_PRESETS = [
  {
    slug: 'new-arrivals',
    name: 'New Arrivals',
    description: 'Recently listed products that are active in the store catalog.',
    position: 1,
    buildRules: ({ latestProductIdByStore, storeId }) => {
      const latestProductId = latestProductIdByStore.get(storeId) || 0;
      const threshold = Math.max(latestProductId - 120, 1);

      return [
        { rule_group: 0, field: 'status', operator: RULE_OPERATOR_EQUALS, value: 'ACTIVE', value_type: RULE_VALUE_TYPE_STRING },
        {
          rule_group: 0,
          field: 'product_id',
          operator: RULE_OPERATOR_GREATER_THAN_OR_EQUAL,
          value: String(threshold),
          value_type: RULE_VALUE_TYPE_NUMBER,
        },
      ];
    },
  },
  {
    slug: 'summer-collection',
    name: 'Summer Collection',
    description: 'Warm-weather products automatically selected from summer-friendly categories.',
    position: 2,
    buildRules: ({ categoryIdBySlug }) =>
      buildGroupedCategoryRules(
        [
          'women-casual-dresses',
          'men-shorts',
          'women-heeled-sandals',
          'men-sandals',
          'kids-boys-sandals',
          'kids-girls-flats',
        ],
        categoryIdBySlug,
      ),
  },
  {
    slug: 'winter-collection',
    name: 'Winter Collection',
    description: 'Cold-weather product set built from winter-oriented categories.',
    position: 3,
    buildRules: ({ categoryIdBySlug }) =>
      buildGroupedCategoryRules(
        [
          'men-hoodies-sweatshirts',
          'women-sweaters-cardigans',
          'women-ankle-boots',
          'men-oxfords',
          'kids-baby-sleepwear',
          'home-curtains',
        ],
        categoryIdBySlug,
      ),
  },
  {
    slug: 'best-arrivals',
    name: 'Best Arrivals',
    description: 'Fresh products that are already attracting strong demand.',
    position: 4,
    buildRules: () => [
      { rule_group: 0, field: 'status', operator: RULE_OPERATOR_EQUALS, value: 'ACTIVE', value_type: RULE_VALUE_TYPE_STRING },
      {
        rule_group: 0,
        field: 'order_count_30d',
        operator: RULE_OPERATOR_GREATER_THAN_OR_EQUAL,
        value: '1',
        value_type: RULE_VALUE_TYPE_NUMBER,
      },
      { rule_group: 1, field: 'status', operator: RULE_OPERATOR_EQUALS, value: 'ACTIVE', value_type: RULE_VALUE_TYPE_STRING },
      {
        rule_group: 1,
        field: 'view_count_30d',
        operator: RULE_OPERATOR_GREATER_THAN_OR_EQUAL,
        value: '25',
        value_type: RULE_VALUE_TYPE_NUMBER,
      },
    ],
  },
  {
    slug: 'best-sellers',
    name: 'Best Sellers',
    description: 'Top performing products based on best-selling score.',
    position: 5,
    buildRules: () => [
      { rule_group: 0, field: 'status', operator: RULE_OPERATOR_EQUALS, value: 'ACTIVE', value_type: RULE_VALUE_TYPE_STRING },
      {
        rule_group: 0,
        field: 'best_selling_score',
        operator: RULE_OPERATOR_GREATER_THAN_OR_EQUAL,
        value: '0.1',
        value_type: RULE_VALUE_TYPE_NUMBER,
      },
    ],
  },
  {
    slug: 'trending-now',
    name: 'Trending Now',
    description: 'Products with strong momentum from recent behavior signals.',
    position: 6,
    buildRules: () => [
      { rule_group: 0, field: 'status', operator: RULE_OPERATOR_EQUALS, value: 'ACTIVE', value_type: RULE_VALUE_TYPE_STRING },
      {
        rule_group: 0,
        field: 'trending_score',
        operator: RULE_OPERATOR_GREATER_THAN_OR_EQUAL,
        value: '0.1',
        value_type: RULE_VALUE_TYPE_NUMBER,
      },
    ],
  },
  {
    slug: 'budget-picks',
    name: 'Budget Picks',
    description: 'Affordable products selected by variant price threshold.',
    position: 7,
    buildRules: () => [
      { rule_group: 0, field: 'status', operator: RULE_OPERATOR_EQUALS, value: 'ACTIVE', value_type: RULE_VALUE_TYPE_STRING },
      {
        rule_group: 0,
        field: 'price',
        operator: RULE_OPERATOR_LESS_THAN_OR_EQUAL,
        value: '50',
        value_type: RULE_VALUE_TYPE_NUMBER,
      },
    ],
  },
];

function buildGroupedCategoryRules(slugs, categoryIdBySlug) {
  const rules = [];
  let ruleGroup = 0;

  for (const slug of slugs) {
    const categoryId = categoryIdBySlug.get(slug);
    if (!categoryId) {
      continue;
    }

    rules.push({
      rule_group: ruleGroup,
      field: 'status',
      operator: RULE_OPERATOR_EQUALS,
      value: 'ACTIVE',
      value_type: RULE_VALUE_TYPE_STRING,
    });
    rules.push({
      rule_group: ruleGroup,
      field: 'category',
      operator: RULE_OPERATOR_EQUALS,
      value: String(categoryId),
      value_type: RULE_VALUE_TYPE_NUMBER,
    });

    ruleGroup += 1;
  }

  if (rules.length === 0) {
    return [{ rule_group: 0, field: 'status', operator: RULE_OPERATOR_EQUALS, value: 'ACTIVE', value_type: RULE_VALUE_TYPE_STRING }];
  }

  return rules;
}

function flattenCategoryTree(nodes, parentSlug = null, depth = 0, pathNames = [], pathSlugs = [], inheritedProfile = 'apparel') {
  const flattened = [];

  nodes.forEach((entry, index) => {
    const profile = entry.profile || inheritedProfile;
    const nextPathNames = [...pathNames, entry.name];
    const nextPathSlugs = [...pathSlugs, entry.slug];

    flattened.push({
      name: entry.name,
      slug: entry.slug,
      parentSlug,
      profile,
      depth,
      sort_order: index + 1,
      path_names: nextPathNames,
      path_slugs: nextPathSlugs,
      hasChildren: Array.isArray(entry.children) && entry.children.length > 0,
    });

    if (entry.children?.length) {
      flattened.push(
        ...flattenCategoryTree(entry.children, entry.slug, depth + 1, nextPathNames, nextPathSlugs, profile),
      );
    }
  });

  return flattened;
}

function mapValueTypeToLegacyType(valueType) {
  return valueType === 'multi_line_text' ? 'textarea' : 'text';
}

function dedupeDefinitions(definitions) {
  const byKey = new Map();

  for (const definition of definitions) {
    const key = `${definition.owner_type}|${definition.namespace}|${definition.key}`.toLowerCase();
    byKey.set(key, definition);
  }

  return Array.from(byKey.values())
    .map((entry, idx) => ({ ...entry, sort_order: idx + 1 }))
    .sort((a, b) => a.sort_order - b.sort_order);
}

function normalizeOptionTemplates(templates) {
  if (!Array.isArray(templates)) {
    return [];
  }

  return templates
    .map((template) => {
      const name = String(template?.name ?? '').trim();
      if (!name) {
        return null;
      }

      const values = Array.isArray(template?.values)
        ? [...new Set(template.values.map((value) => String(value ?? '').trim()).filter(Boolean))]
        : [];

      return { name, values };
    })
    .filter((entry) => entry !== null);
}

function normalizeCategoryMetadata(category) {
  const profileTemplate = CATEGORY_PROFILE_TEMPLATES[category.profile] || CATEGORY_PROFILE_TEMPLATES.apparel;
  const metafieldDefinitions = dedupeDefinitions([
    ...BASE_METAFIELD_DEFINITIONS,
    ...(profileTemplate.metafield_definitions || []),
  ]);

  const legacyMetafields = metafieldDefinitions
    .filter((definition) => definition.owner_type === 'PRODUCT')
    .map((definition) => ({
      key: `${definition.namespace}_${definition.key}`,
      label: definition.label,
      type: mapValueTypeToLegacyType(definition.value_type),
    }));

  return {
    template_version: CATEGORY_TEMPLATE_VERSION,
    managed_by: 'db_seed',
    is_predefined: true,
    profile: category.profile,
    taxonomy: {
      depth: category.depth,
      path_tree: category.path_names.join(' > '),
      path_slugs: category.path_slugs,
      root_slug: category.path_slugs[0],
      is_leaf: !category.hasChildren,
      is_active: true,
      sort_order: category.sort_order,
    },
    option_templates: normalizeOptionTemplates(profileTemplate.option_templates),
    metafields: legacyMetafields,
    metafield_definitions: metafieldDefinitions,
    automation: {
      preset_version: COLLECTION_PRESET_VERSION,
      keywords: profileTemplate.automation_keywords || [],
    },
  };
}

function buildPredefinedCategories() {
  return flattenCategoryTree(CATEGORY_TREE).map((category) => ({
    ...category,
    metadata: normalizeCategoryMetadata(category),
  }));
}

async function seedCategories(client) {
  const predefinedCategories = buildPredefinedCategories();
  const bySlug = new Map();

  for (const category of predefinedCategories.sort((a, b) => a.depth - b.depth || a.name.localeCompare(b.name))) {
    const parentId = category.parentSlug ? bySlug.get(category.parentSlug) : null;
    if (category.parentSlug && !parentId) {
      throw new Error(`Missing parent slug '${category.parentSlug}' while seeding '${category.slug}'`);
    }

    const upsert = await client.query(
      `
        INSERT INTO public."Category" ("name", "slug", "parent_id", "metadata")
        VALUES ($1, $2, $3, $4::jsonb)
        ON CONFLICT ("slug")
        DO UPDATE SET
          "name" = EXCLUDED."name",
          "parent_id" = EXCLUDED."parent_id",
          "metadata" = EXCLUDED."metadata"
        RETURNING "category_id", "slug"
      `,
      [category.name, category.slug, parentId, JSON.stringify(category.metadata)],
    );

    bySlug.set(category.slug, Number(upsert.rows[0].category_id));
  }

  const allowedSlugs = predefinedCategories.map((entry) => entry.slug);

  const staleCategories = await client.query(
    `
      SELECT "category_id"
      FROM public."Category"
      WHERE "slug" <> ALL($1::text[])
    `,
    [allowedSlugs],
  );

  const staleCategoryIds = staleCategories.rows
    .map((row) => Number(row.category_id))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (staleCategoryIds.length > 0) {
    await client.query('UPDATE public."Product" SET "category_id" = NULL WHERE "category_id" = ANY($1::int[])', [staleCategoryIds]);
    await client.query('DELETE FROM public."Category" WHERE "category_id" = ANY($1::int[])', [staleCategoryIds]);
  }

  return {
    seededCategoryCount: predefinedCategories.length,
    staleCategoryCount: staleCategoryIds.length,
    categoryIdBySlug: bySlug,
  };
}

async function seedAutomatedCollections(client, categoryIdBySlug) {
  const stores = await client.query('SELECT "store_id", "name" FROM public."Store" ORDER BY "store_id" ASC');
  if (stores.rowCount === 0) {
    return {
      seededCollectionCount: 0,
      seededRuleCount: 0,
      storeCount: 0,
    };
  }

  const latestProductRows = await client.query(
    `
      SELECT "store_id", COALESCE(MAX("product_id"), 0)::int AS max_product_id
      FROM public."Product"
      GROUP BY "store_id"
    `,
  );

  const latestProductIdByStore = new Map(
    latestProductRows.rows.map((row) => [Number(row.store_id), Number(row.max_product_id)]),
  );

  let seededCollectionCount = 0;
  let seededRuleCount = 0;

  for (const store of stores.rows) {
    const storeId = Number(store.store_id);

    for (const preset of COLLECTION_PRESETS) {
      const upsertCollection = await client.query(
        `
          INSERT INTO public."Collection" (
            "store_id",
            "name",
            "slug",
            "description",
            "collection_type",
            "is_visible",
            "position",
            "meta_title",
            "meta_description"
          )
          VALUES ($1, $2, $3, $4, $5, true, $6, $7, $8)
          ON CONFLICT ("store_id", "slug")
          DO UPDATE SET
            "name" = EXCLUDED."name",
            "description" = EXCLUDED."description",
            "collection_type" = EXCLUDED."collection_type",
            "is_visible" = EXCLUDED."is_visible",
            "position" = EXCLUDED."position",
            "meta_title" = EXCLUDED."meta_title",
            "meta_description" = EXCLUDED."meta_description"
          RETURNING "collection_id"
        `,
        [
          storeId,
          preset.name,
          preset.slug,
          preset.description,
          COLLECTION_TYPE_AUTOMATED,
          preset.position,
          `${preset.name} | Automated`,
          `${preset.description} (preset version ${COLLECTION_PRESET_VERSION}).`,
        ],
      );

      const collectionId = Number(upsertCollection.rows[0].collection_id);

      await client.query('DELETE FROM public."CollectionRule" WHERE "collection_id" = $1', [collectionId]);

      const rules = preset.buildRules({ categoryIdBySlug, latestProductIdByStore, storeId });
      for (const rule of rules) {
        await client.query(
          `
            INSERT INTO public."CollectionRule" (
              "collection_id",
              "rule_group",
              "field",
              "operator",
              "value",
              "value_type"
            )
            VALUES ($1, $2, $3, $4, $5, $6)
          `,
          [collectionId, rule.rule_group, rule.field, rule.operator, rule.value, rule.value_type],
        );
      }

      seededCollectionCount += 1;
      seededRuleCount += rules.length;
    }
  }

  return {
    seededCollectionCount,
    seededRuleCount,
    storeCount: stores.rowCount,
  };
}

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();

  try {
    await client.query('BEGIN');

    const categoryResult = await seedCategories(client);
    const collectionResult = await seedAutomatedCollections(client, categoryResult.categoryIdBySlug);

    await client.query('COMMIT');

    console.log(
      `Seeded ${categoryResult.seededCategoryCount} predefined categories (up to 4 levels) with Shopify-inspired metadata templates.`,
    );
    console.log(`Removed ${categoryResult.staleCategoryCount} non-predefined categories.`);
    console.log(
      `Seeded ${collectionResult.seededCollectionCount} automated collection presets and ${collectionResult.seededRuleCount} rules across ${collectionResult.storeCount} store(s).`,
    );
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

run().catch((error) => {
  console.error('Category/collection seed failed:', error.message || error);
  process.exit(1);
});
