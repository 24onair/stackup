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
- **광고 호출**: GameMonetize SDK는 `sdk.showBanner()` **하나뿐**(showRewarded/showAd 없음). 인터스티셜·리워드 모두 이걸로 요청.
- **⚠️ 리워드 완주 신호는 `COMPLETE`** — GameMonetize는 GD의 `SDK_REWARDED_WATCH_COMPLETE`를 **쓰지 않고** IMA/VAST 이벤트(`STARTED→FIRST_QUARTILE→MIDPOINT→THIRD_QUARTILE→COMPLETE`)를 낸다. 그래서 **`COMPLETE` 이벤트에만 보상 지급**(이어하기·점수2배). 스킵/무필이면 COMPLETE 없이 `SDK_GAME_START`만 와서 보상 없이 종료.
  - (이 사실을 실측으로 확인: `dist-gamemonetize` 로컬 빌드에서 광고가 실제로 서빙돼 위 이벤트 시퀀스 관측 → `COMPLETE`→이어하기 복귀·점수 보존·에러 0 검증)
- **오디오**: 광고 시작 `SDK_GAME_PAUSE`(뮤트) / 종료 `SDK_GAME_START`(언뮤트) — AudioContext 코디네이터 경유
- **안전망**: 완료 신호가 이벤트·타임아웃(인터 30s / 리워드 120s) 이중 → SDK 무응답에도 게임 흐름 안 멈춤

> 참고 — 대시보드 **Verify SDK 샌드박스**에서는 테스트 광고 후 게임 iframe이 리셋(타이틀로)될 수 있음. 이는 검증 하네스 동작이며, 실제 배포/우리 빌드에서는 위처럼 이어하기로 정상 복귀함(검증 완료).

## ⚠️ 광고 타이밍·필레이트 실측 (중요)
- **광고 로드~시작에 ~10초** 걸림(실측: 클릭→SDK_GAME_PAUSE ≈ 10s). 클릭 직후 아무 일도 없어 보여도 정상 — 잠시 뒤 광고가 뜬다. 이 때문에 "더블스코어 눌러도 광고 안 나온다"처럼 보일 수 있음(실은 로딩 중이거나 무필).
- **무필(no-fill) 시 이벤트가 하나도 안 옴**(완전 침묵). 그래서 어댑터에 **시작 워치독(15s)** 을 둬서 15s 내 광고가 시작 안 되면 보상 없이 버튼을 복원(기존 120s 방치 방지). *ERROR* 이벤트는 즉시 처리.
- 무필은 인벤토리·빈도제한 문제라 **버그 아님**. 실트래픽에선 필레이트가 개선됨. 연속 요청(이어하기 직후 더블) 시 두 번째가 무필날 확률이 높음.
- 워치독 15s는 실측 시작지연(~10s)보다 넉넉해 **정상 광고를 조기 종료하지 않음**(광고 시작=SDK_GAME_PAUSE 시 started 플래그로 워치독 해제).
- (후속 UX 제안: 리워드 요청~광고 시작까지 "광고 불러오는 중…" 인디케이터 표시 — main.js/전 포털 공통.)

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
