#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
# Proves OUR chain, not Zoho's, on the link that was missing:
#
#   a customer orders 100 brackets
#     -> the BOM says each needs 12kg of plate  = 1,200kg required
#     -> we hold 200kg                          =   1,000kg short
#     -> the vendor's MOQ is 500kg              -> round up to 1,000kg
#     -> raise a PO on that vendor, grouped, priced
#
# Everything it creates is named ZZ-* and removed at the end.
# ══════════════════════════════════════════════════════════
set -u
B="${BASE_URL:-http://localhost:5099}"
: "${FLOW_ADMIN_EMAIL:?set FLOW_ADMIN_EMAIL}"
: "${FLOW_ADMIN_PASSWORD:?set FLOW_ADMIN_PASSWORD}"
case "$B" in *onrender.com*|*vercel.app*|https://*) echo "❌ refusing to run against a deployed host"; exit 1;; esac

pass=0; fail=0
ok(){ if [ "$2" = "$3" ]; then echo "  ✅ $1  ($2)"; pass=$((pass+1)); else echo "  ❌ $1  got $2, expected $3"; fail=$((fail+1)); fi }

T=$(curl -s -m 25 -X POST "$B/auth/login" -H 'Content-Type: application/json' \
     -d "{\"email\":\"$FLOW_ADMIN_EMAIL\",\"password\":\"$FLOW_ADMIN_PASSWORD\"}" \
     | node -pe "try{JSON.parse(require('fs').readFileSync(0,'utf8')).token||''}catch(e){''}")
[ -z "$T" ] && { echo "❌ no token"; exit 1; }
api(){ curl -s -m 25 -X "$1" "$B$2" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' ${3:+-d "$3"}; }
id_of(){ node -pe "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));String(d.id??'')}catch(e){''}"; }

echo "── setting the scene ──"
CUST=$(api GET "/customers" | node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));const a=Array.isArray(d)?d:d.items;String(a[0].id)")
VEND=$(api POST "/vendors" '{"name":"ZZ Steel Traders","type":"Material Supply"}' | id_of)
MAT=$(api POST "/raw-materials" '{"name":"ZZ MS Plate 10mm","base_uom":"kg","category":"Plate"}' | id_of)
# The generic CRUD factory only writes its declared columns, so base_uom may
# be dropped on create — which showed up downstream as a PO line reading
# "1000nos" for plate. Set it directly so the unit on the order is the unit
# the vendor actually sells in.
( cd "$(dirname "$0")/.." && node -e "
  const db=require('./db');
  (async()=>{ await db.query('UPDATE raw_materials SET base_uom=\$1, purchase_uom=\$1 WHERE id=\$2',['kg',$MAT]); process.exit(0);})()
    .catch(()=>process.exit(0));" ) > /dev/null 2>&1
SKU=$(api POST "/skus" '{"name":"ZZ Bracket","uom":"nos"}' | id_of)
echo "  customer=$CUST vendor=$VEND material=$MAT sku=$SKU"

# BOM: one bracket needs 12 kg of plate.
# Columns are component_name / qty_per_unit — not name / quantity. The first
# version guessed, redirected the error to /dev/null, and produced a test
# that reported "the engine can't see the shortfall" when the truth was
# "the BOM row was never created". Errors are surfaced now.
( cd "$(dirname "$0")/.." && node -e "
  const db=require('./db');
  (async()=>{
    await db.query(
      'INSERT INTO sku_bom (sku_id, raw_material_id, component_name, qty_per_unit, uom) VALUES (\$1,\$2,\$3,\$4,\$5)',
      [$SKU, $MAT, 'ZZ MS Plate 10mm', 12, 'kg']);
    process.exit(0);
  })().catch(e=>{ console.error('BOM insert failed:', e.message); process.exit(1); });" ) \
  || { echo '❌ could not create the BOM — aborting, the rest would prove nothing'; exit 1; }

# The vendor sells it: ₹65/kg, minimum 500 kg.
api POST "/vendor-items" "{\"vendor_id\":$VEND,\"raw_material_id\":$MAT,\"price\":65,\"price_uom\":\"kg\",\"moq\":500,\"lead_time_days\":7,\"is_preferred\":true}" > /dev/null

# We hold 200 kg.
( cd "$(dirname "$0")/.." && node -e "
  const db=require('./db');
  (async()=>{
    await db.query('INSERT INTO inventory (\"itemName\", quantity, uom, raw_material_id, item_type, owner_id) VALUES (\$1,\$2,\$3,\$4,\$5,\$6)',
      ['ZZ MS Plate 10mm', 200, 'kg', $MAT, 'raw', 1]);
    process.exit(0);})().catch(e=>{console.error(e.message);process.exit(1)});" )

# Customer orders 100 brackets.
ORDER=$(api POST "/customer-orders" "{\"customerId\":$CUST,\"orderDate\":\"2026-09-02\",\"items\":[{\"skuId\":$SKU,\"description\":\"ZZ Bracket\",\"quantity\":100,\"rate\":900,\"unit\":\"nos\"}]}" | id_of)
echo "  order=$ORDER (100 brackets x 12kg = 1,200kg needed, 200kg on hand)"
echo ""

echo "── does the deficiency engine see it? ──"
SHORT=$(api GET "/material-requirements" | node -pe "
  const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
  const m=(d.items||[]).find(x=>String(x.material).includes('ZZ MS Plate'));
  String(m?Math.round(m.shortfall):'none')")
SUGG=$(api GET "/material-requirements" | node -pe "
  const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
  const m=(d.items||[]).find(x=>String(x.material).includes('ZZ MS Plate'));
  String(m?Math.round(m.suggested_order_qty):'none')")
ok "shortfall is 1,200 - 200"        "$SHORT" "1000"
ok "rounded up to the vendor's MOQ"  "$SUGG"  "1000"

echo ""
echo "── the purchase plan ──"
api GET "/material-requirements/purchase-plan" | node -pe "
const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
const v=(d.vendors||[]).find(x=>x.vendorName==='ZZ Steel Traders');
v ? '  '+v.vendorName+' — '+v.lines.length+' line(s), ₹'+Number(v.total).toLocaleString('en-IN')+
    '\n    '+v.lines.map(l=>l.material+': '+l.qty+l.uom+' @ ₹'+l.rate+' (MOQ '+l.moq+' from '+l.moq_source+')').join('\n    ')
  : '  ❌ vendor not in the plan'"
PLANVAL=$(api GET "/material-requirements/purchase-plan" | node -pe "
  const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
  const v=(d.vendors||[]).find(x=>x.vendorName==='ZZ Steel Traders');
  String(v?Math.round(v.total):'0')")
ok "plan value = 1000kg x ₹65" "$PLANVAL" "65000"

echo ""
echo "── raise it ──"
RES=$(api POST "/material-requirements/to-po" "{\"materialIds\":[$MAT]}")
echo "$RES" | node -pe "
const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
d.error ? '  ❌ '+d.error+' — '+(d.detail||'') : '  '+d.message+'\n    '+(d.created||[]).map(c=>c.poNumber+' → '+c.vendor+', '+c.lines+' line(s), ₹'+Number(c.value).toLocaleString('en-IN')).join('\n    ')"
PO=$(echo "$RES" | node -pe "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));String(d.created&&d.created[0]?d.created[0].id:'')}catch(e){''}")
ok "a purchase order was created" "$([ -n "$PO" ] && echo yes || echo no)" "yes"

if [ -n "$PO" ]; then
  # `tail -1`: db.js prints "Connected to Supabase" on stdout at require time,
  # so the raw capture was "✅ Connected…\n1000" and the comparison failed on
  # a value that was actually correct. A test that reports a real pass as a
  # failure is as bad as the reverse — it teaches you to ignore the output.
  LINEQTY=$( cd "$(dirname "$0")/.." && node -e "
    const db=require('./db');
    (async()=>{ const r=await db.query('SELECT quantity, uom FROM po_line_items WHERE \"poId\"=\$1',[$PO]);
      console.log(r.rows[0]?Math.round(r.rows[0].quantity):''); process.exit(0);})()
      .catch(()=>{console.log('');process.exit(0)});" | tail -1 )
  ok "PO line carries the MOQ-rounded qty" "$LINEQTY" "1000"
fi

# ── cleanup ──
( cd "$(dirname "$0")/.." && node -e "
  const db=require('./db');
  (async()=>{
    await db.query('DELETE FROM po_line_items WHERE \"poId\" IN (SELECT id FROM purchase_orders WHERE \"quoteRef\" = \$1)',['Auto: material shortfall']);
    await db.query('DELETE FROM purchase_orders WHERE \"quoteRef\" = \$1',['Auto: material shortfall']);
    await db.query('DELETE FROM customer_order_items WHERE customer_order_id = \$1',[$ORDER]);
    await db.query('DELETE FROM customer_orders WHERE id = \$1',[$ORDER]);
    await db.query('DELETE FROM vendor_items WHERE raw_material_id = \$1',[$MAT]);
    await db.query('DELETE FROM sku_bom WHERE sku_id = \$1',[$SKU]);
    await db.query('DELETE FROM stock_movements WHERE raw_material_id = \$1',[$MAT]);
    await db.query('DELETE FROM inventory WHERE raw_material_id = \$1',[$MAT]);
    await db.query('DELETE FROM skus WHERE id = \$1',[$SKU]);
    await db.query('DELETE FROM raw_materials WHERE id = \$1',[$MAT]);
    await db.query('DELETE FROM vendors WHERE id = \$1',[$VEND]);
    process.exit(0);})().catch(e=>{console.error('cleanup:',e.message);process.exit(0)});" )
echo ""
echo "  (test data removed)"

echo ""
echo "════════════════════════════════"
if [ "$fail" -eq 0 ]; then echo "✅ all $pass checks passed — shortfall reaches a PO without retyping"; else echo "❌ $fail failed, $pass passed"; fi
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
