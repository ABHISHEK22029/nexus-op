import { moduleForPath, resourceForPath, isAdminOnlyPath, MODULES, visibleItems } from '../src/lib/navigation.js';
let fail = 0;
const t = (desc, got, want) => {
  const ok = got === want; if (!ok) fail++;
  console.log((ok ? '  ✅ ' : '  ❌ ') + desc + (ok ? '' : `  got ${got}, wanted ${want}`));
};
console.log('── every path lands in the right module ──');
t('/customers            -> sales',      moduleForPath('/customers'), 'sales');
t('/customers/18         -> sales',      moduleForPath('/customers/18'), 'sales');
t('/sales-invoices/4     -> sales',      moduleForPath('/sales-invoices/4'), 'sales');
t('/vendors              -> purchases',  moduleForPath('/vendors'), 'purchases');
t('/vendors/3/edit       -> purchases',  moduleForPath('/vendors/3/edit'), 'purchases');
t('/purchase-orders      -> purchases',  moduleForPath('/purchase-orders'), 'purchases');
t('/grn                  -> purchases',  moduleForPath('/grn'), 'purchases');
t('/inventory            -> stock',      moduleForPath('/inventory'), 'stock');
t('/items                -> stock',      moduleForPath('/items'), 'stock');
t('/skus                 -> stock',      moduleForPath('/skus'), 'stock');
t('/production           -> production', moduleForPath('/production'), 'production');
t('/mb                   -> production', moduleForPath('/mb'), 'production');
/* 26 Nov: Configure folded back into Settings (its Admin group); Marketing
   into Sales; money in and out into Money; the Knowledge base into Help. */
t('/configurator         -> settings',   moduleForPath('/configurator'), 'settings');
t('/configurator/roles   -> settings',   moduleForPath('/configurator/roles'), 'settings');
t('/enquiries            -> sales',      moduleForPath('/enquiries'), 'sales');
t('/catalogue            -> sales',      moduleForPath('/catalogue'), 'sales');
t('/receivables          -> money',      moduleForPath('/receivables'), 'money');
t('/payables             -> money',      moduleForPath('/payables'), 'money');
t('/grn-bills/7          -> money',      moduleForPath('/grn-bills/7'), 'money');
t('/knowledge            -> help',       moduleForPath('/knowledge'), 'help');
t('/receivables  -> sales-invoices',     resourceForPath('/receivables'), 'sales-invoices');
t('rail has no Marketing or Configure',  MODULES.some(m => m.key === 'marketing' || m.key === 'configurator'), false);
t('Help sits at the foot of the rail',   MODULES.find(m => m.key === 'help')?.bottom, true);
t('/dashboard            -> home',       moduleForPath('/dashboard'), 'home');
t('unknown path          -> home',       moduleForPath('/nonsense'), 'home');
console.log('');
console.log('── permissions still resolve (guard reads the same map) ──');
t('/customers      -> customers',        resourceForPath('/customers'), 'customers');
t('/customers/18   -> customers',        resourceForPath('/customers/18'), 'customers');
t('/purchase-orders-> po',               resourceForPath('/purchase-orders'), 'po');
t('/items          -> skus',             resourceForPath('/items'), 'skus');
t('/vendor-supplies-> vendor-items',     resourceForPath('/vendor-supplies'), 'vendor-items');
t('/dashboard      -> null (ungated)',   resourceForPath('/dashboard'), null);
t('/configurator   is admin-only',       isAdminOnlyPath('/configurator'), true);
console.log('');
console.log('── a restricted role sees fewer modules, not broken ones ──');
const salesCan = (r) => ['customers','sales-quotations','customer-orders','delivery-challans','sales-invoices','inventory','production'].includes(r);
for (const m of MODULES) {
  const n = visibleItems(m.key, salesCan, 'Sales').length;
  console.log(`  ${m.key.padEnd(11)} ${n} screen(s) for a Sales user`);
}
console.log('');
console.log(fail ? `❌ ${fail} failed` : '✅ all navigation checks passed');
process.exit(fail ? 1 : 0);
