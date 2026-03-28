#!/usr/bin/env node
/**
 * Export Database Table Information
 * 
 * This script connects to your existing Supabase database and exports:
 * - List of all tables
 * - Table structures (columns, types)
 * - Row counts
 * - Sample data
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

// Create sourcedb directory
const sourceDbPath = 'sourcedb';
if (!fs.existsSync(sourceDbPath)) {
  fs.mkdirSync(sourceDbPath, { recursive: true });
  console.log('✅ Created directory:', sourceDbPath);
}

const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);

console.log('🗄️  Exporting Database Information...');
console.log('=====================================\n');

async function getTableList() {
  console.log('📋 Fetching table list...');
  
  const { data, error } = await supabase.rpc('exec_sql', {
    sql: `
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `
  });

  if (error) {
    // Fallback: Use known tables from the codebase
    console.log('⚠️  RPC not available, using known tables from codebase');
    return [
      'users', 'countries', 'states', 'cities', 'pincodes',
      'hospitals', 'patients', 'transport_companies', 'drivers',
      'emergency_contacts', 'sos_requests', 'sos_request_assigned',
      'subscription_plans', 'patient_subscriptions', 'billing_history',
      'configurations', 'announcements', 'notifications', 'pending_csv_imports'
    ];
  }

  return data.map(row => row.table_name);
}

async function getTableStructure(tableName) {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .limit(0);

  if (error) {
    console.log(`   ⚠️  Could not access ${tableName}: ${error.message}`);
    return null;
  }

  // Get row count
  const { count, error: countError } = await supabase
    .from(tableName)
    .select('*', { count: 'exact', head: true });

  return {
    name: tableName,
    rowCount: countError ? 0 : count
  };
}

async function getSampleData(tableName, limit = 5) {
  const { data, error } = await supabase
    .from(tableName)
    .select('*')
    .limit(limit);

  if (error) {
    return [];
  }

  return data;
}

async function exportDatabase() {
  try {
    const tables = await getTableList();
    
    console.log(`✅ Found ${tables.length} tables\n`);

    const report = {
      exportDate: new Date().toISOString(),
      supabaseUrl: supabaseUrl,
      totalTables: tables.length,
      tables: []
    };

    // Create detailed report
    let markdownReport = `# Database Export Report\n\n`;
    markdownReport += `**Export Date**: ${new Date().toLocaleString()}\n`;
    markdownReport += `**Supabase URL**: ${supabaseUrl}\n`;
    markdownReport += `**Total Tables**: ${tables.length}\n\n`;
    markdownReport += `---\n\n`;
    markdownReport += `## Tables\n\n`;

    for (const tableName of tables) {
      process.stdout.write(`📊 Analyzing ${tableName}...`);
      
      const tableInfo = await getTableStructure(tableName);
      
      if (tableInfo) {
        report.tables.push(tableInfo);
        
        markdownReport += `### ${tableName}\n\n`;
        markdownReport += `- **Row Count**: ${tableInfo.rowCount}\n`;
        
        // Get sample data
        const sampleData = await getSampleData(tableName, 3);
        if (sampleData.length > 0) {
          markdownReport += `- **Columns**: ${Object.keys(sampleData[0]).join(', ')}\n`;
          markdownReport += `\n**Sample Data** (first ${sampleData.length} rows):\n\n`;
          markdownReport += '```json\n';
          markdownReport += JSON.stringify(sampleData, null, 2);
          markdownReport += '\n```\n\n';
        }
        
        markdownReport += `---\n\n`;
        
        console.log(` ✅ (${tableInfo.rowCount} rows)`);
      } else {
        console.log(` ⚠️  (no access)`);
      }
    }

    // Save JSON report
    const jsonFile = path.join(sourceDbPath, `database_info_${timestamp}.json`);
    fs.writeFileSync(jsonFile, JSON.stringify(report, null, 2));
    console.log(`\n✅ JSON report saved: ${jsonFile}`);

    // Save Markdown report
    const mdFile = path.join(sourceDbPath, `database_report_${timestamp}.md`);
    fs.writeFileSync(mdFile, markdownReport);
    console.log(`✅ Markdown report saved: ${mdFile}`);

    // Save simple table list
    const tableListFile = path.join(sourceDbPath, `table_list_${timestamp}.txt`);
    fs.writeFileSync(tableListFile, tables.join('\n'));
    console.log(`✅ Table list saved: ${tableListFile}`);

    console.log('\n=====================================');
    console.log('✅ Export completed successfully!\n');
    
    console.log('📊 Summary:');
    console.log(`   Total tables: ${tables.length}`);
    console.log(`   Total rows: ${report.tables.reduce((sum, t) => sum + t.rowCount, 0)}`);
    console.log(`\n📁 Files created in ${sourceDbPath}/`);
    
  } catch (error) {
    console.error('\n❌ Error during export:', error.message);
    process.exit(1);
  }
}

// Run export
exportDatabase();

