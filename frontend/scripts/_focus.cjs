const puppeteer=require('puppeteer');
const UI='http://127.0.0.1:5173',API='http://localhost:5099';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const l=await(await fetch(`${API}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email:process.env.UI_EMAIL,password:process.env.UI_PASSWORD})})).json();
 const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
 const p=await b.newPage(); await p.setViewport({width:1600,height:1000});
 const errs=[]; p.on('pageerror',e=>errs.push(e.message));
 await p.goto(`${UI}/login`,{waitUntil:'domcontentloaded'});
 await p.evaluate(t=>localStorage.setItem('nexus_token',t),l.token);
 await p.goto(`${UI}/vendors/new`,{waitUntil:'networkidle2'}); await sleep(1800);

 const probe = async (tabName, placeholder) => {
   // switch tab if needed
   if(tabName) { await p.evaluate(t=>[...document.querySelectorAll('button')]
       .find(x=>x.innerText.trim()===t)?.click(), tabName); await sleep(900); }
   const sel=`input[placeholder="${placeholder}"]`;
   const el=await p.$(sel);
   if(!el){ console.log(`   ${placeholder.padEnd(22)} field not found`); return; }
   await el.click();
   let lost=0, typed='';
   for(const ch of 'ABCDE'){
     await p.keyboard.type(ch);
     await sleep(180);
     const still=await p.evaluate(s=>document.activeElement===document.querySelector(s),sel);
     const val=await p.evaluate(s=>document.querySelector(s)?.value,sel);
     typed=val;
     if(!still){ lost++; await el.click(); }   // refocus like a user would
   }
   console.log(`   ${placeholder.padEnd(22)} typed "ABCDE" → value "${typed}"  focus lost ${lost}/5 times ${lost?'❌':'✅'}`);
 };
 console.log('\n  ── typing five characters into each field ──');
 await probe(null,'AAAAA0000A');            // PAN, tab 1
 await probe('Tax & Compliance','AAAAA0000A');
 await probe('Banking','State Bank of India');
 await probe('Banking','SBIN0001234');
 console.log(`\n  JS errors: ${errs.length?errs[0].slice(0,110):'none'}`);
 await b.close();
})();
