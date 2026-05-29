/**
 * migrate_sqlite_to_postgres.js
 * One-time script: copies all existing SQLite data to PostgreSQL
 *
 * Usage:
 *   npm install better-sqlite3 pg
 *   node db/migrate_sqlite_to_postgres.js
 */

const Database = require('better-sqlite3');
const { Pool }  = require('pg');
const path      = require('path');

const SQLITE_PATH = path.resolve(__dirname, '../backend/database.sqlite');
const PG_CONFIG   = {
  host:     'localhost',
  port:     5432,
  database: 'nexusop',
  user:     'nexusop_admin',
  password: 'dev_password',
};

// Maps SQLite table name → PostgreSQL table name (+ column renames if needed)
const TABLE_MAP = [
  { sqlite: 'projects',        pg: 'projects',        idCol: 'id' },
  { sqlite: 'vendors',         pg: 'vendors',         idCol: 'id' },
  { sqlite: 'work_orders',     pg: 'work_orders',     idCol: 'id' },
  { sqlite: 'milestones',      pg: 'milestones',      idCol: 'id' },
  { sqlite: 'boq_items',       pg: 'boq_items',       idCol: 'id' },
  { sqlite: 'indents',         pg: 'indents',         idCol: 'id' },
  { sqlite: 'purchase_orders', pg: 'purchase_orders', idCol: 'id' },
  { sqlite: 'grn',             pg: 'grn',             idCol: 'id' },
  { sqlite: 'measurement_book',pg: 'mb_entries',      idCol: 'id' },
  { sqlite: 'bills',           pg: 'bills',           idCol: 'id' },
  { sqlite: 'inventory',       pg: 'inventory',       idCol: 'id' },
  { sqlite: 'activities',      pg: 'activities',      idCol: 'id' },
];

async function migrate() {
  console.log('🚀 Starting SQLite → PostgreSQL migration...\n');
  console.log(`SQLite source: ${SQLITE_PATH}`);
  console.log(`PostgreSQL target: ${PG_CONFIG.host}:${PG_CONFIG.port}/${PG_CONFIG.database}\n`);

  let sqlite, pg;
  try {
    sqlite = new Database(SQLITE_PATH, { readonly: true });
    pg = new Pool(PG_CONFIG);
    await pg.query('SELECT 1'); // verify connection
    console.log('✅ Connected to both databases\n');
  } catch (err) {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  }

  let totalRows = 0;

  for (const { sqlite: sqliteTable, pg: pgTable } of TABLE_MAP) {
    try {
      // Check if SQLite table exists
      const tableExists = sqlite.prepare(
        `SELECT name FROM sqlite_master WHERE type='table' AND name=?`
      ).get(sqliteTable);

      if (!tableExists) {
        console.log(`⏭  ${sqliteTable} → not found in SQLite, skipping`);
        continue;
      }

      const rows = sqlite.prepare(`SELECT * FROM ${sqliteTable}`).all();

      if (rows.length === 0) {
        console.log(`⏭  ${sqliteTable} → empty, skipping`);
        continue;
      }

      // Get PostgreSQL columns for target table
      const pgCols = await pg.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = $1 AND table_schema = 'public'
         ORDER BY ordinal_position`,
        [pgTable]
      );
      const pgColumnSet = new Set(pgCols.rows.map(r => r.column_name));

      let inserted = 0;
      let skipped  = 0;

      for (const row of rows) {
        // Filter only columns that exist in PostgreSQL
        const filteredRow = {};
        for (const [col, val] of Object.entries(row)) {
          if (pgColumnSet.has(col)) {
            filteredRow[col] = val;
          }
        }

        if (Object.keys(filteredRow).length === 0) continue;

        const cols    = Object.keys(filteredRow);
        const vals    = Object.values(filteredRow);
        const placeholders = cols.map((_, i) => `$${i + 1}`).join(', ');
        const colStr  = cols.map(c => `"${c}"`).join(', ');

        try {
          await pg.query(
            `INSERT INTO ${pgTable} (${colStr}) VALUES (${placeholders}) ON CONFLICT (id) DO NOTHING`,
            vals
          );
          inserted++;
        } catch (err) {
          console.warn(`  ⚠ Row ${row.id} skipped: ${err.message.split('\n')[0]}`);
          skipped++;
        }
      }

      // Reset PostgreSQL sequence so new inserts don't conflict
      await pg.query(
        `SELECT setval(pg_get_serial_sequence('${pgTable}', 'id'),
         COALESCE((SELECT MAX(id) FROM ${pgTable}), 0) + 1, false)`
      );

      console.log(`✅ ${sqliteTable} → ${pgTable}: ${inserted} rows (${skipped} skipped)`);
      totalRows += inserted;

    } catch (err) {
      console.error(`❌ Error migrating ${sqliteTable}: ${err.message}`);
    }
  }

  sqlite.close();
  await pg.end();

  console.log(`\n🎉 Migration complete! ${totalRows} total rows migrated to PostgreSQL.`);
  console.log('\nNext steps:');
  console.log('  1. Open pgAdmin at http://localhost:5050 to verify data');
  console.log('  2. cd nexus-backend && ./mvnw spring-boot:run');
  console.log('  3. cd frontend && npm run dev');
}

migrate().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
