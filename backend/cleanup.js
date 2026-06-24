require('dotenv').config();
const { Client } = require('pg');
const client = new Client({
  connectionString: process.env.DATABASE_URL,
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
