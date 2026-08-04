#!/usr/bin/env bash
# Verifies the staging.triqare.com -> triqare.com cutover, stage by stage.
# Read-only: only DNS lookups and GETs. Safe to run repeatedly.
#
#   ./scripts/_cutover-check.sh
#
# Queries Namecheap's AUTHORITATIVE nameserver, not a resolver, so a saved record
# shows up immediately and a "still propagating" explanation can be ruled out.

set -uo pipefail

NS=dns1.registrar-servers.com
SITE=triqareweb20.netlify.app
OLD_FWD=162.255.119.112

pass() { printf "  \033[32mPASS\033[0m  %s\n" "$1"; }
fail() { printf "  \033[31mFAIL\033[0m  %s\n" "$1"; }
info() { printf "  ....  %s\n" "$1"; }

echo
echo "=== 1. Old URL-forward removed ================================="
code=$(curl -s -o /dev/null -w '%{http_code}' -m 20 http://triqare.com)
dest=$(curl -s -o /dev/null -w '%{redirect_url}' -m 20 http://triqare.com)
if [[ "$dest" == *"triqare.in"* ]]; then
  fail "still forwarding to triqare.in ($code -> $dest)"
  info "delete the URL Redirect rows for @ and www FIRST, save, then add ALIAS/CNAME"
else
  pass "no forward to triqare.in (http=$code)"
fi

echo
echo "=== 2. Authoritative DNS ======================================="
for h in triqare.com www.triqare.com; do
  a=$(dig @$NS "$h" A +short | tr '\n' ' ')
  c=$(dig @$NS "$h" CNAME +short | tr '\n' ' ')
  if [[ "$a" == *"$OLD_FWD"* ]]; then
    fail "$h still on the Namecheap forwarding IP ($OLD_FWD)"
  elif [[ -n "$c" || -n "$a" ]]; then
    pass "$h -> ${c:-$a}"
  else
    fail "$h has no A/CNAME record"
  fi
done

echo
echo "=== 3. MX intact (company email must not break) ================"
mx=$(dig @$NS triqare.com MX +short | tr '\n' ' ')
if [[ "$mx" == *privateemail* ]]; then pass "MX: $mx"; else fail "MX missing or changed: ${mx:-<none>}"; fi

echo
echo "=== 4. Netlify has the domain + a certificate =================="
for h in triqare.com www.triqare.com; do
  ip=$(dig +short $SITE | head -1)
  out=$(curl -s -o /dev/null -w '%{http_code}' -m 30 --resolve "$h:443:$ip" "https://$h" 2>/dev/null)
  if [[ "$out" == "000" ]]; then
    fail "$h — TLS/SNI rejected by Netlify (domain not added, or cert not issued yet)"
  else
    pass "$h — Netlify answers over TLS (http=$out)"
  fi
done

echo
echo "=== 5. Live over real DNS ======================================"
for u in https://triqare.com https://www.triqare.com https://staging.triqare.com; do
  r=$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' -m 30 "$u")
  case "$r" in
    000*) fail "$u — no response" ;;
    2*|3*) pass "$u -> $r" ;;
    *) fail "$u -> $r" ;;
  esac
done

echo
echo "=== 6. App is the new build, not the stale Clerk one ==========="
for u in https://triqare.com/sign-in https://staging.triqare.com/sign-in; do
  body=$(curl -sL -m 30 "$u" 2>/dev/null)
  if [[ -z "$body" ]]; then info "$u — not reachable yet"; continue; fi
  n=$(printf '%s' "$body" | grep -ci clerk)
  if [[ "$n" -eq 0 ]]; then pass "$u — Supabase Auth build (0 Clerk refs)"; else fail "$u — $n Clerk refs (stale build)"; fi
done

echo
echo "=== 7. portal.triqare.com retired =============================="
p=$(dig @$NS portal.triqare.com CNAME +short)
if [[ -z "$p" ]]; then pass "portal record deleted"; else fail "portal still -> $p (Step 7 not done)"; fi

echo
echo "Not covered here — check by hand on https://triqare.com once the above is green:"
echo "  * admin sign-in loads the dashboard with data"
echo "  * password-reset OTP email arrives and is accepted"
echo "  * Google / Apple sign-in completes  (needs the Supabase redirect allow-list)"
echo "  * an emergency-contact invite email links to triqare.com"
echo "  * a test SOS still pages a driver device"
echo
