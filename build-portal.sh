#!/usr/bin/env bash
# build-portal.sh — 웹 포털 제출용 빌드 생성 (포털별 SDK만 주입, 자체 도메인 빌드는 무손상).
#
# 사용법:
#   ./build-portal.sh                      → CrazyGames 빌드 (기본)
#   ./build-portal.sh crazygames           → CrazyGames 빌드
#   GD_GAME_ID=xxxx ./build-portal.sh gamedistribution  → GameDistribution 빌드
#
# 산출물: dist-<portal>/ 폴더 + chipchip-<portal>.zip (루트에 index.html)
# 어댑터(js/crazygames.js · js/gamedistribution.js)가 주입된 SDK를 감지해 광고를 해당 포털로 라우팅.
set -euo pipefail
cd "$(dirname "$0")"

PORTAL="${1:-crazygames}"

case "$PORTAL" in
  crazygames)
    OUT="dist-crazygames"; ZIP="chipchip-crazygames.zip"
    # CrazyGames SDK v3 — matter-js 직전에 스크립트 1줄 주입
    INJECT='  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>'
    GUARD='crazygames-sdk'
    ;;
  gamedistribution|gd)
    OUT="dist-gamedistribution"; ZIP="chipchip-gamedistribution.zip"
    GID="${GD_GAME_ID:-REPLACE_WITH_GD_GAME_ID}"
    # GameDistribution: GD_OPTIONS(게임ID·이벤트→__gdOnEvent 위임) + SDK 로더 주입
    INJECT='  <script>
    window.GD_OPTIONS = {
      gameId: "'"$GID"'",
      onEvent: function (e) { (window.__gdOnEvent || function () {})(e); }
    };
    (function (d, s, id) {
      var js, fjs = d.getElementsByTagName(s)[0];
      if (d.getElementById(id)) return;
      js = d.createElement(s); js.id = id;
      js.src = "https://html5.api.gamedistribution.com/main.min.js";
      fjs.parentNode.insertBefore(js, fjs);
    }(document, "script", "gamedistribution-jssdk"));
  </script>'
    GUARD='gamedistribution-jssdk'
    if [ "$GID" = "REPLACE_WITH_GD_GAME_ID" ]; then
      echo "⚠️  GD_GAME_ID 미설정 — 플레이스홀더로 빌드함(로컬 테스트용)."
      echo "    제출용은: GD_GAME_ID=<대시보드에서 발급받은 GUID> ./build-portal.sh gamedistribution"
    fi
    ;;
  *)
    echo "알 수 없는 포털: $PORTAL  (crazygames | gamedistribution)"; exit 1 ;;
esac

rm -rf "$OUT" "$ZIP"
mkdir -p "$OUT"

# 런타임에 필요한 것만 복사 (문서·인프라·SW·SEO 파일 제외)
cp -R index.html privacy.html about.html how-to-play.html manifest.json js assets audio "$OUT/"

# index.html에 포털 SDK 주입 (matter-js 로드 직전 — main.js 모듈보다 먼저)
python3 - "$OUT/index.html" "$INJECT" "$GUARD" <<'PY'
import sys
path, inject, guard = sys.argv[1], sys.argv[2], sys.argv[3]
html = open(path, encoding='utf-8').read()
marker = '  <script src="https://cdnjs.cloudflare.com/ajax/libs/matter-js'
assert marker in html, 'matter-js script tag not found — build marker changed?'
assert guard not in html, 'SDK already injected?'
html = html.replace(marker, inject + '\n' + marker, 1)
open(path, 'w', encoding='utf-8').write(html)
print('injected', guard, 'into', path)
PY

# 제출용 zip (dist 내부 기준 — 루트에 index.html이 오도록)
( cd "$OUT" && zip -r -q "../$ZIP" . -x "*.DS_Store" )

echo "빌드 완료 ($PORTAL):"
echo "  폴더: $OUT/"
echo "  zip : $ZIP ($(du -h "$ZIP" | cut -f1))"
echo "  SDK 주입 확인: $(grep -c "$GUARD" "$OUT/index.html") 개"
