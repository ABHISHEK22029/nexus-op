#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════
# End-to-end RBAC test against a running server.
#
# The unit tests prove the matrix is internally consistent. This proves the
# middleware is actually wired to it — that a real token from a real login
# is refused by a real route. Those are different claims, and only the
# second one is the product.
#
# An earlier version of this test "passed" while the second tenant's login
# was silently returning an empty token: it was measuring an anonymous
# client and proving nothing. So every token is asserted non-empty and its
# identity echoed before a single permission is checked.
#
# CREDENTIALS COME FROM THE ENVIRONMENT, NEVER FROM THIS FILE.
# The first version hardcoded them. This repository is public, and the
# accounts it created were on the live database — so committing it published
# working logins for a production system. Those accounts have been
# deactivated. A test fixture is not a safe place for a password, even a
# throwaway one, because "throwaway" describes the intent and not the
# database it authenticates against.
#
#   RBAC_ADMIN_EMAIL=…  RBAC_ADMIN_PASSWORD=…  RBAC_TEST_PASSWORD=…  \
#     bash scripts/test-rbac-live.sh
#
# Run it against a local server. Pointing it at production creates accounts
# there, which is how this went wrong the first time.
# ══════════════════════════════════════════════════════════
set -u
B="${BASE_URL:-http://localhost:5099}"
pass=0; fail=0

: "${RBAC_ADMIN_EMAIL:?set RBAC_ADMIN_EMAIL}"
: "${RBAC_ADMIN_PASSWORD:?set RBAC_ADMIN_PASSWORD}"
: "${RBAC_TEST_PASSWORD:?set RBAC_TEST_PASSWORD (used for the throwaway role accounts)}"

case "$B" in
  *onrender.com*|*vercel.app*|https://*)
    echo "❌ refusing to run against what looks like a deployed host: $B"
    echo "   This script registers users. Run it against a local server."
    exit 1;;
esac

tok() {  # tok <email> <password>
  curl -s -m 25 -X POST "$B/auth/login" -H 'Content-Type: application/json' \
    -d "{\"email\":\"$1\",\"password\":\"$2\"}" \
    | node -pe "try{JSON.parse(require('fs').readFileSync(0,'utf8')).token||''}catch(e){''}"
}

code() {  # code <method> <path> <token>
  curl -s -m 25 -o /dev/null -w '%{http_code}' -X "$1" "$B$2" \
    -H "Authorization: Bearer $3" -H 'Content-Type: application/json' -d '{}'
}

check() {  # check <desc> <actual> <expected...>
  local desc="$1" got="$2"; shift 2
  # A 500 is never a pass. An earlier run listed 500 among the accepted
  # codes for "write allowed" cases, so a server crashing on every request
  # scored a green tick — the test agreed with a broken server.
  if [ "$got" = "500" ] || [ "$got" = "000" ]; then
    echo "  ❌ $desc  got $got (server error / no response) — never a pass"; fail=$((fail+1)); return
  fi
  for want in "$@"; do
    if [ "$got" = "$want" ]; then echo "  ✅ $desc  ($got)"; pass=$((pass+1)); return; fi
  done
  echo "  ❌ $desc  got $got, wanted $*"; fail=$((fail+1))
}

# Assert a role really took effect before testing what it may do.
assert_role() {  # assert_role <name> <token> <expected role>
  local got
  got=$(curl -s -m 25 "$B/auth/me" -H "Authorization: Bearer $2" \
    | node -pe "try{JSON.parse(require('fs').readFileSync(0,'utf8')).role||''}catch(e){''}")
  if [ "$got" != "$3" ]; then
    echo "❌ $1 has role '$got', expected '$3' — the rest of this run would prove nothing"; exit 1
  fi
  echo "  $1 : $3 ✓"
}

echo "── tokens ──"
ADMIN=$(tok "$RBAC_ADMIN_EMAIL" "$RBAC_ADMIN_PASSWORD")
[ -z "$ADMIN" ] && { echo "❌ no admin token — aborting, every result would be meaningless"; exit 1; }
echo "  admin  : $(curl -s -m 25 "$B/auth/me" -H "Authorization: Bearer $ADMIN" | node -pe "const d=JSON.parse(require('fs').readFileSync(0,'utf8')); d.email+' -> '+d.role+' ('+Object.keys(d.permissions||{}).length+' resources)'")"

# Upsert rather than register-then-update. POST /auth/register works exactly
# once: on the next run the email is taken, register refuses, and the
# password stays whatever it was — so this suite could not sign in and
# aborted with "no token for VIEWER". Deactivating these accounts after the
# committed-credential incident made that permanent.
for spec in "rbac-viewer@test.local:Viewer" "rbac-sales@test.local:Sales" "rbac-proc@test.local:Procurement"; do
  email="${spec%%:*}"; role="${spec##*:}"
  node "$(dirname "$0")/ensure-test-user.js" "$email" "$role" \
    || { echo "❌ could not prepare $email as $role — aborting"; exit 1; }
done

VIEWER=$(tok "rbac-viewer@test.local" "$RBAC_TEST_PASSWORD")
SALES=$(tok "rbac-sales@test.local" "$RBAC_TEST_PASSWORD")
PROC=$(tok "rbac-proc@test.local" "$RBAC_TEST_PASSWORD")
for pair in "VIEWER:$VIEWER" "SALES:$SALES" "PROC:$PROC"; do
  name="${pair%%:*}"; t="${pair#*:}"
  [ -z "$t" ] && { echo "❌ no token for $name — aborting"; exit 1; }
done
assert_role VIEWER "$VIEWER" Viewer
assert_role SALES  "$SALES"  Sales
assert_role PROC   "$PROC"   Procurement

echo ""
echo "── Viewer reads, never writes ──"
check "viewer GET  /customers"       "$(code GET    /customers    "$VIEWER")" 200
check "viewer POST /customers"       "$(code POST   /customers    "$VIEWER")" 403
check "viewer POST /vendors"         "$(code POST   /vendors      "$VIEWER")" 403
check "viewer DELETE /customers/1"   "$(code DELETE /customers/1  "$VIEWER")" 403

echo ""
echo "── Sales works its own lane, not procurement's ──"
check "sales GET  /customers"        "$(code GET  /customers      "$SALES")" 200
check "sales GET  /inventory"        "$(code GET  /inventory      "$SALES")" 200
check "sales POST /po (denied)"      "$(code POST /po             "$SALES")" 403
check "sales POST /vendors (denied)" "$(code POST /vendors        "$SALES")" 403

echo ""
echo "── Procurement buys, but cannot approve its own PO ──"
check "proc GET  /vendors"           "$(code GET   /vendors        "$PROC")" 200
check "proc POST /vendors allowed"   "$(code POST  /vendors        "$PROC")" 200 201 400
check "proc PATCH /po/1/approval"    "$(code PATCH /po/1/approval  "$PROC")" 403
check "proc POST /sales-invoices"    "$(code POST  /sales-invoices "$PROC")" 403

echo ""
echo "── Only the platform admin manages users ──"
check "sales  GET  /users (dropdowns)" "$(code GET   /users     "$SALES")"  200
check "sales  PATCH /users/1 (denied)" "$(code PATCH /users/1   "$SALES")"  403
check "viewer PATCH /users/1 (denied)" "$(code PATCH /users/1   "$VIEWER")" 403
check "admin  GET  /users"             "$(code GET   /users     "$ADMIN")"  200

echo ""
echo "── Company bank details are not everyone's to change ──"
check "sales PUT /company-profile"   "$(code PUT /company-profile "$SALES")"  403
check "viewer PUT /company-profile"  "$(code PUT /company-profile "$VIEWER")" 403

echo ""
echo "════════════════════════════════"
if [ "$fail" -eq 0 ]; then echo "✅ all $pass RBAC checks passed"; else echo "❌ $fail failed, $pass passed"; fi
exit $([ "$fail" -eq 0 ] && echo 0 || echo 1)
