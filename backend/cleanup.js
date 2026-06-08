const { Client } = require('pg');
const client = new Client({
  connectionString: 'postgresql://postgres.bhbtqimqahymkukhgxqs:NexusOp%402026%21@aws-1-ap-south-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

async function run() {
  await client.connect();
  
  // Update any POs linked to duplicates
  await client.query('UPDATE purchase_orders SET "projectId" = 1 WHERE "projectId" = 7');
  await client.query('UPDATE vendors SET "projectId" = 1 WHERE "projectId" = 7');
  
  await client.query('UPDATE purchase_orders SET "projectId" = 2 WHERE "projectId" = 8');
  await client.query('UPDATE vendors SET "projectId" = 2 WHERE "projectId" = 8');
  
  // Delete the duplicates and empties
  await client.query('DELETE FROM projects WHERE id > 2');
  
  console.log('Cleanup successful');
  await client.end();
}

run().catch(console.error);
