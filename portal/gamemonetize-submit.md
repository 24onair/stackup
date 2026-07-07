# GameMonetize 제출 가이드 — CHIP! CHIP!

> 어댑터: `js/gamemonetize.js` (SDK_OPTIONS 감지 시 광고를 GameMonetize로 라우팅).
> 빌드: `GM_GAME_ID=<GUID> ./build-portal.sh gamemonetize` → `chipchip-gamemonetize.zip`.
> 개발자 포털: https://gamemonetize.com/dashboard
>
> **gameId (GUID): `______________________`** ← 발급받으면 여기 기록
> 재빌드: `GM_GAME_ID=<GUID> ./build-portal.sh gamemonetize`

## 성격 — GameDistribution과 같은 계보
GameMonetize는 GD와 동형의 HTML5 애그리게이터다. SDK도 거의 판박이라 어댑터가 GD 복사본
수준이다. 다른 점만: 전역이 `GD_OPTIONS/gdsdk` → **`SDK_OPTIONS/window.sdk`**, 인터스티셜
호출이 `showAd()` → **`showBanner()`**, SDK URL이 `api.gamemonetize.com/sdk.js`.
심사는 GD보다 느슨한 편(승인 빠름), eCPM은 낮은 편(롱테일 노출 채널).

## ⚠️ 순서 — gameId 먼저
GameMonetize SDK는 게임별 gameId(GUID)가 있어야 광고를 서빙한다. 대시보드 등록 시 발급된다.
1. **gamemonetize.com/dashboard 에 게임 등록** → gameId(GUID) 발급
2. 그 ID로 **빌드** → zip 업로드

## 1단계 — 계정·게임 등록 (유저 액션)
1. https://gamemonetize.com → 회원가입/로그인 → Dashboard
2. **Add New Game** → 아래 메타데이터 복붙
3. 등록하면 **Game ID (GUID)** 발급 → 복사해 위에 기록
4. 게임 설정에서 **REWARDED ADS 플래그 ON** (안 켜면 리워드 광고 거부 → 이어하기·점수2배 안 됨)

## 2단계 — gameId로 빌드
```bash
cd /Users/apple/Documents/AI_dev/게임
GM_GAME_ID=<발급받은-GUID> ./build-portal.sh gamemonetize
# → dist-gamemonetize/ + chipchip-gamemonetize.zip (SDK+gameId 주입됨)
```
자체 도메인·CrazyGames·GD·itch 빌드와 별개 — 이 빌드에만 GameMonetize SDK가 주입된다.
AdSense·GA4·CrazyGames·GD·서비스워커는 게이팅으로 자동 비활성 → GameMonetize 광고만 노출(정책 준수).

## 3단계 — 업로드·제출
1. 대시보드 게임 페이지 → 빌드 업로드: **`chipchip-gamemonetize.zip`** (루트에 index.html)
   - GameMonetize가 자체 호스팅(iframe 배포).
2. 에셋 업로드 — **이미 만든 `gd-assets/` 재사용 가능** (썸네일 512×512 등 규격 공유되는 경우 많음. 요구 규격은 대시보드 확인)
3. 메타데이터 확인 → 제출 → 리뷰 대기

## 연동되어 있는 것 (코드)
- **인터스티셜**: `sdk.showBanner()` — 결과 화면 재시작 캐던스(3→2→1판)에 게이팅 후 요청
- **리워드**: 완주 이벤트 `SDK_REWARDED_WATCH_COMPLETE`에만 보상 → 이어하기·점수2배.
  광고 호출 메서드는 SDK 변형 대비 자동 감지(`showRewarded`/`showAd`/`showBanner('rewarded')`).
- **오디오**: 광고 시작 `SDK_GAME_PAUSE`(뮤트) / 종료 `SDK_GAME_START`(언뮤트) — AudioContext 코디네이터 경유
- **안전망**: 완료 신호가 이벤트·프로미스·타임아웃(인터 30s / 리워드 120s) 3중 → 어떤 변형에서도 게임 흐름 안 멈춤

## 메타데이터 (복붙용 — CrazyGames·GD와 공유)
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
```

**Controls:** Tap / click anywhere to drop the chip. That's the only control.
**Category:** Casual / Arcade   **Orientation:** Portrait · Mobile: Yes
**Tags:** stacking, physics, one-button, hypercasual, highscore, pixel-art, arcade, casual, mobile

## 주의 / 정책
- 랭킹은 프로덕션과 **같은 Supabase 보드 공유**(글로벌 통합, 의도됨).
- 로컬에서 gameId 없이(플레이스홀더) 빌드하면 리워드 광고가 안 떠 이어하기가 dismiss된다 — 정상. 실 gameId + 리워드 플래그 필요.
- 리워드 광고 실제 동작은 GD와 마찬가지로 **대시보드/실인벤토리 환경**에서만 검증됨 (로컬 플레이스홀더 빌드는 어댑터 활성·무크래시까지만 확인 완료).

## 재빌드 시점
`js/*` 또는 `index.html` 변경 후 제출본 갱신: `GM_GAME_ID=<GUID> ./build-portal.sh gamemonetize` 재실행 → 새 zip 업로드.
