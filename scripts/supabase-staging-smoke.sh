#!/usr/bin/env bash
# =============================================================================
# Supabase STAGING smoke test (review 9.2) - grants, RLS and sync RPCs, run on demand
# =============================================================================
# The SQL (migrations, RPCs, RLS, grants) is otherwise covered only by tests with a
# mocked client. This drives the real staging API with throwaway users:
#   1. the anon key cannot call service-only functions (057);
#   2. one user cannot read another user's rows (RLS);
#   3. sync_write_check answers apply / stale / deleted (059);
#   4. sync_tombstones is closed to clients;
#   5. clear_all_user_data runs.
# Test users are deleted at the end (Management API, the Supabase CLI's token).
#
# STAGING ONLY. Refuses the production project. Usage:
#   scripts/supabase-staging-smoke.sh
# Needs: curl, jq, ~/.supabase/access-token (`supabase login`), .env.development.
# =============================================================================
set -uo pipefail

PROD_REF="aybjmnxxtgspqesdiqxd"
REF="${SMOKE_PROJECT_REF:-uncyxrffqrloypgjalzz}"
if [ "$REF" = "$PROD_REF" ]; then
  echo "Refusing to run against production ($PROD_REF)." >&2
  exit 2
fi
URL="https://$REF.supabase.co"
ANON=$(grep '^NEXT_PUBLIC_SUPABASE_ANON_KEY=' .env.development | cut -d= -f2-)
TOKEN=$(cat ~/.supabase/access-token 2>/dev/null || true)
[ -n "$ANON" ] || { echo ".env.development has no NEXT_PUBLIC_SUPABASE_ANON_KEY" >&2; exit 2; }
[ -n "$TOKEN" ] || { echo "No ~/.supabase/access-token (run: supabase login)" >&2; exit 2; }
grep -q "$REF" .env.development || { echo ".env.development does not point at $REF" >&2; exit 2; }

PASS=0; FAIL=0; USERS=()
ok()   { PASS=$((PASS+1)); echo "  ok   $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL $1 (got: $2)"; }
expect() { if [ "$2" = "$3" ]; then ok "$1"; else bad "$1" "$2"; fi; }

sql() {
  curl -s -X POST "https://api.supabase.com/v1/projects/$REF/database/query" \
    -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
    --data-binary "$(jq -n --arg s "$1" '{query:$s}')"
}
signup() {  # prints "<jwt> <user id>"
  local email="smoke-$(date +%s%N)@example.com"
  local r; r=$(curl -s --http1.1 -X POST "$URL/auth/v1/signup" -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"Smoke-$(date +%s)-pw!\"}")
  echo "$(echo "$r" | jq -r .access_token) $(echo "$r" | jq -r .user.id)"
}
rest() {  # method path jwt [body] -> prints "<http code> <body>"
  local m=$1 p=$2 jwt=$3 body=${4:-}
  curl -s --http1.1 -o /tmp/smoke_body.$$ -w "%{http_code}" -X "$m" "$URL/rest/v1/$p" \
    -H "apikey: $ANON" -H "Authorization: Bearer $jwt" -H "Content-Type: application/json" \
    ${body:+-d "$body"}
  echo " $(cat /tmp/smoke_body.$$)"
}
check() { rest POST rpc/sync_write_check "$1" "{\"p_table\":\"$2\",\"p_row_id\":\"$3\",\"p_edit_age_ms\":$4}" | cut -d' ' -f2- | jq -r 'if type == "array" then .[0].verdict else .message end'; }

cleanup() {
  for u in "${USERS[@]}"; do
    sql "delete from public.sync_tombstones where user_id='$u'; delete from auth.users where id='$u';" >/dev/null
  done
  rm -f /tmp/smoke_body.$$
}
trap cleanup EXIT

echo "Supabase staging smoke ($REF)"
read -r JWT_A UID_A <<<"$(signup)"; USERS+=("$UID_A")
read -r JWT_B UID_B <<<"$(signup)"; USERS+=("$UID_B")
[ "$JWT_A" != "null" ] && [ "$JWT_B" != "null" ] || { echo "Sign-up failed (is auto-confirm on for staging?)" >&2; exit 1; }

echo "1. grants"
code=$(rest POST rpc/check_rate_limit "$ANON" '{"p_key":"x","p_limit":1,"p_window_seconds":60}' | cut -d' ' -f1)
case "$code" in 401|403|404) ok "anon cannot execute check_rate_limit ($code)";; *) bad "anon cannot execute check_rate_limit" "$code";; esac

echo "2. RLS"
expect "user A inserts a player" "$(rest POST players "$JWT_A" "{\"id\":\"smoke_p\",\"user_id\":\"$UID_A\",\"name\":\"A\"}" | cut -d' ' -f1)" "201"
expect "user B cannot read A's player" "$(rest GET "players?id=eq.smoke_p&select=id" "$JWT_B" | cut -d' ' -f2-)" "[]"
code=$(rest POST players "$JWT_B" "{\"id\":\"smoke_x\",\"user_id\":\"$UID_A\",\"name\":\"X\"}" | cut -d' ' -f1)
case "$code" in 401|403) ok "user B cannot write a row as A ($code)";; *) bad "user B cannot write a row as A" "$code";; esac

echo "3. sync_write_check"
expect "fresh edit -> apply" "$(check "$JWT_A" players smoke_p 0)" "apply"
expect "1 h old edit -> stale" "$(check "$JWT_A" players smoke_p 3600000)" "stale"
rest DELETE "players?id=eq.smoke_p" "$JWT_A" >/dev/null
expect "old edit to a deleted row -> deleted" "$(check "$JWT_A" players smoke_p 3600000)" "deleted"
expect "unknown table rejected" "$(check "$JWT_A" games x 0)" "Unsupported table"

echo "4. sync_tombstones closed to clients"
body=$(rest GET "sync_tombstones?select=*" "$JWT_A" | cut -d' ' -f2-)
case "$body" in *"permission denied"*) ok "tombstones not readable";; *) bad "tombstones not readable" "$body";; esac

echo "5. clear_all_user_data"
rest POST players "$JWT_A" "{\"id\":\"smoke_q\",\"user_id\":\"$UID_A\",\"name\":\"Q\"}" >/dev/null
rest POST rpc/clear_all_user_data "$JWT_A" '{}' >/dev/null
expect "user A's rows are gone" "$(rest GET "players?select=id" "$JWT_A" | cut -d' ' -f2-)" "[]"

echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ]
