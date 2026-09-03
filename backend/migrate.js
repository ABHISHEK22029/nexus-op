require('dotenv').config();
const { Client } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error('✖ DATABASE_URL is not set. Create backend/.env with DATABASE_URL=postgresql://… before running migrations.');
  process.exit(1);
}

const client = new Client({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  
  try {
    await client.query(`ALTER TABLE vendors 
      ADD COLUMN IF NOT EXISTS address TEXT, 
      ADD COLUMN IF NOT EXISTS "contactName" TEXT, 
      ADD COLUMN IF NOT EXISTS "contactPhone" TEXT, 
      ADD COLUMN IF NOT EXISTS "contactEmail" TEXT`);
    console.log('Vendors altered');
  } catch (e) { console.error('vendors: ', e.message); }
  
  try {
    await client.query(`ALTER TABLE purchase_orders 
      ADD COLUMN IF NOT EXISTS "unitPrice" REAL, 
      ADD COLUMN IF NOT EXISTS "poNumber" TEXT, 
      ADD COLUMN IF NOT EXISTS "quoteRef" TEXT, 
      ADD COLUMN IF NOT EXISTS "paymentTerms" TEXT, 
      ADD COLUMN IF NOT EXISTS "priceBasis" TEXT DEFAULT 'Ex Works', 
      ADD COLUMN IF NOT EXISTS "pnfInsurance" TEXT DEFAULT 'Vendor Scope', 
      ADD COLUMN IF NOT EXISTS "loadingScope" TEXT DEFAULT 'Buyer Scope', 
      ADD COLUMN IF NOT EXISTS "warranty" TEXT DEFAULT '12 months', 
      ADD COLUMN IF NOT EXISTS "amountInWords" TEXT, 
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW()`);
    console.log('POs altered');
  } catch(e) { console.error('pos: ', e.message); }

  await client.end();
}

run().catch(console.error);
