#!/bin/sh
# E2E test for camofox-browser
# Tests: health, tab creation, navigation, evaluate, persistence
set -e

BASE="${BASE:-https://camofox-browser-production-cd36.up.railway.app}"
KEY="${KEY:-saa5q9igrxs5ot1j06yb4xjsqjexgwsa}"
USER="e2e-$$"
PASS=0
FAIL=0

check() {
  name="$1"
  result="$2"
  if [ "$result" = "1" ]; then
    echo "  PASS: $name"
    PASS=$((PASS+1))
  else
    echo "  FAIL: $name"
    FAIL=$((FAIL+1))
  fi
}

echo "=== E2E Test Suite ==="
echo "Target: $BASE"
echo ""

# 1. Health check
echo "[1] Health endpoint"
RESP=$(curl -s --max-time 10 "$BASE/health" -H "Authorization: Bearer $KEY")
HEALTH_OK=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(1 if d.get('ok')==True and d.get('browserRunning')==True else 0)" 2>/dev/null || echo "0")
check "returns ok=true, browserRunning=true" "$HEALTH_OK"
echo ""

# 2. Create tab
echo "[2] Create tab"
RESP=$(curl -s --max-time 15 -X POST "$BASE/tabs" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER\",\"sessionKey\":\"e2e\",\"url\":\"https://example.com\"}")
TAB=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tabId',''))" 2>/dev/null || echo "")
check "tabId returned" "$([ -n "$TAB" ] && echo 1 || echo 0)"
echo "  tabId: $TAB"
echo ""

# 3. Tab navigates correctly
echo "[3] Tab navigation"
sleep 3
RESP=$(curl -s --max-time 10 "$BASE/tabs/$TAB/snapshot?userId=$USER&format=text" -H "Authorization: Bearer $KEY")
NAV_OK=$(echo "$RESP" | python3 -c "import sys; print(1 if 'Example Domain' in sys.stdin.read() else 0)" 2>/dev/null || echo "0")
check "page loaded (Example Domain in snapshot)" "$NAV_OK"
echo ""

# 4. Evaluate JS (IIFE form)
echo "[4] Evaluate JS"
RESP=$(curl -s --max-time 15 -X POST "$BASE/tabs/$TAB/evaluate" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER\",\"expression\":\"(() => { return { title: document.title, url: location.href }; })()\"}")
EVAL_OK=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(1 if d.get('ok')==True and 'Example Domain' in str(d.get('result',{}).get('title','')) else 0)" 2>/dev/null || echo "0")
check "evaluate returns ok with correct result" "$EVAL_OK"
echo ""

# 5. Navigate to a stateful page
echo "[5] Navigation to stateful page"
RESP=$(curl -s --max-time 15 -X POST "$BASE/tabs/$TAB/navigate" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER\",\"url\":\"https://httpbin.org/html\"}")
sleep 4
STATE_OK=$(curl -s --max-time 10 "$BASE/tabs/$TAB/snapshot?userId=$USER&format=text" -H "Authorization: Bearer $KEY" | python3 -c "import sys; print(1 if 'Herman Melville' in sys.stdin.read() else 0)" 2>/dev/null || echo "0")
check "navigated to httpbin.org/html" "$STATE_OK"
echo ""

# 6. Close tab
echo "[6] Session close"
RESP=$(curl -s --max-time 10 -X DELETE "$BASE/tabs/$TAB?userId=$USER" -H "Authorization: Bearer $KEY")
DELETE_OK=$(echo "$RESP" | python3 -c "import sys,json; print(1 if json.load(sys.stdin).get('ok')==True else 0)" 2>/dev/null || echo "0")
check "tab deleted" "$DELETE_OK"
sleep 3
echo ""

# 7. Persistence: new tab on same session (triggers storage state load)
echo "[7] Persistence: session reuse"
RESP=$(curl -s --max-time 15 -X POST "$BASE/tabs" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER\",\"sessionKey\":\"e2e\",\"url\":\"https://example.com\"}")
TAB2=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tabId',''))" 2>/dev/null || echo "")
check "new tab on same session created" "$([ -n "$TAB2" ] && echo 1 || echo 0)"
if [ -n "$TAB2" ]; then
  curl -s --max-time 10 -X DELETE "$BASE/tabs/$TAB2?userId=$USER" -H "Authorization: Bearer $KEY" >/dev/null
fi
echo ""

# 8. Amazon scrape test (anti-detection)
echo "[8] Amazon scrape (anti-detection)"
RESP=$(curl -s --max-time 20 -X POST "$BASE/tabs" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d "{\"userId\":\"$USER-amz\",\"sessionKey\":\"e2e\",\"url\":\"https://www.amazon.com/s?k=wireless+earbuds\"}")
TAB3=$(echo "$RESP" | python3 -c "import sys,json; print(json.load(sys.stdin).get('tabId',''))" 2>/dev/null || echo "")
sleep 6
RESP=$(curl -s --max-time 20 -X POST "$BASE/tabs/$TAB3/evaluate" \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{"userId":"'"$USER-amz"'","expression":"(() => { const items = document.querySelectorAll(\"[data-component-type=\\\"s-search-result\\\"]\"); const r = []; for (let i=0;i<Math.min(items.length,5);i++){const it=items[i];r.push({t:it.querySelector(\"h2\")?.innerText||\"\",p:it.querySelector(\".a-price .a-offscreen\")?.innerText||\"\"});} return {count:items.length,products:r}; })()"}')
AMZ_OK=$(echo "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(1 if d.get('ok')==True and d.get('result',{}).get('count',0)>=1 else 0)" 2>/dev/null || echo "0")
check "Amazon returns product data (anti-detection works)" "$AMZ_OK"
echo "$RESP" | python3 -c "
import sys,json
d=json.load(sys.stdin)
if d.get('ok'):
    r=d['result']
    print(f'  Products found: {r[\"count\"]}')
    for p in r.get('products',[]):
        print(f'    - {p[\"t\"][:60]} | {p[\"p\"]}')
" 2>/dev/null || true
if [ -n "$TAB3" ]; then
  curl -s --max-time 10 -X DELETE "$BASE/tabs/$TAB3?userId=$USER-amz" -H "Authorization: Bearer $KEY" >/dev/null
fi
echo ""

# Summary
echo "=== Results ==="
echo "PASS: $PASS / $((PASS+FAIL))"
echo "FAIL: $FAIL / $((PASS+FAIL))"
[ "$FAIL" -eq 0 ] && echo "ALL TESTS PASSED" || echo "SOME TESTS FAILED"
exit "$FAIL"
