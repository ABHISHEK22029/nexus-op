// Test Supabase via REST API (HTTPS - works on any network)
const ref = 'bhbtqimqahymkukhgxqs';

// Test if the project is alive via the REST API endpoint
fetch(`https://${ref}.supabase.co/rest/v1/`, {
  headers: {
    'apikey': 'test',  // will fail auth but should give us a response if the project exists
  }
}).then(r => {
  console.log(`Status: ${r.status}`);
  return r.text();
}).then(t => {
  console.log(`Response: ${t.substring(0, 200)}`);
  console.log('✅ Project is alive and reachable via HTTPS!');
}).catch(e => {
  console.log(`❌ Failed: ${e.message}`);
});
