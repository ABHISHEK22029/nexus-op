#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
# IDOR audit — can tenant B reach tenant A's records by id?
#
# A static grep finds handlers that look unscoped. This finds the ones that
# ACTUALLY are, by asking a real second tenant to fetch real records. The
# difference matters: several of the greps are admin-only routes or
# genuinely shared data, and chasing those wastes the effort that the real
# holes deserve.
#
# Expected: 404 (not found for you) or 403 (role can't). A 200 is a leak.
# ══════════════════════════════════════════════════════════
set -u
B="${BASE_URL:-http://localhost:5099}"
: "${AUDIT_ADMIN_EMAIL:?set AUDIT_ADMIN_EMAIL}"
: "${AUDIT_ADMIN_PASSWORD:?set AUDIT_ADMIN_PASSWORD}"
: "${AUDIT_TEST_PASSWORD:?set AUDIT_TEST_PASSWORD}"

case "$B" in *onrender.com*|*vercel.app*|https://*) echo "❌ refusing to run against a deployed host"; exit 1;; esac

tok() {
  curl -s -m 20 -X POST "$B/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | node -pe "try{JSON.parse(require('fs').readFileSync(0,'utf8')).token||''}catch(e){''}"
}
A=$(tok "$AUDIT_ADMIN_EMAIL" "$AUDIT_ADMIN_PASSWORD")
[ -z "$A" ] && { echo "❌ no admin token"; exit 1; }

# A second tenant with a role that CAN read these resources, so a 403 can
# never be mistaken for isolation. Owner has full business access.
curl -s -m 20 -X POST "$B/auth/register" -H 'Content-Type: application/json' \
  -d "{\"name\":\"IDOR Probe\",\"email\":\"idor-probe@test.local\",\"password\":\"$AUDIT_TEST_PASSWORD\"}" -o /dev/null
( cd "$(dirname "$0")/.." && node -e "
    const db=require('./db');
    (async()=>{ await db.query('UPDATE users SET role=\$1, is_active=TRUE WHERE email=\$2',['Owner','idor-probe@test.local']); process.exit(0); })()
      .catch(e=>{console.error(e.message);process.exit(1)});" ) || exit 1
P=$(tok "idor-probe@test.local" "$AUDIT_TEST_PASSWORD")
[ -z "$P" ] && { echo "❌ no probe token"; exit 1; }
echo "probe role: $(curl -s -m 20 "$B/auth/me" -H "Authorization: Bearer $P" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).role")"
echo ""

# Find a real id the ADMIN owns for each resource, then have the probe try it.
probe() {  # probe <listPath> <idField> <detailPathTemplate>
  local list="$1" idf="$2" tmpl="$3"
  local id
  id=$(curl -s -m 20 "$B/$list" -H "Authorization: Bearer $A" \
    | node -pe "try{const d=JSON.parse(require('fs').readFileSync(0,'utf8'));const a=Array.isArray(d)?d:(d.items||d.bills||[]);a.length?String(a[0]['$idf']):''}catch(e){''}")
  if [ -z "$id" ]; then printf "  %-34s %s\n" "$list" "— no data to probe"; return; fi
  local path="${tmpl//\{id\}/$id}"
  local code
  code=$(curl -s -m 20 -o /dev/null -w '%{http_code}' "$B$path" -H "Authorization: Bearer $P")
  case "$code" in
    404|403) printf "  ✅ %-32s id=%-5s -> %s\n" "$path" "$id" "$code";;
    200)     printf "  ❌ %-32s id=%-5s -> 200  LEAK\n" "$path" "$id";;
    *)       printf "  ?  %-32s id=%-5s -> %s\n" "$path" "$id" "$code";;
  esac
}

echo "── GET by id, as another tenant ──"
probe "sales-invoices"     id "/sales-invoices/{id}"
probe "sales-quotations"   id "/sales-quotations/{id}"
probe "delivery-challans"  id "/delivery-challans/{id}"
probe "credit-debit-notes" id "/credit-debit-notes/{id}"
probe "grn-bills"          id "/grn-bills/{id}"
probe "customer-orders"    id "/customer-orders/{id}"
probe "quotations"         id "/quotations/{id}"
probe "production"         id "/production/{id}"
probe "projects"           id "/projects/{id}"
probe "vendors"            id "/vendors/{id}"
probe "customers"          id "/customers/{id}"
probe "customers"          id "/customers/{id}/summary"
probe "vendor-items"       id "/vendor-items/{id}"

echo ""
echo "── prefill endpoints (they read a source record by id) ──"
probe "customer-orders" id "/delivery-challans/prefill/{id}"
probe "customer-orders" id "/sales-invoices/prefill/{id}"
probe "po"              id "/grn-bills/prefill/{id}"

echo ""
echo "Legend: 404 = not yours (correct) · 403 = role refused · 200 = LEAK"
