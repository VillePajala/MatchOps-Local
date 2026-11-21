#!/usr/bin/env bash
# =============================================================================
# Supabase STAGING smoke test (review 9.2) - grants, RLS and sync RPCs, run on demand
# =============================================================================
# The SQL (migrations, RPCs, RLS, grants) is otherwise covered only by tests with a
# mocked client. This drives the real staging API with throwaway users:
#   1. the service-only functions (057) exist and anon/authenticated cannot execute them;
#   2. one user cannot read another user's rows (RLS);
#   3. sync_write_check answers apply / stale / deleted (059);
#   4. sync_tombstones is closed to clients;
#   5. account_features (064): readable by its owner only, not writable by clients;
#   6. clear_all_user_data runs and keeps the granted features.
# Test users are deleted at the end (Management API, the Supabase CLI's token).
#
# STAGING ONLY: the target is fixed to the staging project (no override). Usage:
#   scripts/supabase-staging-smoke.sh
# Needs: curl, jq, ~/.supabase/access-token (`supabase login`), .env.development.
# =============================================================================
set -uo pipefail

# Allowlist, not a denylist: the script runs SQL (incl. deleting auth users) with a
# Management API token, so it must never target any other project.
STAGING_REF="uncyxrffqrloypgjalzz"
REF="$STAGING_REF"
if [ -n "${SMOKE_PROJECT_REF:-}" ] && [ "$SMOKE_PROJECT_REF" != "$STAGING_REF" ]; then
  echo "Refusing: this script only runs against staging ($STAGING_REF)." >&2
  exit 2
fi
URL="https://$REF.supabase.co"
env_value() { grep "^$1=" .env.development | head -1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^["'"'"']//' -e 's/["'"'"']$//'; }
ANON=$(env_value NEXT_PUBLIC_SUPABASE_ANON_KEY)
TOKEN=$(cat ~/.supabase/access-token 2>/dev/null || true)
[ -n "$ANON" ] || { echo ".env.development has no NEXT_PUBLIC_SUPABASE_ANON_KEY" >&2; exit 2; }
[ -n "$TOKEN" ] || { echo "No ~/.supabase/access-token (run: supabase login)" >&2; exit 2; }
[ "$(env_value NEXT_PUBLIC_SUPABASE_URL)" = "$URL" ] || { echo ".env.development does not point at staging ($URL)" >&2; exit 2; }

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
  local email="smoke-$(date +%s)-$(od -An -N4 -tx4 /dev/urandom | tr -d ' ')@example.com"
  local r; r=$(curl -s --http1.1 -X POST "$URL/auth/v1/signup" -H "apikey: $ANON" -H "Content-Type: application/json" \
    -d "{\"email\":\"$email\",\"password\":\"Smoke-$(date +%s)-pw!\"}")
  echo "$(echo "$r" | jq -r .access_token) $(echo "$r" | jq -r .user.id)"
}
BODY_FILE=$(mktemp)
rest() {  # method path jwt [body] -> prints "<http code> <body on one line>"
  local m=$1 p=$2 jwt=$3 body=${4:-}
  local code
  code=$(curl -s --http1.1 -o "$BODY_FILE" -w "%{http_code}" -X "$m" "$URL/rest/v1/$p" \
    -H "apikey: $ANON" -H "Authorization: Bearer $jwt" -H "Content-Type: application/json" \
    ${body:+-d "$body"})
  echo "$code $(tr -d '\n' < "$BODY_FILE")"
}
check() { rest POST rpc/sync_write_check "$1" "{\"p_table\":\"$2\",\"p_row_id\":\"$3\",\"p_edit_age_ms\":$4}" | cut -d' ' -f2- | jq -r 'if type == "array" then .[0].verdict else .message end'; }

cleanup() {
  local status=$? left
  for u in ${USERS[@]+"${USERS[@]}"}; do
    [[ "$u" =~ ^[0-9a-f-]{36}$ ]] || continue
    sql "delete from public.sync_tombstones where user_id='$u'; delete from auth.users where id='$u';" >/dev/null
    left=$(sql "select count(*) as n from auth.users where id='$u'" | jq -r '.[0].n // "?"')
    if [ "$left" != "0" ]; then
      echo "WARNING: test user $u was not removed from staging (left: $left)" >&2
      status=1
    fi
  done
  rm -f "$BODY_FILE"
  exit $status
}
trap cleanup EXIT

echo "Supabase staging smoke ($REF)"
read -r JWT_A UID_A <<<"$(signup)"; [ "$UID_A" != "null" ] && USERS+=("$UID_A")
read -r JWT_B UID_B <<<"$(signup)"; [ "$UID_B" != "null" ] && USERS+=("$UID_B")
[ "$JWT_A" != "null" ] && [ "$JWT_B" != "null" ] || { echo "Sign-up failed (is auto-confirm on for staging?)" >&2; exit 1; }

echo "1. grants"
# Checked in the catalog, not through the API: a 404 from the API also means
# "function not found", which would pass for the wrong reason.
for fn in check_rate_limit upsert_subscription; do
  row=$(sql "select count(*) as n, bool_or(has_function_privilege('anon', p.oid, 'execute')) as anon, bool_or(has_function_privilege('authenticated', p.oid, 'execute')) as auth from pg_proc p join pg_namespace s on s.oid = p.pronamespace where s.nspname = 'public' and p.proname = '$fn'")
  expect "$fn exists" "$(echo "$row" | jq -r '.[0].n > 0')" "true"
  expect "$fn not executable by anon or authenticated" "$(echo "$row" | jq -r '.[0].anon or .[0].auth')" "false"
done

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

echo "5. account_features"
sql "insert into public.account_features (user_id, feature) values ('$UID_A', 'smoke_flag')" >/dev/null
expect "user A reads its own feature" "$(rest GET "account_features?select=feature,enabled" "$JWT_A" | cut -d' ' -f2- | jq -c .)" '[{"feature":"smoke_flag","enabled":true}]'
expect "user B cannot read A's feature" "$(rest GET "account_features?select=feature" "$JWT_B" | cut -d' ' -f2-)" "[]"
code=$(rest POST account_features "$JWT_B" "{\"user_id\":\"$UID_B\",\"feature\":\"smoke_self\"}" | cut -d' ' -f1)
case "$code" in 401|403) ok "user B cannot grant itself a feature ($code)";; *) bad "user B cannot grant itself a feature" "$code";; esac
rest PATCH "account_features?feature=eq.smoke_flag" "$JWT_A" '{"enabled":false}' >/dev/null
rest DELETE "account_features?feature=eq.smoke_flag" "$JWT_A" >/dev/null
expect "user A cannot change or delete its feature" "$(sql "select count(*) filter (where enabled) as n from public.account_features where user_id='$UID_A'" | jq -r '.[0].n')" "1"

echo "6. clear_all_user_data"
rest POST players "$JWT_A" "{\"id\":\"smoke_q\",\"user_id\":\"$UID_A\",\"name\":\"Q\"}" >/dev/null
code=$(rest POST rpc/clear_all_user_data "$JWT_A" '{}' | cut -d' ' -f1)
case "$code" in 2??) ok "clear_all_user_data succeeds ($code)";; *) bad "clear_all_user_data succeeds" "$code";; esac
expect "user A's rows are gone" "$(rest GET "players?select=id" "$JWT_A" | cut -d' ' -f2-)" "[]"
expect "granted features survive the clear" "$(rest GET "account_features?select=feature" "$JWT_A" | cut -d' ' -f2- | jq -r 'length')" "1"

echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ]
