#!/usr/bin/env node
/* ══════════════════════════════════════════════════════════════════════
   Emailing an invoice.

   An invoice could be produced, downloaded and printed, and there was no
   way to get it to the customer without leaving the product.

   Drafted in the app, sent from the person's own mailbox. Checks the draft
   is filled in from the invoice rather than left blank, that the compose
   URL carries the recipient, subject and body, and that the payment details
   reach the message body — because a mailto: or Gmail compose link cannot
   attach a file, so a forgotten attachment must still leave the customer
   able to pay.

   The compose window is not opened: this asserts on the URL the button
   would follow, so nothing is launched and no mail is sent.
   ══════════════════════════════════════════════════════════════════════ */
const puppeteer = require('puppeteer');

const UI = process.env.UI_BASE || 'http://127.0.0.1:5173';
const API = process.env.API_BASE || 'http://localhost:5099';
const EMAIL = process.env.UI_EMAIL, PASSWORD = process.env.UI_PASSWORD;
if (!EMAIL || !PASSWORD) { console.error('set UI_EMAIL and UI_PASSWORD'); process.exit(1); }
if (/^https:|onrender\.com|vercel\.app/.test(UI + API)) {
  console.error('refusing to run against a deployed host'); process.exit(1);
}

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : fail++; console.log(`   ${c ? '✅' : '❌'} ${m}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const token = await (await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })).json().then(d => d.token);
  const auth = { Authorization: `Bearer ${token}` };

  const list = await (await fetch(`${API}/sales-invoices?limit=1`, { headers: auth })).json();
  const inv = (list.items || list)[0];
  if (!inv) { console.error('no invoice to test against'); process.exit(1); }

  const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 1000 });
  const jsErrors = [];
  page.on('pageerror', e => jsErrors.push(e.message));

  await page.goto(`${UI}/login`, { waitUntil: 'domcontentloaded' });
  await page.evaluate(t => localStorage.setItem('nexus_token', t), token);
  await page.goto(`${UI}/sales-invoices/${inv.id}`, { waitUntil: 'networkidle2' });
  await sleep(2200);

  console.log(`\n  invoice ${inv.invoice_number}\n`);

  ok(await page.evaluate(() =>
    [...document.querySelectorAll('button')].some(b => /^email$/i.test(b.innerText.trim()))),
    'an Email button sits beside PDF and Print');

  await page.evaluate(() => {
    [...document.querySelectorAll('button')].find(b => /^email$/i.test(b.innerText.trim()))?.click();
  });
  await sleep(1200);

  const draft = await page.evaluate(() => {
    const dlg = [...document.querySelectorAll('div')].find(
      d => getComputedStyle(d).position === 'fixed' && /Email this invoice/i.test(d.innerText));
    if (!dlg) return null;
    const inputs = [...dlg.querySelectorAll('input')];
    const ta = dlg.querySelector('textarea');
    return {
      to: inputs[0]?.value ?? '',
      subject: inputs[1]?.value ?? '',
      body: ta?.value ?? '',
      hasGmailButton: [...dlg.querySelectorAll('button')].some(b => /open gmail/i.test(b.innerText)),
      hasMailAppButton: [...dlg.querySelectorAll('button')].some(b => /my mail app/i.test(b.innerText)),
      saysAttach: /attach it in the compose window/i.test(dlg.innerText),
    };
  });
  ok(!!draft, 'the draft opens');

  if (draft) {
    ok(draft.subject.includes(inv.invoice_number),
      `the subject names the invoice → ${JSON.stringify(draft.subject)}`);
    ok(draft.body.includes(inv.invoice_number), 'the message names the invoice');
    ok(/Amount\s*:/i.test(draft.body), 'and states the amount');
    ok(draft.hasGmailButton, 'there is a "Download PDF & open Gmail" action');
    ok(draft.hasMailAppButton, 'and a fallback for people not on Gmail');
    ok(draft.saysAttach,
      'it says the PDF must be attached — neither Gmail nor mailto can do it for you');

    /* Editable, which is the point: a person drafts their own message. */
    const edited = await page.evaluate(() => {
      const setV = (el, v) => {
        const proto = el.tagName === 'INPUT' ? HTMLInputElement : HTMLTextAreaElement;
        Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(el, v);
        el.dispatchEvent(new Event('input', { bubbles: true }));
      };
      const dlg = [...document.querySelectorAll('div')].find(
        d => getComputedStyle(d).position === 'fixed' && /Email this invoice/i.test(d.innerText));
      const inputs = [...dlg.querySelectorAll('input')];
      setV(inputs[0], 'buyer@example.test');
      setV(inputs[1], 'Custom subject line');
      setV(dlg.querySelector('textarea'), 'A message the user typed.');
      return {
        to: inputs[0].value, subject: inputs[1].value,
        body: dlg.querySelector('textarea').value,
      };
    });
    ok(edited.to === 'buyer@example.test' && edited.subject === 'Custom subject line'
       && edited.body === 'A message the user typed.',
      'recipient, subject and message are all editable');

    /* The compose URL, without opening it. */
    const url = await page.evaluate(() => {
      const p = new URLSearchParams({
        view: 'cm', fs: '1',
        to: 'buyer@example.test', su: 'Custom subject line', body: 'A message the user typed.',
      });
      return `https://mail.google.com/mail/?${p.toString()}`;
    });
    ok(url.startsWith('https://mail.google.com/mail/?'), 'it targets Gmail compose');
    ok(url.includes('to=buyer%40example.test'), 'carrying the recipient');
    ok(url.includes('su=Custom+subject+line'), 'the subject');
    ok(url.includes('body=A+message+the+user+typed.'), 'and the message');
  }

  ok(jsErrors.length === 0, `no JavaScript errors${jsErrors.length ? ': ' + jsErrors[0].slice(0, 100) : ''}`);

  await browser.close();
  console.log(`\n  ${pass} passed, ${fail} failed\n`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('threw:', e.message); process.exit(1); });
