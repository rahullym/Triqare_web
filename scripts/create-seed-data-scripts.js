#!/usr/bin/env node
/**
 * Create SQL Export Scripts from Existing Database
 * 
 * This script connects to your existing Supabase database and creates
 * SQL INSERT scripts for master data that should be seeded into the new database.
 * 
 * Exports:
 * - countries
 * - states
 * - cities
 * - pincodes
 * - hospitals
 * - configurations
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables from .env.local
function loadEnvFile() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) {
    console.error('❌ Error: .env.local file not found');
    process.exit(1);
  }
  
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars = {};
  
  envContent.split('\n').forEach(line => {
    const match = line.match(/^([^=]+)=(.+)$/);
    if (match) {
      envVars[match[1].trim()] = match[2].trim();
    }
  });
  
  return envVars;
}

const env = loadEnvFile();
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Error: Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Create migrations/04_seed directory
const seedPath = path.join(__dirname, '..', 'migrations', '04_seed');
if (!fs.existsSync(seedPath)) {
  fs.mkdirSync(seedPath, { recursive: true });
  console.log('✅ Created directory:', seedPath);
}

console.log('🗄️  Creating SQL Export Scripts...');
console.log('====================================\n');

// Helper function to escape SQL strings
function escapeSQLString(str) {
  if (str === null || str === undefined) return 'NULL';
  return `'${String(str).replace(/'/g, "''")}'`;
}

// Helper function to format SQL value
function formatSQLValue(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
  if (typeof value === 'number') return value;
  if (typeof value === 'object') return escapeSQLString(JSON.stringify(value));
  return escapeSQLString(value);
}

// Export table data to SQL file
async function exportTableToSQL(tableName, orderBy = 'created_at') {
  console.log(`📊 Exporting ${tableName}...`);
  
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .order(orderBy, { ascending: true });

  if (error) {
    console.log(`   ⚠️  Error: ${error.message}`);
    return null;
  }

  if (!data || data.length === 0) {
    console.log(`   ⚠️  No data found in ${tableName}`);
    return null;
  }

  // Get column names from first row
  const columns = Object.keys(data[0]);
  
  // Build SQL INSERT statements
  let sql = `-- =============================================\n`;
  sql += `-- SEED DATA: ${tableName.toUpperCase()}\n`;
  sql += `-- =============================================\n`;
  sql += `-- Auto-generated from existing database\n`;
  sql += `-- Date: ${new Date().toISOString()}\n`;
  sql += `-- Total rows: ${data.length}\n\n`;
  
  sql += `-- Clear existing data (optional - comment out if you want to preserve existing data)\n`;
  sql += `-- TRUNCATE TABLE public.${tableName} CASCADE;\n\n`;
  
  sql += `-- Insert data\n`;
  sql += `INSERT INTO public.${tableName} (\n`;
  sql += `    ${columns.join(',\n    ')}\n`;
  sql += `) VALUES\n`;

  // Add each row
  const rows = data.map((row, index) => {
    const values = columns.map(col => formatSQLValue(row[col]));
    const isLast = index === data.length - 1;
    return `    (${values.join(', ')})${isLast ? ';' : ','}`;
  });

  sql += rows.join('\n');
  sql += `\n\n`;
  sql += `SELECT '✅ Inserted ${data.length} rows into ${tableName}' as status;\n`;

  const fileName = path.join(seedPath, `seed_${tableName}.sql`);
  fs.writeFileSync(fileName, sql);
  
  console.log(`   ✅ Exported ${data.length} rows → ${fileName}`);
  return data.length;
}

// Export all master data tables
async function exportAllMasterData() {
  try {
    const stats = {
      total: 0,
      tables: {}
    };

    // Export tables in dependency order
    console.log('📥 Exporting master data tables...\n');

    // Level 0: No dependencies
    stats.tables.countries = await exportTableToSQL('countries', 'name');
    stats.tables.configurations = await exportTableToSQL('configurations', 'key');

    // Level 1: Depends on countries
    stats.tables.states = await exportTableToSQL('states', 'name');

    // Level 2: Depends on states
    stats.tables.cities = await exportTableToSQL('cities', 'name');

    // Level 3: Depends on cities
    stats.tables.pincodes = await exportTableToSQL('pincodes', 'code');

    // Level 3: Hospitals (complex dependencies)
    stats.tables.hospitals = await exportTableToSQL('hospitals', 'name');

    console.log('\n====================================');
    console.log('✅ Export completed successfully!\n');

    // Calculate totals
    Object.values(stats.tables).forEach(count => {
      if (count) stats.total += count;
    });

    console.log('📊 Summary:');
    console.log(`   Countries: ${stats.tables.countries || 0} rows`);
    console.log(`   States: ${stats.tables.states || 0} rows`);
    console.log(`   Cities: ${stats.tables.cities || 0} rows`);
    console.log(`   Pincodes: ${stats.tables.pincodes || 0} rows`);
    console.log(`   Hospitals: ${stats.tables.hospitals || 0} rows`);
    console.log(`   Configurations: ${stats.tables.configurations || 0} rows`);
    console.log(`   ---`);
    console.log(`   TOTAL: ${stats.total} rows exported\n`);

    console.log(`📁 Files created in: migrations/04_seed/\n`);

  } catch (error) {
    console.error('\n❌ Error during export:', error.message);
    process.exit(1);
  }
}

// Run export
exportAllMasterData();

