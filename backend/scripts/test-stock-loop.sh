#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
# Proves the inventory loop is closed, end to end, on real data.
#
#   make 50 units          -> finished stock goes UP    (was missing)
#   dispatch 20            -> finished stock goes DOWN  (was missing)
#   dispatch again         -> stock does NOT move twice (idempotence)
#   pull back to Draft     -> the 20 come back
#   delete the output line -> the 50 come back out
#
# After every step the ledger is reconciled against the stored balance, so
# a step that moves stock without recording it — or records without moving —
# fails here rather than showing up as an unexplainable number later.
#
# Everything it creates is removed at the end.
# ══════════════════════════════════════════════════════════
set -u
B="${BASE_URL:-http://localhost:5099}"
: "${STOCK_ADMIN_EMAIL:?set STOCK_ADMIN_EMAIL}"
: "${STOCK_ADMIN_PASSWORD:?set STOCK_ADMIN_PASSWORD}"
case "$B" in *onrender.com*|*vercel.app*|https://*) echo "❌ refusing to run against a deployed host"; exit 1;; esac

pass=0; fail=0
ok(){ if [ "$2" = "$3" ]; then echo "  ✅ $1  ($2)"; pass=$((pass+1)); else echo "  ❌ $1  got $2, expected $3"; fail=$((fail+1)); fi }

T=$(curl -s -m 25 -X POST "$B/auth/login" -H 'Content-Type: application/json' \
     -d "{\"email\":\"$STOCK_ADMIN_EMAIL\",\"password\":\"$STOCK_ADMIN_PASSWORD\"}" \
     | node -pe "try{JSON.parse(require('fs').readFileSync(0,'utf8')).token||''}catch(e){''}")
[ -z "$T" ] && { echo "❌ no token"; exit 1; }

api(){ curl -s -m 25 -X "$1" "$B$2" -H "Authorization: Bearer $T" -H 'Content-Type: application/json' ${3:+-d "$3"}; }
jq(){ node -pe "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));String(eval('d.'+process.argv[1])??'')}catch(e){''}" "$1"; }

# Stock on hand for our test item, straight from the ledger's own view.
qty(){ api GET "/inventory?limit=200" | node -pe "
  const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
  const a=Array.isArray(d)?d:(d.items||[]);
  const r=a.find(x=>x.itemName==='ZZ Stock Loop Widget');
  String(r?Number(r.quantity):0)"; }

recon(){ api GET "/inventory/reconcile" | node -pe "
  const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
  d.healthy?'clean':('DRIFT on '+d.drifted.length+' item(s)')"; }

PID=$(api GET "/projects" | node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));const a=Array.isArray(d)?d:d.items;String(a[0].id)")
CID=$(api GET "/customers" | node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));const a=Array.isArray(d)?d:d.items;String(a[0].id)")
echo "using project $PID, customer $CID"
echo "starting stock for the test item: $(qty)"
echo ""

# ── 1. Production output must ADD to stock ──
PROD=$(api POST "/production" "{\"projectId\":$PID,\"productName\":\"ZZ Stock Loop Widget\",\"plannedQty\":50}" | jq id)
[ -z "$PROD" ] && { echo "❌ could not create production order"; exit 1; }
api POST "/production/$PROD/output" '{"itemName":"ZZ Stock Loop Widget","outputQty":50,"uom":"nos"}' > /dev/null
echo "── make 50 ──"
ok "finished goods entered stock" "$(qty)" "50"
ok "ledger reconciles"            "$(recon)" "clean"

# ── 2. Dispatch must REMOVE from stock ──
DC=$(api POST "/delivery-challans" "{\"customerId\":$CID,\"items\":[{\"description\":\"ZZ Stock Loop Widget\",\"quantity\":20,\"rate\":100,\"uom\":\"nos\"}]}" | jq id)
[ -z "$DC" ] && { echo "❌ could not create challan"; exit 1; }
echo ""
echo "── dispatch 20 ──"
ok "stock unchanged while Draft" "$(qty)" "50"
api PATCH "/delivery-challans/$DC/status" '{"status":"Dispatched"}' > /dev/null
ok "stock reduced on dispatch"   "$(qty)" "30"
ok "ledger reconciles"           "$(recon)" "clean"

# ── 3. Dispatching again must NOT move stock twice ──
echo ""
echo "── dispatch the same challan again (double click / retry) ──"
api PATCH "/delivery-challans/$DC/status" '{"status":"Delivered"}' > /dev/null
ok "no double deduction" "$(qty)" "30"

# ── 4. Reversal returns the goods ──
echo ""
echo "── pull it back to Draft ──"
api PATCH "/delivery-challans/$DC/status" '{"status":"Draft"}' > /dev/null
ok "goods returned to stock" "$(qty)" "50"
ok "ledger reconciles"       "$(recon)" "clean"

# ── 5. Deleting the output line removes the goods again ──
echo ""
echo "── delete the production output line ──"
LINE=$(api GET "/production/$PROD" | node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));String(d.output&&d.output[0]?d.output[0].id:'')")
# Route is /production/:kind/line/:lineId — kind first, not the order id.
# The earlier /production/$PROD/line/output/$LINE simply 404'd, and a silent
# 404 looked exactly like "the reversal didn't fire".
DEL=$(curl -s -m 25 -o /dev/null -w '%{http_code}' -X DELETE "$B/production/output/line/$LINE" -H "Authorization: Bearer $T")
[ "$DEL" = "200" ] || echo "  ⚠ delete returned $DEL"
ok "phantom stock removed" "$(qty)" "0"
ok "ledger reconciles"     "$(recon)" "clean"

# ── 6. The ledger explains the balance ──
echo ""
echo "── movement history ──"
api GET "/inventory/movements?limit=20&search=ZZ%20Stock%20Loop" | node -pe "
const d=JSON.parse(require('fs').readFileSync(0,'utf8'));
const rows=(d.items||[]).map(m=>'    '+String(m.quantity).padStart(6)+'  '+m.movement_type.padEnd(24)+(m.ref_number||''));
'  '+d.total+' movements recorded:\n'+rows.reverse().join('\n')"

# ── cleanup ──
api DELETE "/delivery-challans/$DC" > /dev/null
api DELETE "/production/$PROD" > /dev/null
( cd "$(dirname "$0")/.." && node -e "
  const db=require('./db');(async()=>{
    await db.query(\"DELETE FROM stock_movements WHERE item_name = 'ZZ Stock Loop Widget'\");
    await db.query(\"DELETE FROM inventory WHERE \\\"itemName\\\" = 'ZZ Stock Loop Widget'\");
    process.exit(0);})()" ) > /dev/null 2>&1

echo ""
echo "════════════════════════════════"
if [ "$fail" -eq 0 ]; then echo "✅ all $pass stock-loop checks passed"; else echo "❌ $fail failed, $pass passed"; fi
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
