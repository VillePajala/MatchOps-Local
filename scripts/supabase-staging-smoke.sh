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
#   6. playbooks (065): nothing visible without a playbook_access grant; with one, the
#      playbook and its concepts; none of the three tables writable by clients;
#   7. game_themes (066): own rows CRUD, set_game_themes replaces a game's selection
#      in order, another user sees and changes nothing;
#   8. clear_all_user_data runs, clears game themes, and keeps the granted features
#      and playbook access;
#   9. playbook codes (067): a valid code grants and consumes a use, a second redeem
#      answers 'already' without consuming one; expired / revoked / used_up / invalid;
#      10 failures an hour -> rate_limited; playbook_codes is closed to clients.
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
SMOKE_PB="smoke-pb-$(date +%s)-$(od -An -N2 -tx2 /dev/urandom | tr -d ' ')"
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
  # Users first: their playbook_access rows go with them (FK cascade); then the playbook.
  sql "delete from public.playbooks where id in ('$SMOKE_PB', '$SMOKE_PB-codes');" >/dev/null
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

echo "6. playbooks"
sql "insert into public.playbooks (id, name) values ('$SMOKE_PB', 'Smoke'); insert into public.playbook_concepts (playbook_id, id, format, phase, data) values ('$SMOKE_PB', 'c1', '8v8', 'Perusteet', '{\"id\":\"c1\"}');" >/dev/null
expect "user A without access sees no playbook" "$(rest GET "playbooks?id=eq.$SMOKE_PB&select=id" "$JWT_A" | cut -d' ' -f2-)" "[]"
expect "user A without access sees no concepts" "$(rest GET "playbook_concepts?playbook_id=eq.$SMOKE_PB&select=id" "$JWT_A" | cut -d' ' -f2-)" "[]"
sql "insert into public.playbook_access (playbook_id, user_id) values ('$SMOKE_PB', '$UID_A')" >/dev/null
expect "user A with access reads the playbook" "$(rest GET "playbooks?id=eq.$SMOKE_PB&select=id,name" "$JWT_A" | cut -d' ' -f2- | jq -c .)" "[{\"id\":\"$SMOKE_PB\",\"name\":\"Smoke\"}]"
expect "user A with access reads its concepts" "$(rest GET "playbook_concepts?playbook_id=eq.$SMOKE_PB&select=id,data" "$JWT_A" | cut -d' ' -f2- | jq -c .)" '[{"id":"c1","data":{"id":"c1"}}]'
expect "user A reads its own grant" "$(rest GET "playbook_access?select=playbook_id" "$JWT_A" | cut -d' ' -f2- | jq -r 'map(.playbook_id) | index("'"$SMOKE_PB"'") != null')" "true"
expect "user B sees nothing of it" "$(rest GET "playbooks?id=eq.$SMOKE_PB&select=id" "$JWT_B" | cut -d' ' -f2-)$(rest GET "playbook_concepts?playbook_id=eq.$SMOKE_PB&select=id" "$JWT_B" | cut -d' ' -f2-)$(rest GET "playbook_access?playbook_id=eq.$SMOKE_PB&select=user_id" "$JWT_B" | cut -d' ' -f2-)" "[][][]"
code=$(rest POST playbooks "$JWT_A" '{"id":"smoke-pb-x","name":"X"}' | cut -d' ' -f1)
case "$code" in 401|403) ok "user A cannot create a playbook ($code)";; *) bad "user A cannot create a playbook" "$code";; esac
code=$(rest POST playbook_concepts "$JWT_A" "{\"playbook_id\":\"$SMOKE_PB\",\"id\":\"c2\",\"format\":\"8v8\",\"phase\":\"P\",\"data\":{}}" | cut -d' ' -f1)
case "$code" in 401|403) ok "user A cannot add a concept ($code)";; *) bad "user A cannot add a concept" "$code";; esac
code=$(rest POST playbook_access "$JWT_B" "{\"playbook_id\":\"$SMOKE_PB\",\"user_id\":\"$UID_B\"}" | cut -d' ' -f1)
case "$code" in 401|403) ok "user B cannot grant itself access ($code)";; *) bad "user B cannot grant itself access" "$code";; esac
rest PATCH "playbooks?id=eq.$SMOKE_PB" "$JWT_A" '{"name":"Hacked"}' >/dev/null
rest PATCH "playbook_concepts?playbook_id=eq.$SMOKE_PB" "$JWT_A" '{"data":{"x":1}}' >/dev/null
rest DELETE "playbook_concepts?playbook_id=eq.$SMOKE_PB" "$JWT_A" >/dev/null
rest DELETE "playbook_access?playbook_id=eq.$SMOKE_PB" "$JWT_A" >/dev/null
expect "user A cannot change or delete any of it" "$(sql "select (select name from public.playbooks where id='$SMOKE_PB') || '/' || (select count(*) from public.playbook_concepts where playbook_id='$SMOKE_PB' and data = '{\"id\":\"c1\"}') || '/' || (select count(*) from public.playbook_access where playbook_id='$SMOKE_PB') as r" | jq -r '.[0].r')" "Smoke/1/1"

echo "7. game_themes"
themes() { rest GET "game_themes?game_id=eq.$2&select=playbook_id,concept_id,sort&order=sort" "$1" | cut -d' ' -f2- | jq -c 'map("\(.playbook_id)/\(.concept_id)/\(.sort)")'; }
expect "user A inserts its own theme" "$(rest POST game_themes "$JWT_A" "{\"user_id\":\"$UID_A\",\"game_id\":\"smoke_g\",\"playbook_id\":\"pb\",\"concept_id\":\"c1\"}" | cut -d' ' -f1)" "201"
expect "user A reads it" "$(themes "$JWT_A" smoke_g)" '["pb/c1/0"]'
rest PATCH "game_themes?game_id=eq.smoke_g&concept_id=eq.c1" "$JWT_A" '{"sort":3}' >/dev/null
expect "user A updates it" "$(themes "$JWT_A" smoke_g)" '["pb/c1/3"]'
code=$(rest POST rpc/set_game_themes "$JWT_A" '{"p_game_id":"smoke_g","p_themes":[{"playbookId":"pb","conceptId":"c2"},{"playbookId":"pb","conceptId":"c1"},{"playbookId":"pb","conceptId":"c2"}]}' | cut -d' ' -f1)
case "$code" in 2??) ok "set_game_themes succeeds ($code)";; *) bad "set_game_themes succeeds" "$code";; esac
expect "set_game_themes replaces the selection in order (repeat dropped)" "$(themes "$JWT_A" smoke_g)" '["pb/c2/0","pb/c1/1"]'
expect "user B cannot read A's themes" "$(themes "$JWT_B" smoke_g)" "[]"
code=$(rest POST game_themes "$JWT_B" "{\"user_id\":\"$UID_A\",\"game_id\":\"smoke_g\",\"playbook_id\":\"pb\",\"concept_id\":\"cx\"}" | cut -d' ' -f1)
case "$code" in 401|403) ok "user B cannot write a theme as A ($code)";; *) bad "user B cannot write a theme as A" "$code";; esac
rest DELETE "game_themes?game_id=eq.smoke_g" "$JWT_B" >/dev/null
rest POST rpc/set_game_themes "$JWT_B" '{"p_game_id":"smoke_g","p_themes":[]}' >/dev/null
expect "user B cannot delete or replace A's themes" "$(themes "$JWT_A" smoke_g)" '["pb/c2/0","pb/c1/1"]'
code=$(rest POST rpc/set_game_themes "$JWT_A" '{"p_game_id":"smoke_g","p_themes":{"x":1}}' | cut -d' ' -f1)
expect "set_game_themes rejects a non-array" "$code" "400"
expect "anon cannot read game_themes" "$(rest GET "game_themes?select=game_id" "$ANON" | cut -d' ' -f2- | jq -r 'if type == "array" then "rows" else "denied" end')" "denied"
rest DELETE "game_themes?game_id=eq.smoke_g&concept_id=eq.c1" "$JWT_A" >/dev/null
expect "user A deletes one of its themes" "$(themes "$JWT_A" smoke_g)" '["pb/c2/0"]'

echo "8. clear_all_user_data"
rest POST players "$JWT_A" "{\"id\":\"smoke_q\",\"user_id\":\"$UID_A\",\"name\":\"Q\"}" >/dev/null
code=$(rest POST rpc/clear_all_user_data "$JWT_A" '{}' | cut -d' ' -f1)
case "$code" in 2??) ok "clear_all_user_data succeeds ($code)";; *) bad "clear_all_user_data succeeds" "$code";; esac
expect "user A's rows are gone" "$(rest GET "players?select=id" "$JWT_A" | cut -d' ' -f2-)" "[]"
expect "user A's game themes are gone" "$(themes "$JWT_A" smoke_g)" "[]"
expect "granted features survive the clear" "$(rest GET "account_features?select=feature" "$JWT_A" | cut -d' ' -f2- | jq -r 'length')" "1"
expect "playbook access survives the clear" "$(rest GET "playbook_concepts?playbook_id=eq.$SMOKE_PB&select=id" "$JWT_A" | cut -d' ' -f2- | jq -r 'length')" "1"

echo "9. playbook codes"
# Codes are random per run; only their hashes go to the database (as create-code.mjs does).
CPB="$SMOKE_PB-codes"
code_hash() { printf '%s' "$1" | tr -d ' -' | tr '[:lower:]' '[:upper:]' | sha256sum | cut -d' ' -f1; }
rnd() { od -An -N6 -tx1 /dev/urandom | tr -d ' \n' | tr '[:lower:]' '[:upper:]'; }
C_OK="SMOKE-$(rnd)"; C_EXP="SMOKE-$(rnd)"; C_REV="SMOKE-$(rnd)"; C_ONE="SMOKE-$(rnd)"
sql "insert into public.playbooks (id, name) values ('$CPB', 'Smoke codes');
     insert into public.playbook_codes (code_hash, playbook_id, label, expires_at, max_uses, revoked) values
       ('$(code_hash "$C_OK")',  '$CPB', 'smoke ok',      null,                         5,    false),
       ('$(code_hash "$C_EXP")', '$CPB', 'smoke expired', now() - interval '1 minute',  null, false),
       ('$(code_hash "$C_REV")', '$CPB', 'smoke revoked', null,                         null, true),
       ('$(code_hash "$C_ONE")', '$CPB', 'smoke one use', null,                         1,    false);" >/dev/null
redeem() { rest POST rpc/redeem_playbook_code "$1" "{\"p_code\":\"$2\"}" | cut -d' ' -f2- | jq -c '{ok, error, already, playbook_id, playbook_name}'; }
uses() { sql "select uses from public.playbook_codes where code_hash='$(code_hash "$1")'" | jq -r '.[0].uses'; }
lower_nodash=$(printf '%s' "$C_OK" | tr -d '-' | tr '[:upper:]' '[:lower:]')
expect "valid code (lower-case, no dashes) grants the playbook" "$(redeem "$JWT_B" "$lower_nodash")" "{\"ok\":true,\"error\":null,\"already\":null,\"playbook_id\":\"$CPB\",\"playbook_name\":\"Smoke codes\"}"
expect "it consumed one use" "$(uses "$C_OK")" "1"
expect "user B now reads the playbook" "$(rest GET "playbooks?id=eq.$CPB&select=id" "$JWT_B" | cut -d' ' -f2- | jq -r 'length')" "1"
expect "second redeem -> already" "$(redeem "$JWT_B" "$C_OK" | jq -r '"\(.ok)/\(.already)"')" "true/true"
expect "already did not consume a use" "$(uses "$C_OK")" "1"
expect "expired code -> expired" "$(redeem "$JWT_A" "$C_EXP" | jq -r .error)" "expired"
expect "revoked code -> revoked" "$(redeem "$JWT_A" "$C_REV" | jq -r .error)" "revoked"
expect "one-use code: first redeem ok" "$(redeem "$JWT_A" "$C_ONE" | jq -r .ok)" "true"
read -r JWT_C UID_C <<<"$(signup)"; [ "$UID_C" != "null" ] && USERS+=("$UID_C")
expect "one-use code: second user -> used_up" "$(redeem "$JWT_C" "$C_ONE" | jq -r .error)" "used_up"
expect "unknown code -> invalid" "$(redeem "$JWT_A" "NOPE-NOPE-NOPE")" '{"ok":false,"error":"invalid","already":null,"playbook_id":null,"playbook_name":null}'
expect "user A holds only the grant from the one-use code" "$(rest GET "playbook_access?playbook_id=eq.$CPB&select=user_id" "$JWT_A" | cut -d' ' -f2- | jq -r 'length')" "1"
expect "anon cannot redeem" "$(rest POST rpc/redeem_playbook_code "$ANON" '{"p_code":"x"}' | cut -d' ' -f1 | grep -cE '^(401|403|404)$')" "1"
for _ in 1 2 3 4 5 6 7 8 9 10; do redeem "$JWT_C" "WRONG-$(rnd)" >/dev/null; done
expect "after 10 failures in an hour -> rate_limited (user C)" "$(redeem "$JWT_C" "$C_OK" | jq -r .error)" "rate_limited"
expect "the rate limit is per user (user A still fine)" "$(redeem "$JWT_A" "$C_OK" | jq -r .ok)" "true"
body=$(rest GET "playbook_codes?select=*" "$JWT_A" | cut -d' ' -f2-)
case "$body" in *"permission denied"*) ok "playbook_codes not readable by clients";; *) bad "playbook_codes not readable by clients" "$body";; esac
body=$(rest GET "playbook_code_attempts?select=*" "$JWT_C" | cut -d' ' -f2-)
case "$body" in *"permission denied"*) ok "playbook_code_attempts not readable by clients";; *) bad "playbook_code_attempts not readable by clients" "$body";; esac

echo
echo "passed $PASS, failed $FAIL"
[ "$FAIL" -eq 0 ]
