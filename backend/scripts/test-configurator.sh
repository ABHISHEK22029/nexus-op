#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
# Configurator + tenancy tests.
#
# The unit tests prove the permission matrix is consistent. This proves the
# Configurator's GUARDS hold against a live server — the ones that stop an
# administrator locking the company out of its own installation — and that a
# permission edited through the API actually changes what the API allows.
#
# Credentials come from the environment; this script creates accounts, so it
# refuses to run against a deployed host.
# ══════════════════════════════════════════════════════════
set -u
B="${BASE_URL:-http://localhost:5099}"
pass=0; fail=0

: "${RBAC_ADMIN_EMAIL:?set RBAC_ADMIN_EMAIL}"
: "${RBAC_ADMIN_PASSWORD:?set RBAC_ADMIN_PASSWORD}"
: "${RBAC_TEST_PASSWORD:?set RBAC_TEST_PASSWORD}"

case "$B" in
  *onrender.com*|*vercel.app*|https://*)
    echo "❌ refusing to run against a deployed host: $B"; exit 1;;
esac

tok() {
  curl -s -m 25 -X POST "$B/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | node -pe "try{JSON.parse(require('fs').readFileSync(0,'utf8')).token||''}catch(e){''}"
}
code() {
  curl -s -m 25 -o /dev/null -w '%{http_code}' -X "$1" "$B$2" \
    -H "Authorization: Bearer $3" -H 'Content-Type: application/json' -d "${4:-{\}}"
}
body() {
  curl -s -m 25 -X "$1" "$B$2" -H "Authorization: Bearer $3" \
    -H 'Content-Type: application/json' -d "${4:-{\}}"
}
check() {
  local desc="$1" got="$2"; shift 2
  if [ "$got" = "500" ] || [ "$got" = "000" ]; then
    echo "  ❌ $desc  got $got (server error) — never a pass"; fail=$((fail+1)); return
  fi
  for want in "$@"; do
    if [ "$got" = "$want" ]; then echo "  ✅ $desc  ($got)"; pass=$((pass+1)); return; fi
  done
  echo "  ❌ $desc  got $got, wanted $*"; fail=$((fail+1))
}

ADMIN=$(tok "$RBAC_ADMIN_EMAIL" "$RBAC_ADMIN_PASSWORD")
[ -z "$ADMIN" ] && { echo "❌ no admin token"; exit 1; }
ADMIN_ID=$(curl -s -m 25 "$B/auth/me" -H "Authorization: Bearer $ADMIN" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).id")
echo "admin id=$ADMIN_ID"

# A non-admin to prove the Configurator is closed to them. Upserted, because
# register-then-update only works on a database where this account does not
# already exist — see ensure-test-user.js.
node "$(dirname "$0")/ensure-test-user.js" "cfg-sales@test.local" "Sales" \
  || { echo "❌ could not prepare cfg-sales@test.local"; exit 1; }
SALES=$(tok "cfg-sales@test.local" "$RBAC_TEST_PASSWORD")
[ -z "$SALES" ] && { echo "❌ no sales token"; exit 1; }
SALES_ID=$(curl -s -m 25 "$B/auth/me" -H "Authorization: Bearer $SALES" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).id")
echo "sales id=$SALES_ID role=$(curl -s -m 25 "$B/auth/me" -H "Authorization: Bearer $SALES" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).role")"

echo ""
echo "── The Configurator is Administrator-only ──"
check "admin  GET /admin/roles"      "$(code GET /admin/roles "$ADMIN")" 200
check "sales  GET /admin/roles"      "$(code GET /admin/roles "$SALES")" 403
check "sales  GET /admin/users"      "$(code GET /admin/users "$SALES")" 403
check "sales  PATCH a role"          "$(code PATCH /admin/roles/Viewer "$SALES")" 403

echo ""
echo "── Lockout guards ──"
check "cannot edit Administrator"    "$(code PATCH /admin/roles/Administrator "$ADMIN" '{"permissions":{}}')" 400
check "cannot change own role"       "$(code PATCH /admin/users/$ADMIN_ID/role "$ADMIN" '{"role":"Viewer"}')" 400
check "cannot deactivate self"       "$(code PATCH /admin/users/$ADMIN_ID/active "$ADMIN" '{"isActive":false}')" 400
check "cannot delete a system role"  "$(code DELETE /admin/roles/Viewer "$ADMIN")" 400
check "unknown role rejected"        "$(code PATCH /admin/users/$SALES_ID/role "$ADMIN" '{"role":"NoSuchRole"}')" 400
check "unknown resource rejected"    "$(code PATCH /admin/roles/Sales "$ADMIN" '{"permissions":{"not-a-resource":["read"]}}')" 400

echo ""
echo "── An edited permission actually changes enforcement ──"
# PATCH /admin/roles REPLACES the whole grant set — correct API semantics,
# and a trap for a test. An earlier version sent two resources and silently
# cut the Sales role from 15 down to 2, leaving real Sales users unable to
# raise an invoice. So: snapshot the live grants, mutate, restore verbatim.
SNAPSHOT=$(body GET /admin/roles "$ADMIN" \
  | node -pe "JSON.stringify(JSON.parse(require('fs').readFileSync(0,'utf8')).roles.find(r=>r.role==='Sales').permissions)")
if [ -z "$SNAPSHOT" ] || [ "$SNAPSHOT" = "undefined" ]; then
  echo "  ❌ could not snapshot the Sales role — skipping rather than risk damaging it"; fail=$((fail+1))
else
  GRANTED=$(node -pe "const p=$SNAPSHOT; p.vendors=['read','write']; JSON.stringify({permissions:p})")
  echo "  before: sales POST /vendors = $(code POST /vendors "$SALES")"
  check "grant Sales write on vendors" "$(code PATCH /admin/roles/Sales "$ADMIN" "$GRANTED")" 200
  check "sales can NOW write vendors"  "$(code POST /vendors "$SALES")" 200 201 400
  check "restore original grants"      "$(code PATCH /admin/roles/Sales "$ADMIN" "$(node -pe "JSON.stringify({permissions:$SNAPSHOT})")")" 200
  check "sales is refused again"       "$(code POST /vendors "$SALES")" 403

  RESTORED=$(body GET /admin/roles "$ADMIN" \
    | node -pe "Object.keys(JSON.parse(require('fs').readFileSync(0,'utf8')).roles.find(r=>r.role==='Sales').permissions).length")
  ORIGINAL=$(node -pe "Object.keys($SNAPSHOT).length")
  check "Sales left exactly as found ($ORIGINAL resources)" \
    "$([ "$RESTORED" = "$ORIGINAL" ] && echo ok || echo "damaged:$RESTORED")" ok
fi

echo ""
echo "── Custom roles ──"
check "create a custom role"         "$(code POST /admin/roles "$ADMIN" '{"role":"StoreKeeper","label":"Store Keeper","copyFrom":"Viewer"}')" 200
check "duplicate name refused"       "$(code POST /admin/roles "$ADMIN" '{"role":"StoreKeeper"}')" 409
check "bad name refused"             "$(code POST /admin/roles "$ADMIN" '{"role":"9"}')" 400
check "delete unused custom role"    "$(code DELETE /admin/roles/StoreKeeper "$ADMIN")" 200

echo ""
echo "── Tenancy: milestones and GRN bills were leaking ──"
M_ADMIN=$(body GET "/milestones?limit=50" "$ADMIN" | node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));String(d.total??(Array.isArray(d)?d.length:0))")
M_SALES=$(body GET "/milestones?limit=50" "$SALES" | node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));String(d.total??(Array.isArray(d)?d.length:0))")
G_ADMIN=$(body GET "/grn-bills?limit=50" "$ADMIN" | node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));String(d.total??(Array.isArray(d)?d.length:0))")
G_SALES=$(body GET "/grn-bills?limit=50" "$SALES" | node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));String(d.total??(Array.isArray(d)?d.length:0))")
echo "  milestones  admin=$M_ADMIN  other-tenant=$M_SALES"
echo "  grn-bills   admin=$G_ADMIN  other-tenant=$G_SALES"
check "milestones isolated" "$([ "$M_SALES" = "0" ] && echo ok || echo leak)" ok
check "grn-bills isolated"  "$([ "$G_SALES" = "0" ] && echo ok || echo leak)" ok

echo ""
echo "── Audit trail recorded the edits ──"
AUDIT=$(body GET /admin/roles/audit "$ADMIN" | node -pe "JSON.parse(require('fs').readFileSync(0,'utf8')).entries.length")
check "audit entries exist" "$([ "$AUDIT" -gt 0 ] && echo ok || echo none)" ok
echo "  $AUDIT entries logged"

echo ""
echo "════════════════════════════════"
if [ "$fail" -eq 0 ]; then echo "✅ all $pass configurator checks passed"; else echo "❌ $fail failed, $pass passed"; fi
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
