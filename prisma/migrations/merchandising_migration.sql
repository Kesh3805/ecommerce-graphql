-- PostgreSQL Migration: Merchandising & Product Discovery
-- Run this migration to create all tables for the merchandising system

BEGIN;

------------------------------------------------------
-- ENHANCED CATEGORIES WITH MATERIALIZED PATH
------------------------------------------------------

CREATE TABLE IF NOT EXISTS enhanced_categories (
    category_id       SERIAL PRIMARY KEY,
    store_id          INTEGER NOT NULL REFERENCES stores(store_id),
    
    -- Hierarchy
    parent_id         INTEGER REFERENCES enhanced_categories(category_id),
    path              TEXT NOT NULL,
    depth             INTEGER NOT NULL DEFAULT 0,
    
    -- Core Data
    name              VARCHAR(255) NOT NULL,
    slug              VARCHAR(255) NOT NULL,
    description       TEXT,
    
    -- Display
    position          INTEGER NOT NULL DEFAULT 0,
    is_visible        BOOLEAN NOT NULL DEFAULT true,
    image_url         VARCHAR(500),
    icon              VARCHAR(100),
    
    -- SEO
    meta_title        VARCHAR(255),
    meta_description  TEXT,
    
    -- Metadata
    metadata          JSONB DEFAULT '{}',
    
    -- Timestamps
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT uq_enhanced_category_slug_store UNIQUE (store_id, slug),
    CONSTRAINT uq_enhanced_category_path UNIQUE (path)
);

CREATE INDEX IF NOT EXISTS idx_enhanced_categories_store_id ON enhanced_categories(store_id);
CREATE INDEX IF NOT EXISTS idx_enhanced_categories_parent_id ON enhanced_categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_enhanced_categories_slug ON enhanced_categories(slug);
CREATE INDEX IF NOT EXISTS idx_enhanced_categories_path_prefix ON enhanced_categories (path varchar_pattern_ops);

CREATE TABLE IF NOT EXISTS enhanced_product_categories (
    id                SERIAL PRIMARY KEY,
    product_id        INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    category_id       INTEGER NOT NULL REFERENCES enhanced_categories(category_id) ON DELETE CASCADE,
    is_primary        BOOLEAN NOT NULL DEFAULT false,
    position          INTEGER NOT NULL DEFAULT 0,
    
    CONSTRAINT uq_enhanced_product_category UNIQUE (product_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_enhanced_product_categories_product ON enhanced_product_categories(product_id);
CREATE INDEX IF NOT EXISTS idx_enhanced_product_categories_category ON enhanced_product_categories(category_id);
CREATE INDEX IF NOT EXISTS idx_enhanced_product_categories_primary ON enhanced_product_categories(category_id, is_primary) WHERE is_primary = true;

CREATE TABLE IF NOT EXISTS category_filters (
    filter_id         SERIAL PRIMARY KEY,
    category_id       INTEGER NOT NULL REFERENCES enhanced_categories(category_id) ON DELETE CASCADE,
    attribute_key     VARCHAR(100) NOT NULL,
    filter_type       VARCHAR(50) NOT NULL,
    display_name      VARCHAR(100) NOT NULL,
    position          INTEGER NOT NULL DEFAULT 0,
    is_visible        BOOLEAN NOT NULL DEFAULT true,
    config            JSONB DEFAULT '{}',
    
    CONSTRAINT uq_category_filter UNIQUE (category_id, attribute_key)
);

CREATE INDEX IF NOT EXISTS idx_category_filters_category ON category_filters(category_id);

------------------------------------------------------
-- COLLECTIONS SYSTEM
------------------------------------------------------

CREATE TABLE IF NOT EXISTS collections (
    collection_id     SERIAL PRIMARY KEY,
    store_id          INTEGER NOT NULL REFERENCES stores(store_id),
    
    -- Core Data
    name              VARCHAR(255) NOT NULL,
    slug              VARCHAR(255) NOT NULL,
    description       TEXT,
    
    -- Type
    collection_type   VARCHAR(20) NOT NULL DEFAULT 'manual',
    
    -- Display
    image_url         VARCHAR(500),
    is_visible        BOOLEAN NOT NULL DEFAULT true,
    position          INTEGER NOT NULL DEFAULT 0,
    
    -- SEO
    meta_title        VARCHAR(255),
    meta_description  TEXT,
    
    -- Scheduling
    published_at      TIMESTAMP WITH TIME ZONE,
    unpublished_at    TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT uq_collection_slug_store UNIQUE (store_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_collections_store_id ON collections(store_id);
CREATE INDEX IF NOT EXISTS idx_collections_type ON collections(collection_type);

CREATE TABLE IF NOT EXISTS collection_products (
    id                SERIAL PRIMARY KEY,
    collection_id     INTEGER NOT NULL REFERENCES collections(collection_id) ON DELETE CASCADE,
    product_id        INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    position          INTEGER NOT NULL DEFAULT 0,
    added_at          TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT uq_collection_product UNIQUE (collection_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_products_collection ON collection_products(collection_id);
CREATE INDEX IF NOT EXISTS idx_collection_products_product ON collection_products(product_id);

CREATE TABLE IF NOT EXISTS collection_rules (
    rule_id           SERIAL PRIMARY KEY,
    collection_id     INTEGER NOT NULL REFERENCES collections(collection_id) ON DELETE CASCADE,
    rule_group        INTEGER NOT NULL DEFAULT 0,
    
    -- Rule Definition
    field             VARCHAR(100) NOT NULL,
    operator          VARCHAR(20) NOT NULL,
    value             TEXT NOT NULL,
    value_type        VARCHAR(20) NOT NULL DEFAULT 'string',
    
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_collection_rules_collection ON collection_rules(collection_id);

CREATE TABLE IF NOT EXISTS collection_product_cache (
    id                SERIAL PRIMARY KEY,
    collection_id     INTEGER NOT NULL REFERENCES collections(collection_id) ON DELETE CASCADE,
    product_id        INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    score             FLOAT NOT NULL DEFAULT 0,
    cached_at         TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT uq_collection_cache UNIQUE (collection_id, product_id)
);

CREATE INDEX IF NOT EXISTS idx_collection_cache_score ON collection_product_cache(collection_id, score DESC);

------------------------------------------------------
-- STOREFRONT PAGES & SECTIONS
------------------------------------------------------

CREATE TABLE IF NOT EXISTS storefront_pages (
    page_id           SERIAL PRIMARY KEY,
    store_id          INTEGER NOT NULL REFERENCES stores(store_id),
    
    -- Page Identity
    page_type         VARCHAR(50) NOT NULL,
    slug              VARCHAR(255),
    name              VARCHAR(255) NOT NULL,
    
    -- Status
    is_published      BOOLEAN NOT NULL DEFAULT false,
    published_at      TIMESTAMP WITH TIME ZONE,
    
    -- SEO
    meta_title        VARCHAR(255),
    meta_description  TEXT,
    
    -- Timestamps
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT uq_storefront_page UNIQUE (store_id, page_type, slug)
);

CREATE INDEX IF NOT EXISTS idx_storefront_pages_store ON storefront_pages(store_id);

CREATE TABLE IF NOT EXISTS page_sections (
    section_id        SERIAL PRIMARY KEY,
    page_id           INTEGER NOT NULL REFERENCES storefront_pages(page_id) ON DELETE CASCADE,
    
    -- Section Type
    section_type      VARCHAR(50) NOT NULL,
    
    -- Display
    title             VARCHAR(255),
    subtitle          TEXT,
    position          INTEGER NOT NULL DEFAULT 0,
    is_visible        BOOLEAN NOT NULL DEFAULT true,
    
    -- Configuration
    config            JSONB NOT NULL DEFAULT '{}',
    
    -- Scheduling
    visible_from      TIMESTAMP WITH TIME ZONE,
    visible_until     TIMESTAMP WITH TIME ZONE,
    
    -- Timestamps
    created_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at        TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_page_sections_page ON page_sections(page_id, position);

CREATE TABLE IF NOT EXISTS hero_banners (
    banner_id         SERIAL PRIMARY KEY,
    section_id        INTEGER NOT NULL REFERENCES page_sections(section_id) ON DELETE CASCADE,
    
    -- Content
    title             VARCHAR(255),
    subtitle          TEXT,
    cta_text          VARCHAR(100),
    cta_link          VARCHAR(500),
    
    -- Media
    desktop_image_url VARCHAR(500) NOT NULL,
    mobile_image_url  VARCHAR(500),
    video_url         VARCHAR(500),
    
    -- Display
    position          INTEGER NOT NULL DEFAULT 0,
    text_color        VARCHAR(20) DEFAULT '#FFFFFF',
    overlay_opacity   FLOAT DEFAULT 0.3,
    text_position     VARCHAR(20) DEFAULT 'center',
    
    -- Scheduling
    visible_from      TIMESTAMP WITH TIME ZONE,
    visible_until     TIMESTAMP WITH TIME ZONE
);

CREATE INDEX IF NOT EXISTS idx_hero_banners_section ON hero_banners(section_id, position);

CREATE TABLE IF NOT EXISTS section_collections (
    id                SERIAL PRIMARY KEY,
    section_id        INTEGER NOT NULL REFERENCES page_sections(section_id) ON DELETE CASCADE,
    collection_id     INTEGER NOT NULL REFERENCES collections(collection_id) ON DELETE CASCADE,
    position          INTEGER NOT NULL DEFAULT 0,
    
    CONSTRAINT uq_section_collection UNIQUE (section_id, collection_id)
);

CREATE INDEX IF NOT EXISTS idx_section_collections_section ON section_collections(section_id);

CREATE TABLE IF NOT EXISTS section_categories (
    id                SERIAL PRIMARY KEY,
    section_id        INTEGER NOT NULL REFERENCES page_sections(section_id) ON DELETE CASCADE,
    category_id       INTEGER NOT NULL REFERENCES enhanced_categories(category_id) ON DELETE CASCADE,
    position          INTEGER NOT NULL DEFAULT 0,
    custom_image_url  VARCHAR(500),
    
    CONSTRAINT uq_section_category UNIQUE (section_id, category_id)
);

CREATE INDEX IF NOT EXISTS idx_section_categories_section ON section_categories(section_id);

------------------------------------------------------
-- PRODUCT ANALYTICS & STATS
------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_stats (
    product_id            INTEGER PRIMARY KEY REFERENCES products(product_id) ON DELETE CASCADE,
    
    -- Raw Counts
    order_count           INTEGER NOT NULL DEFAULT 0,
    order_count_30d       INTEGER NOT NULL DEFAULT 0,
    order_count_7d        INTEGER NOT NULL DEFAULT 0,
    
    view_count            INTEGER NOT NULL DEFAULT 0,
    view_count_30d        INTEGER NOT NULL DEFAULT 0,
    view_count_7d         INTEGER NOT NULL DEFAULT 0,
    
    add_to_cart_count     INTEGER NOT NULL DEFAULT 0,
    add_to_cart_count_30d INTEGER NOT NULL DEFAULT 0,
    add_to_cart_count_7d  INTEGER NOT NULL DEFAULT 0,
    
    -- Revenue
    total_revenue         DECIMAL(15,2) NOT NULL DEFAULT 0,
    revenue_30d           DECIMAL(15,2) NOT NULL DEFAULT 0,
    
    -- Pre-computed Scores
    best_selling_score    FLOAT NOT NULL DEFAULT 0,
    trending_score        FLOAT NOT NULL DEFAULT 0,
    
    -- Metadata
    last_computed_at      TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_stats_best_selling ON product_stats(best_selling_score DESC);
CREATE INDEX IF NOT EXISTS idx_product_stats_trending ON product_stats(trending_score DESC);

CREATE TABLE IF NOT EXISTS product_events (
    event_id              BIGSERIAL PRIMARY KEY,
    product_id            INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    event_type            VARCHAR(20) NOT NULL,
    event_date            DATE NOT NULL,
    count                 INTEGER NOT NULL DEFAULT 1,
    metadata              JSONB DEFAULT '{}',
    
    CONSTRAINT uq_product_event_day UNIQUE (product_id, event_type, event_date)
);

CREATE INDEX IF NOT EXISTS idx_product_events_date ON product_events(event_date);
CREATE INDEX IF NOT EXISTS idx_product_events_product ON product_events(product_id, event_type);

------------------------------------------------------
-- RELATED PRODUCTS & RECOMMENDATIONS
------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_relationships (
    id                    SERIAL PRIMARY KEY,
    source_product_id     INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    related_product_id    INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    relationship_type     VARCHAR(50) NOT NULL,
    score                 FLOAT NOT NULL DEFAULT 0,
    computed_at           TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    CONSTRAINT uq_product_relationship UNIQUE (source_product_id, related_product_id, relationship_type),
    CONSTRAINT chk_different_products CHECK (source_product_id != related_product_id)
);

CREATE INDEX IF NOT EXISTS idx_product_relationships_source ON product_relationships(source_product_id, relationship_type);
CREATE INDEX IF NOT EXISTS idx_product_relationships_score ON product_relationships(source_product_id, score DESC);

CREATE TABLE IF NOT EXISTS product_copurchases (
    product_a_id          INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    product_b_id          INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    copurchase_count      INTEGER NOT NULL DEFAULT 1,
    last_copurchase_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    PRIMARY KEY (product_a_id, product_b_id),
    CONSTRAINT chk_ordered_pairs CHECK (product_a_id < product_b_id)
);

CREATE INDEX IF NOT EXISTS idx_product_copurchases_a ON product_copurchases(product_a_id);
CREATE INDEX IF NOT EXISTS idx_product_copurchases_b ON product_copurchases(product_b_id);

------------------------------------------------------
-- PRODUCT MEDIA (Enhanced)
------------------------------------------------------

CREATE TABLE IF NOT EXISTS product_media (
    media_id      SERIAL PRIMARY KEY,
    product_id    INTEGER NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    
    -- Media Info
    media_type    VARCHAR(20) NOT NULL,
    url           VARCHAR(500) NOT NULL,
    alt_text      VARCHAR(255),
    position      INTEGER NOT NULL DEFAULT 0,
    
    -- Dimensions
    width         INTEGER,
    height        INTEGER,
    thumbnail_url VARCHAR(500),
    
    -- Variant association
    variant_id    INTEGER REFERENCES variants(variant_id),
    
    created_at    TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_media_product ON product_media(product_id, position);
CREATE INDEX IF NOT EXISTS idx_product_media_variant ON product_media(variant_id);

------------------------------------------------------
-- HELPER FUNCTIONS
------------------------------------------------------

-- Function to update category path when parent changes
CREATE OR REPLACE FUNCTION update_category_path()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.parent_id IS NULL THEN
        NEW.path := NEW.category_id::TEXT;
        NEW.depth := 0;
    ELSE
        SELECT path || '/' || NEW.category_id::TEXT, depth + 1
        INTO NEW.path, NEW.depth
        FROM enhanced_categories
        WHERE category_id = NEW.parent_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_category_path_insert ON enhanced_categories;
CREATE TRIGGER trg_category_path_insert
BEFORE INSERT ON enhanced_categories
FOR EACH ROW
EXECUTE FUNCTION update_category_path();

-- Function to compute best selling score
CREATE OR REPLACE FUNCTION compute_best_selling_score(
    order_count_30d INTEGER,
    add_to_cart_count_30d INTEGER,
    view_count_30d INTEGER
) RETURNS FLOAT AS $$
BEGIN
    RETURN (order_count_30d * 5) + (add_to_cart_count_30d * 2) + view_count_30d;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to record product event
CREATE OR REPLACE FUNCTION record_product_event(
    p_product_id INTEGER,
    p_event_type VARCHAR(20),
    p_count INTEGER DEFAULT 1
) RETURNS VOID AS $$
BEGIN
    INSERT INTO product_events (product_id, event_type, event_date, count)
    VALUES (p_product_id, p_event_type, CURRENT_DATE, p_count)
    ON CONFLICT (product_id, event_type, event_date)
    DO UPDATE SET count = product_events.count + p_count;
END;
$$ LANGUAGE plpgsql;

-- Function to update product stats
CREATE OR REPLACE FUNCTION refresh_product_stats()
RETURNS VOID AS $$
BEGIN
    INSERT INTO product_stats (
        product_id,
        order_count_30d,
        add_to_cart_count_30d,
        view_count_30d,
        best_selling_score,
        trending_score,
        last_computed_at
    )
    SELECT 
        p.product_id,
        COALESCE(SUM(CASE WHEN pe.event_type = 'purchase' AND pe.event_date > NOW() - INTERVAL '30 days' THEN pe.count ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pe.event_type = 'add_to_cart' AND pe.event_date > NOW() - INTERVAL '30 days' THEN pe.count ELSE 0 END), 0),
        COALESCE(SUM(CASE WHEN pe.event_type = 'view' AND pe.event_date > NOW() - INTERVAL '30 days' THEN pe.count ELSE 0 END), 0),
        compute_best_selling_score(
            COALESCE(SUM(CASE WHEN pe.event_type = 'purchase' AND pe.event_date > NOW() - INTERVAL '30 days' THEN pe.count ELSE 0 END), 0)::INTEGER,
            COALESCE(SUM(CASE WHEN pe.event_type = 'add_to_cart' AND pe.event_date > NOW() - INTERVAL '30 days' THEN pe.count ELSE 0 END), 0)::INTEGER,
            COALESCE(SUM(CASE WHEN pe.event_type = 'view' AND pe.event_date > NOW() - INTERVAL '30 days' THEN pe.count ELSE 0 END), 0)::INTEGER
        ),
        -- Trending score with time decay (simplified)
        COALESCE(SUM(
            CASE pe.event_type
                WHEN 'purchase' THEN pe.count * 10
                WHEN 'add_to_cart' THEN pe.count * 5
                WHEN 'view' THEN pe.count * 2
                ELSE 0
            END * EXP(-0.1 * EXTRACT(DAY FROM NOW() - pe.event_date))
        ), 0),
        NOW()
    FROM products p
    LEFT JOIN product_events pe ON p.product_id = pe.product_id
    GROUP BY p.product_id
    ON CONFLICT (product_id) 
    DO UPDATE SET
        order_count_30d = EXCLUDED.order_count_30d,
        add_to_cart_count_30d = EXCLUDED.add_to_cart_count_30d,
        view_count_30d = EXCLUDED.view_count_30d,
        best_selling_score = EXCLUDED.best_selling_score,
        trending_score = EXCLUDED.trending_score,
        last_computed_at = NOW();
END;
$$ LANGUAGE plpgsql;

COMMIT;
