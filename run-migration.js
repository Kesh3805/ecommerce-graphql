const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log('✓ Connected to database');

    // Check existing tables
    const tablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    console.log('\nExisting tables:');
    tablesResult.rows.forEach(row => console.log('  -', row.table_name));

    // Read migration file
    const migrationPath = path.join(__dirname, 'prisma', 'migrations', 'merchandising_migration.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');

    console.log('\n🔄 Running merchandising migration...');
    await client.query(migrationSQL);
    console.log('✓ Migration completed successfully');

    // Check new tables
    const newTablesResult = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_name IN ('Collection', 'CollectionProduct', 'CollectionRule', 'ProductStats', 'ProductEvent', 'ProductRelationship', 'ProductCopurchase', 'StorefrontPage', 'PageSection', 'HeroBanner', 'SectionCollection', 'SectionCategory')
      ORDER BY table_name
    `);
    
    console.log('\nNewly created merchandising tables:');
    newTablesResult.rows.forEach(row => console.log('  ✓', row.table_name));

    await client.end();
  } catch (error) {
    console.error('\n❌ Migration failed:', error.message);
    console.error(error);
    await client.end();
    process.exit(1);
  }
}

runMigration();
