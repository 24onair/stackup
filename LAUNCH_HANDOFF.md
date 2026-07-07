# CHIP! CHIP! 론칭 핸드오프 — 배포·마케팅·수익화 현황과 계획

> 다른 채팅/세션에서 이어받기 위한 통합 요약. 2026-07-05 기준.
> 상세 게임 설계는 `GAME_PLAN.md`, 원본 실행 계획은 `~/.claude/plans/kind-wishing-aurora.md`.

---

## 1. 프로젝트 한 줄 요약

**CHIP! CHIP! 칩칩!** — 한 번의 터치로 쌓는 컬러의 탑. Matter.js 실물리 원버튼 스태킹 하이퍼캐주얼 HTML5 게임.
- 라이브: **https://playchipchip.com** (GitHub Pages + Actions 자동배포, main 푸시 = 즉시 프로덕션)
- 저장소 위치: `/Users/apple/Documents/AI_dev/게임`

## 2. 확정된 전략 결정사항 (사용자 승인)

| 항목 | 결정 |
|---|---|
| 마케팅 예산 | **월 10만원** (오가닉 주력, 성과 클립만 TikTok 부스트 — 주 2.5만원 분할) |
| 타깃 시장 | **글로벌 우선** (Tier-1 eCPM이 한국의 3~5배, 영어 i18n 완비) |
| 플랫폼 범위 | **웹 우선** — 앱(Capacitor+AdMob)은 D1 리텐션 25%+ **그리고** DAU 500+ 달성 시에만 착수 |

## 3. 수익화 — 3중 트랙

```
트랙 A: 자체 도메인 + AdSense H5   → 수익 100% 내 것 (진행 중 — 아래 §4)
트랙 B: 글로벌 웹 포털             → 트래픽 무료 공급, 수익 셰어 (미착수)
트랙 C: 앱스토어 (Capacitor+AdMob) → KPI 게이트 통과 시에만
```

- 배너 광고는 사용 안 함(제품 정체성 보호). 인터스티셜 캐던스: 3판→2판→매판(1시간 휴식 시 리셋), 리워드 직후 10초 제외 — 모두 `js/ads.js`에 구현 완료.
- IAP(출시 후): 광고 제거 $2.99, 컬러 테마팩 $0.99.
- 현실적 전망: DAU 1,000 · 인터스티셜 3회/인 · eCPM $4 ≈ $12/일(~월 50만원). 초기 1~2개월은 월 수만 원 수준이 정상, 포털 피처링이 변곡점.

## 4. AdSense 현황 — ⚠️ 2단계 구분 (중요)

**두 개의 별개 승인이 필요하다:**

1. **사이트 승인** (AdSense → Sites 화면): playchipchip.com **"Getting ready"(심사 중)**, ads.txt **Authorized** ✅ (2026-07-05 확인). "Ready" 될 때까지 대기.
2. **H5 Games Ads 프로그램** (별도 신청): 사이트가 Ready 되면 https://adsense.google.com/start/h5-games-ads/ 폼으로 신청. 게임 내 전면·보상형 광고(Ad Placement API `adBreak`)는 이 승인이 있어야 실제 게재.

**승인 후 할 일**: `js/ads.js` L30 `ADS_LIVE = false` → `true` 한 줄 변경 후 배포. (코드는 이미 Ad Placement API 기반으로 완성 — pub ID `ca-pub-1737192970081110`)

- 디버그: `?adtest`(테스트 광고), `?realads`(비프로덕션 실광고), `?noads`(광고 끔)
- 참고: 24onair.com(별도 사이트)은 ads.txt Not found 상태 — 수익화하려면 루트에 ads.txt 필요.

## 5. 웹 포털 제출 계획 (트랙 B — 다음 단계)

| 순서 | 포털 | 핵심 |
|---|---|---|
| 1 | **CrazyGames** | 월 5,000만 유저, 자유 제출, HTML5 SDK 통합 필요, IAP 70/30 |
| 2 | **itch.io** | 심사 없음, 즉시 게시 — 피드백·백링크용 |
| 3 | **GameDistribution / GameMonetize** | 제휴 사이트 수백 곳 롱테일 확산 |
| 4 | **Poki** | 최고 난도 큐레이션(500명 중 25%가 3분+ 플레이). **초기 다운로드 8MB 제한** → 오디오(~4MB) 지연 로드 필요할 수 있음. 개발자 포털 무료 플레이테스트만 먼저 활용 가능(게시 의무 없음) |

**기술 포인트**: 게임은 `js/ads.js` 인터페이스(`showRewarded/showInterstitial/canShowInterstitial`)만 호출하도록 격리되어 있음 → 포털 제출 시 이 파일만 포털 SDK 어댑터로 교체. 포털 빌드는 AdSense 대신 **포털 SDK 광고 필수**(정책). Supabase 랭킹·GA4의 도메인 체크가 포털 도메인에서도 의도대로 동작하는지 확인 필요 (`js/analytics.js`의 PROD_HOSTS는 의도적으로 프로덕션 전용 — 포털 데이터 오염 방지).

## 6. 마케팅 계획 (월 10만원)

**오가닉 (주력, 0원):**
- 쇼트폼: TikTok·YouTube Shorts·Instagram Reels — 니어미스/붕괴/컬러 타워 클립 주 2~3회, 영어 자막, 끝에 playchipchip.com
- Reddit(r/WebGames, r/IndieGaming, r/playmygame — 자기홍보 규칙 준수), Hacker News "Show HN", itch.io 데브로그, 디스코드 인디 서버
- 국내 보조: 카카오톡 공유(인앱 최적화 완료), 커뮤니티 가벼운 소개
- 재방문 훅: 일간/주간 랭킹 + 데일리 스트릭 (구현 완료)

**유료 (월 10만원):** 성과 좋은 오가닉 클립 1~2개만 TikTok Spark Ads 부스트, 주 2.5만원 분할. GA4 UTM으로 채널별 D1 리텐션 비교 후 되는 채널만 유지.

**UTM 컨벤션**: `?utm_source=tiktok|reddit|crazygames|share|pwa&utm_medium=social|portal` (공유 버튼과 PWA start_url에는 이미 적용됨)

**KPI 게이트 (첫 30일):** D1 리텐션 35%+ · 평균 세션 4분+ · 리워드 시청률 25%+ · 공유율 세션당 1%+

## 7. 완료된 작업 (이 세션, 커밋 `093c125` — 배포됨)

- **SEO/공유**: meta description, OG/Twitter Card, canonical, hreflang(ko/en), JSON-LD(VideoGame), `robots.txt`, `sitemap.xml`
- **브랜드 이미지**: `assets/og-image.png`(1200×630) + 아이콘 512/192/180 — 칩칩 스타일(하드섀도·INK 외곽선), SVG→Chrome 헤드리스 렌더로 제작
- **PWA**: `manifest.json` + `sw.js` (HTML/JS network-first, 이미지/오디오 cache-first, 광고·분석 크로스오리진 미개입, https에서만 등록)
- **계측**: 공유 URL UTM + `share_click`, `phase_reached`(런당 1회), `game_start`에 `total_runs`(첫 플레이 세그먼트). 기존 이벤트: `game_over`(높이 분포 포함)·`new_best`·`revive`·`ad_impression`·`ad_reward_complete`
- 검증: 메타/파일 서빙/게임 부팅/이벤트 발화/콘솔 무에러 확인. (참고: 백그라운드 탭에서 게임 완전 정지는 의도된 설계 — main.js:110)

이후 다른 세션에서 추가됨: 랭킹 v2(유니크 닉네임+제출 보안, `a70ad83`), 문경 스테이지(`6373bb6`).

## 8. 다음 액션 체크리스트 (2026-07-05 갱신)

**트랙 A — AdSense (대기 중, 유저 액션):**
- [ ] **AdSense 사이트 승인 대기** — 2026-07-05 현재 여전히 "Getting ready". "Ready" 전환 시 알릴 것
- [ ] Ready 후 **H5 Games Ads 신청** (전용 폼: https://adsense.google.com/start/h5-games-ads/)
- [ ] H5 승인 후 **`js/ads.js` ADS_LIVE=true** 배포 → `?adtest`로 사전 검증 (메모리 flip-ads-live-after-approval)
- [ ] **2026-07-07 이후 Supabase A-2 잠금 SQL 실행** (scores 직접 INSERT 차단 — 메모리 run-sql-a2-lockdown, `supabase/leaderboard_v2.sql` 하단 주석 블록)

**트랙 B — 포털 (진행 중):**
- [ ] **포털 공통 사전작업** ← 다음 작업
  - [ ] SW 등록을 프로덕션 도메인으로 게이팅 (현재 모든 https에서 등록됨, index.html:398 — 포털 임베드 오염 방지)
  - [ ] BGM 압축 (audio/ 2.5MB — Poki 초기 8MB 제한 대비, 앰비언스는 이미 압축됨 08140ca)
- [x] **itch.io 게시 완료** ✅ (2026-07-07 공개) — `chipchip-itch.zip` + 스크린샷 4장 업로드, HTML(브라우저 플레이) 프로젝트로 **PUBLISHED**. 계정 bplaystudio. 뷰포트 450×800·Mobile friendly·Portrait. 태그 10종(arcade/physics/one-button/stacking/hypercasual/highscore/pixel-art/casual/mobile/short). 상태: **공개 라이브**. 후속: 런칭 데브로그 1건(초안 작성됨) + r/WebGames 홍보. (가이드: `portal/itch-listing.md`)
- [x] **CrazyGames SDK v3 통합 + 제출 완료** ✅ (2026-07-06 제출) — `js/crazygames.js` 어댑터 + `build-portal.sh` + muteAudio 코디네이터(`be759da`). QA Tool 필수 체크(Gameplay/Loading Start·Stop) 전부 초록. 광고는 Preview/basic-tournament 모드에서 비활성이라 심사팀이 실인벤토리로 검증. **상태: In review** → developer.crazygames.com → My Games에서 추적. 수정요청 시 `./build-portal.sh` 재빌드 → Submit a game update. (가이드: `portal/crazygames-submit.md`)
  - 알려진 경미 버그: 6칩 등 동결 base 없는 작은 탑 붕괴 시 이어하기 버튼 무반응 경계 케이스(제출 무관, 후속 수정 예정)
- [x] **GameDistribution SDK 통합 + 제출 완료** ✅ (2026-07-07 제출) — GD HTML5 SDK 어댑터(`js/gamedistribution.js`) + `build-portal.sh gamedistribution` (`756b8c3`). 게임 등록(gameId `08e7b4c3c8a94cf1bda9edd814453268`, 계정 Bplaystudio/24onair), zip 업로드 → **SDK 검증 통과(SDK: Yes, Rewarded Ads 자동 체크)** → 에셋 5종(gd-assets/) 업로드 → 활성화 요청. **상태: In Review**. developer.gamedistribution.com → Games에서 추적. 에셋: 필수 512×384·512×512·200×120 + 마케팅 1280×720·1280×550. (가이드: `portal/gamedistribution-submit.md`)
- [~] **GameMonetize — 코드 통합 완료, gameId 대기** — GM HTML5 SDK 어댑터(`js/gamemonetize.js`, GD 동형: `SDK_OPTIONS`/`window.sdk`/`showBanner()`) + `build-portal.sh gamemonetize` 완료. 플레이스홀더 빌드로 부팅·어댑터 활성·SDK 로드·무크래시 검증됨(로컬). **다음: gamemonetize.com에서 게임 등록 → gameId 발급 → `GM_GAME_ID=<GUID> ./build-portal.sh gamemonetize` → zip 업로드(에셋 gd-assets 재사용) → 제출.** 리워드 플래그 ON 필수. (가이드: `portal/gamemonetize-submit.md`)
- [ ] Poki 플레이테스트 업로드 (Poki는 8MB 대비 오디오 지연 로드 검토)

**트랙 마케팅 (유저 액션):**
- [ ] 쇼트폼 채널 개설 + 주 2~3회 업로드 시작, Reddit(r/WebGames 등)/Show HN 포스팅
- [ ] GA4에서 채널별 D1 리텐션 비교 → 유료 부스트 판단
- [ ] KPI 게이트(D1 25%+ & DAU 500+) 달성 시 Capacitor 앱 착수
- [ ] (선택) 24onair.com ads.txt 추가

**완료됨 (기록):**
- [x] 도메인 연결 + ads.txt + HTTPS (731084c) · AdSense 사이트 추가·심사 신청
- [x] i18n(ko/en) · AdSense H5 코드(ADS_LIVE 스위치) · GA4 · 리워드 2종 (0297c64)
- [x] 이어하기 "잔해 위" 재설계 (f4680ed) · 랭킹 열림 버튼 겹침 수정 (ccbdf25)
- [x] 랭킹 v2: 유니크 닉네임 선점 + 제출 보안, Supabase A-1 실행됨 (a70ad83)
- [x] SEO/OG/PWA(manifest+sw.js)/UTM/GA4 퍼널 이벤트 (093c125)
- [x] 문경 스테이지 (6373bb6) · 앰비언스 압축 5.4→1.4MB (08140ca)

## 9. 주요 파일 맵

| 파일 | 역할 |
|---|---|
| `js/ads.js` | 광고 전부 — ADS_LIVE 스위치(L30), 캐던스, 폴백, 포털 어댑터 교체 지점 |
| `js/analytics.js` | GA4 (G-RE4HV9B51W, 프로덕션 도메인만), `window.__analytics.recent()` QA 버퍼 |
| `js/leaderboard.js` | Supabase 랭킹 (키 미설정 시 자동 숨김) |
| `js/i18n.js` | ko/en |
| `manifest.json` / `sw.js` | PWA |
| `ads.txt` / `robots.txt` / `sitemap.xml` | 도메인 인프라 |
| `GAME_PLAN.md` | 게임 설계서 전체 (물리·난이도·수익화 §8·KPI §10·로드맵 §11) |
| `.github/workflows/pages.yml` | main 푸시 → Pages 자동배포 (루트 `CNAME` 필수 — 없으면 도메인 풀림) |

## 10. 주차별 타임라인

| 주차 | 작업 |
|---|---|
| 1주 | ✅ Phase 0 (SEO/PWA/공유/이벤트) 완료 · AdSense 심사 진행 중 |
| 2주 | itch.io 게시 + CrazyGames SDK 통합·제출 + 쇼트폼 시작 |
| 3~4주 | GameDistribution 제출 + Poki 플레이테스트 + Reddit/HN + 유료 부스트 테스트 |
| 5주~ | 데이터 기반 밸런스 튜닝, KPI 게이트 평가, (달성 시) Capacitor 착수 |
