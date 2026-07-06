#!/usr/bin/env bash
# build-portal.sh — CrazyGames 제출용 빌드 생성.
# 자체 도메인 빌드는 그대로 두고, 이 빌드에만 CrazyGames SDK 스크립트를 주입한다.
# (crazygames.js 어댑터가 SDK 존재를 감지해 활성화 → 광고를 CrazyGames로 라우팅.)
#
# 사용법:  ./build-portal.sh   →  dist-crazygames/ 및 chipchip-crazygames.zip 생성
set -euo pipefail
cd "$(dirname "$0")"

OUT="dist-crazygames"
SDK_TAG='  <script src="https://sdk.crazygames.com/crazygames-sdk-v3.js"></script>'

rm -rf "$OUT" chipchip-crazygames.zip
mkdir -p "$OUT"

# 런타임에 필요한 것만 복사 (문서·인프라·SW·SEO 파일 제외)
cp -R index.html privacy.html about.html how-to-play.html manifest.json js assets audio "$OUT/"

# index.html에 CrazyGames SDK 스크립트 주입 (matter-js 로드 직전 — main.js 모듈보다 먼저)
python3 - "$OUT/index.html" "$SDK_TAG" <<'PY'
import sys
path, tag = sys.argv[1], sys.argv[2]
html = open(path, encoding='utf-8').read()
marker = '  <script src="https://cdnjs.cloudflare.com/ajax/libs/matter-js'
assert marker in html, 'matter-js script tag not found — build marker changed?'
assert 'crazygames-sdk' not in html, 'SDK already injected?'
html = html.replace(marker, tag + '\n' + marker, 1)
open(path, 'w', encoding='utf-8').write(html)
print('injected CrazyGames SDK into', path)
PY

# 제출용 zip (dist 내부 기준으로 압축 — 루트에 index.html이 오도록)
( cd "$OUT" && zip -r -q ../chipchip-crazygames.zip . -x "*.DS_Store" )

echo "빌드 완료:"
echo "  폴더: $OUT/"
echo "  zip : chipchip-crazygames.zip ($(du -h chipchip-crazygames.zip | cut -f1))"
echo "  SDK 주입 확인: $(grep -c crazygames-sdk "$OUT/index.html") 개"
