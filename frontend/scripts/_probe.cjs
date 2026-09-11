const puppeteer=require('puppeteer');
const UI='http://127.0.0.1:5173',API='http://localhost:5099';
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const l=await(await fetch(`${API}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({email:process.env.UI_EMAIL,password:process.env.UI_PASSWORD})})).json();
 const b=await puppeteer.launch({headless:'new',args:['--no-sandbox']});
 const p=await b.newPage(); await p.setViewport({width:1600,height:1000});
 await p.goto(`${UI}/login`,{waitUntil:'domcontentloaded'});
 await p.evaluate(t=>localStorage.setItem('nexus_token',t),l.token);
 await p.goto(`${UI}/vendors/new`,{waitUntil:'networkidle2'}); await sleep(2000);
 const info=await p.evaluate(()=>({
   heading:(document.querySelector('h1,h2')||{}).innerText,
   tabs:[...document.querySelectorAll('button')].map(b=>b.innerText.trim().replace(/\s+/g,' ')).filter(t=>t&&t.length<28).slice(0,12),
   inputs:[...document.querySelectorAll('input')].map(i=>i.placeholder||i.name||i.type).slice(0,14),
   body:document.body.innerText.slice(0,180).replace(/\s+/g,' '),
 }));
 console.log('  heading:',info.heading);
 console.log('  buttons:',info.tabs.join(' | '));
 console.log('  inputs :',info.inputs.join(' | '));
 console.log('  page   :',info.body);
 await b.close();
})();
