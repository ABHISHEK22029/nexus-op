const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.bhbtqimqahymkukhgxqs:NexusOp%402026%21@aws-1-ap-south-1.pooler.supabase.com:5432/postgres',
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
      ADD COLUMN IF NOT EXISTS "loadingScope" TEXT DEFAULT 'Kirashi Scope', 
      ADD COLUMN IF NOT EXISTS "warranty" TEXT DEFAULT '12 months', 
      ADD COLUMN IF NOT EXISTS "amountInWords" TEXT, 
      ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMPTZ DEFAULT NOW()`);
    console.log('POs altered');
  } catch(e) { console.error('pos: ', e.message); }

  await client.end();
}

run().catch(console.error);
