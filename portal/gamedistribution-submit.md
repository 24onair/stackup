# GameDistribution 제출 가이드 — CHIP! CHIP!

> 어댑터: `js/gamedistribution.js` (GD_OPTIONS 감지 시 광고를 GameDistribution으로 라우팅).
> 빌드: `GD_GAME_ID=<GUID> ./build-portal.sh gamedistribution` → `chipchip-gamedistribution.zip`.
> 개발자 포털: https://developer.gamedistribution.com
>
> **발급받은 gameId (GUID): `08e7b4c3c8a94cf1bda9edd814453268`** (2026-07-06 등록, 계정 Bplaystudio/24onair)
> 재빌드: `GD_GAME_ID=08e7b4c3c8a94cf1bda9edd814453268 ./build-portal.sh gamedistribution`

## ⚠️ 순서가 중요 — gameId 먼저

GameDistribution SDK는 **게임별 gameId(GUID)**가 있어야 광고를 서빙한다. 이 ID는 **대시보드에 게임을 등록할 때 발급**된다. 그래서:

1. **먼저 developer.gamedistribution.com 에 게임 등록** → gameId(GUID) 발급받기
2. 그 ID로 **빌드** → zip 업로드

## 1단계 — 계정·게임 등록 (유저 액션)

1. https://developer.gamedistribution.com 계정 생성/로그인
2. **New Game** → 게임 정보 입력 (아래 메타데이터 복붙)
3. 등록하면 **Game ID (GUID)** 가 발급된다 (예: `a1b2c3d4-....`). 이걸 복사.
4. 게임 상세 설정에서 **REWARDED ADS 플래그를 ON** (안 켜면 리워드 광고 요청이 거부됨 — 이어하기·점수2배가 안 됨)

## 2단계 — gameId로 빌드 (Claude에게 요청 or 직접)

```bash
cd /Users/apple/Documents/AI_dev/게임
GD_GAME_ID=<발급받은-GUID> ./build-portal.sh gamedistribution
# → dist-gamedistribution/ + chipchip-gamedistribution.zip (SDK+gameId 주입됨)
```
자체 도메인 빌드(playchipchip.com)와 별개 — 이 빌드에만 GameDistribution SDK가 주입된다.
CrazyGames·AdSense·GA4·서비스워커는 도메인/호스트 게이팅으로 **자동 비활성** → GD 광고만 노출(정책 준수).

## 3단계 — 업로드·제출

1. 대시보드 게임 페이지 → **빌드 업로드**: `chipchip-gamedistribution.zip` (루트에 index.html 있음)
   - GD는 게임을 자체 호스팅(iframe 배포)한다.
2. 메타데이터·에셋 확인 → **제출** → 리뷰 대기

## 연동되어 있는 것 (코드)
- **인터스티셜**: `gdsdk.showAd()` — 결과 화면 재시작 캐던스(3→2→1판)에 게이팅 후 요청
- **리워드**: `gdsdk.showAd('rewarded')` + `SDK_REWARDED_WATCH_COMPLETE` 완주 이벤트에만 보상 → 이어하기·점수2배
- **오디오**: 광고 시작 `SDK_GAME_PAUSE`(뮤트) / 종료 `SDK_GAME_START`(언뮤트) — AudioContext 코디네이터 경유
- **프리로드**: 부팅·광고 후 `preloadAd('rewarded')`로 fill 개선

## 메타데이터 (복붙용 — CrazyGames와 공유)

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

## 재빌드 시점
`js/*` 또는 `index.html` 변경 후 제출본 갱신: `GD_GAME_ID=<GUID> ./build-portal.sh gamedistribution` 재실행 → 새 zip 업로드.
