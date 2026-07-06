# CrazyGames 제출 가이드 — CHIP! CHIP!

> 빌드: `./build-portal.sh` → 루트에 `chipchip-crazygames.zip` (3.8MB) 생성 (gitignore됨).
> 개발자 포털: https://developer.crazygames.com

## 빌드 만들기
```bash
cd /Users/apple/Documents/AI_dev/게임
./build-portal.sh
# → dist-crazygames/ (SDK 주입된 빌드) + chipchip-crazygames.zip
```
자체 도메인 빌드(playchipchip.com)와 별개 — 이 빌드에만 CrazyGames SDK v3가 주입됨.
어댑터: `js/crazygames.js` (SDK 감지 시 광고를 CrazyGames로 라우팅).

## 제출 절차
1. https://developer.crazygames.com 계정 생성 → **Submit a game**
2. **HTML5** 선택 → `chipchip-crazygames.zip` 업로드 (루트에 index.html 있음 — 확인됨)
3. CrazyGames **QA Tool**이 자동으로 SDK 연동을 점검한다. 통과 항목(이미 구현됨):
   - `SDK.init()` 호출 ✅
   - `gameplayStart()` / `gameplayStop()` — 런 시작·게임오버·이어하기에 발화 ✅
   - `loadingStop()` — 부팅 완료 시 ✅
   - 리워드/미드게임 광고 `requestAd` — 결과 화면 점수2배·이어하기·재시작 ✅
   - 광고 중 오디오 뮤트(AudioContext suspend) ✅
4. 메타데이터 입력 (아래)
5. 스크린샷·커버 업로드 → 제출 → 리뷰 대기

## 메타데이터 (복붙용)

**Title:** CHIP! CHIP!

**Short description:**
```
Stack a tower of color with one tap. Real physics — it leans, it wobbles, it CRASHES.
```

**Description:**
```
CHIP! CHIP! is a one-tap stacking game with REAL physics. Color chips swing across the
screen — tap to drop. Land perfectly to build combos, climb through the skyline, past the
clouds, into the stratosphere. Every sloppy landing tilts your tower... and physics never
forgives.

• 8 cities with hand-made pixel backdrops (Seoul, Tokyo, Paris, London, New York, Cairo,
  Queenstown, Mungyeong)
• Global leaderboard — daily, weekly, all-time
• Perfect-landing combos, altitude zones, daily streaks
• Watch-ad Continue & Double-score
• English & Korean

How high can you go before it all comes tumbling down?
```

**Controls (for the game page):**
```
Tap / click anywhere to drop the chip. That's the only control.
```

**Category:** Casual / Arcade
**Tags:** stacking, physics, one-button, hypercasual, highscore, pixel-art, arcade, casual, mobile
**Orientation:** Portrait · Mobile friendly: Yes
**Screenshots:** 타이틀(도시 선택) · 서울 타워+PERFECT · 하늘/성층권 · 와르르 붕괴 · 랭킹 포디움

## 주의 / 정책
- CrazyGames 빌드에선 **AdSense·GA4·서비스워커 모두 자동 비활성**(도메인/호스트 게이팅) → CrazyGames 광고만 노출. 정책 준수됨.
- 랭킹은 프로덕션과 **같은 Supabase 보드 공유** (글로벌 통합 랭킹, 의도됨).
- **2개월 독점(exclusive)** 옵션 시 수익 셰어 +50% — 초기엔 검토 가치 있음(트래픽 대비).
- 광고 빈도: 현재 미드게임은 자체 캐던스(3→2→1판)로 게이팅 후 CrazyGames에 요청 → CrazyGames가 최종 노출 결정. 리워드는 유저 자발.

## 재빌드 시점
`js/*` 또는 `index.html` 변경 후 제출본 갱신하려면 `./build-portal.sh` 재실행 → 새 zip 업로드.
