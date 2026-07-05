# itch.io 게시 가이드 — CHIP! CHIP!

> 빌드: 저장소 루트의 `chipchip-itch.zip` (3.8MB, gitignore됨 — 재생성: LAUNCH_HANDOFF §8 참조)
> 계정: https://itch.io → Upload new project

## 업로드 설정

| 항목 | 값 |
|---|---|
| Title | **CHIP! CHIP!** |
| Project URL | `chip-chip` (또는 `chipchip`) |
| Classification | Games |
| Kind of project | **HTML** |
| Release status | Released |
| Pricing | **No payments** (무료) |
| Uploads | `chipchip-itch.zip` 업로드 → **"This file will be played in the browser"** 체크 |
| Embed options | **Viewport dimensions: 450 × 800** · ✅ Mobile friendly · ✅ Automatically start on page load(선택) · ✅ Fullscreen button |
| Orientation | Portrait |
| Genre | Action |
| Tags | `arcade`, `physics`, `one-button`, `stacking`, `hypercasual`, `highscore`, `pixel-art`, `casual`, `mobile`, `short` |
| AI generation disclosure | 해당 시 체크 (아트 제작 방식에 따라) |

## Short description (tagline)
```
Stack a tower of color with one tap. Real physics — it leans, it wobbles, it CRASHES.
```

## Description (본문 — 복붙용)
```
CHIP! CHIP! is a one-tap stacking game with REAL physics.

Color chips swing across the screen — tap to drop. Land perfectly to build
combos, climb through the skyline, past the clouds, into the stratosphere.
But every sloppy landing tilts your tower... and physics never forgives.

🏙️ 8 cities to stack in — Seoul, Tokyo, Paris, London, New York, Cairo,
   Queenstown, Mungyeong — each with hand-made pixel backdrops
🏆 Global leaderboard with unique nicknames (daily / weekly / all-time)
🔥 Perfect-landing combos, zone milestones, daily streaks
🎵 Lounge BGM + paper-craft sound effects
🌐 English & Korean

How high can you go before it all comes tumbling down?

Also playable at https://playchipchip.com (PWA — install it on your phone!)
```

## 스크린샷 (권장 5장, 630×500 이상)
1. 타이틀 (도시 선택기 보이게)
2. 서울에서 타워 10칩+ (PERFECT! 스탬프 순간)
3. 하늘/성층권 존 (밤 배경 + 별)
4. 와르르 붕괴 순간
5. 랭킹 포디움 화면
- 커버 이미지(630×500): og-image 리사이즈 또는 게임 스크린샷 + 로고

## 주의사항
- 랭킹은 프로덕션과 **같은 Supabase 보드 공유** — itch 유저도 글로벌 랭킹에 등록됨 (의도됨)
- 광고/GA4는 도메인 게이팅으로 itch에서 자동 비활성 (가짜 광고 오버레이만 동작 — 리워드는 정상 지급)
- 서비스워커는 itch에서 등록 안 됨 (prod 게이팅, 커밋 6d0811d)
- 게시 후 데브로그 1건 작성 권장 (검색 노출 + r/WebGames 포스팅 소재)
