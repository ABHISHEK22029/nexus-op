#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Adding a product from the catalogue screen.

   The screen could publish, hide and edit — but not create. Its empty
   state told you to go to Stock → Products first, which is a description
   of a gap rather than a workflow: somebody setting up a catalogue is
   thinking about what they sell, not about which screen owns the SKU
   table.

   This starts from a business with no products at all, which is the state
   every new organisation is in, and follows it through to a stranger
   seeing the thing on the public page.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');
const path = require('path');

const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
if (/^https:|onrender.com|vercel.app/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const stamp=Date.now().toString(36);
let pass=0,fail=0; const ok=(c,m)=>{c?pass++:fail++;console.log(`   ${c?'✅':'❌'} ${m}`);};
(async()=>{
 const reg=await(await fetch(`${API}/auth/register`,{method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({name:'O',email:`add-${stamp}@example.test`,password:'testpassword123'})})).json();
 const auth={Authorization:`Bearer ${reg.token}`,'Content-Type':'application/json'};
 await fetch(`${API}/company-profile`,{method:'PUT',headers:auth,body:JSON.stringify({name:`Kirashi ${stamp}`,setup_completed_at:new Date().toISOString()})});
 await fetch(`${API}/catalogue/settings`,{method:'PUT',headers:auth,body:JSON.stringify({slug:`add-${stamp}`,headline:'What we make',is_published:true})});

 const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
 const p=await b.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.setViewport({width:1400,height:1000});
 await p.goto(`${UI}/login`,{waitUntil:'domcontentloaded'});
 await p.evaluate(t=>localStorage.setItem('nexus_token',t),reg.token);
 await p.goto(`${UI}/catalogue`,{waitUntil:'networkidle2'}); await sleep(2200);

 console.log('\n  ── a business with no products at all');
 ok(await p.evaluate(()=>/Add your first product/i.test(document.body.innerText)),
   'the empty state offers to add one, instead of sending you elsewhere');

 await p.evaluate(()=>[...document.querySelectorAll('button')].find(b=>/Add your first product/i.test(b.innerText))?.click());
 await sleep(1200);
 ok(await p.evaluate(()=>/Add a product/i.test(document.body.innerText)),'the add form opens');

 const NAME=`11 KV V cross arm ${stamp}`;
 await p.evaluate((n)=>{
  const dlg=document.querySelector('[role="dialog"]');
  const set=(el,v)=>{Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype,'value').set.call(el,v);
    el.dispatchEvent(new Event('input',{bubbles:true}));};
  set(dlg.querySelector('[placeholder="11 KV V cross arm 75 × 40 × 6"]'),n);
  set(dlg.querySelector('[placeholder="VC-01"]'),'VC-01');
  set(dlg.querySelector('[placeholder="833"]'),'833');
 },NAME);
 await sleep(400);
 await p.evaluate(()=>{const dlg=document.querySelector('[role="dialog"]');
   [...dlg.querySelectorAll('button')].find(b=>/Add and continue/i.test(b.innerText))?.click();});
 await sleep(2400);

 ok(await p.evaluate(()=>/On your catalogue this reads|Photographs/i.test(document.body.innerText)),
   'it creates the product and drops straight into its editor');

 const list=await(await fetch(`${API}/catalogue/products`,{headers:auth})).json();
 const made=list.find(x=>x.name===NAME);
 ok(!!made,`the product exists on the server → ${made?.sku_code}`);
 ok(made?.price==833,`with the rate that was typed → ₹${made?.price}`);
 ok(made?.is_published===false,'and is NOT published yet — nothing goes public by accident');

 // publish + save from the editor
 await p.evaluate(()=>{const dlg=document.querySelector('[role="dialog"]');
   [...dlg.querySelectorAll('button')].find(b=>/Hidden/i.test(b.innerText))?.click();});
 await sleep(1600);
 await p.evaluate(()=>{const dlg=document.querySelector('[role="dialog"]');
   [...dlg.querySelectorAll('button')].find(b=>/^Save$/.test(b.innerText.trim()))?.click();});
 await sleep(2200);

 const pub=await(await fetch(`${API}/public/catalogue/add-${stamp}`)).json();
 ok((pub.products||[]).some(x=>x.name===NAME),
   `and a visitor now sees it on the public page (${(pub.products||[]).length} listed)`);
 ok(errs.length===0,`no JavaScript errors${errs.length?': '+errs[0].slice(0,80):''}`);
 await b.close();

 const base = path.join(__dirname, '..', '..', 'backend');
 require(path.join(base, 'node_modules', 'dotenv')).config({ path: path.join(base, '.env') });
 const { Client } = require(path.join(base, 'node_modules', 'pg'));
 const c=new Client({connectionString:process.env.DATABASE_URL,ssl:{rejectUnauthorized:false}});
 await c.connect();
 for(const t of ['catalogue_photos','catalogue_settings','skus','company_profile'])
   await c.query(`DELETE FROM ${t} WHERE owner_id=$1`,[reg.user.id]).catch(()=>{});
 await c.query('DELETE FROM users WHERE id=$1',[reg.user.id]).catch(()=>{});
 await c.end();
 console.log(`\n  ${pass} passed, ${fail} failed\n`);
})();
