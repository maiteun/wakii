# wakii — 작업 인수인계 (다음 세션용)

_최종 업데이트: 2026-06-30._ 다음 세션 시작할 때 이 파일을 읽어달라고 하면 돼요. 예:
> "docs/HANDOFF.md 읽고 이어서 작업하자."

## 프로젝트 개요
- **wakii** — 가족이 사진(짤)을 올리고 반응/답장하며 함께 걷는 모바일 웹앱.
- 스택: **Next.js 14 (App Router) · React 18 · TypeScript · 순수 CSS(globals.css)**.
- 디자인 원본: `docs/khux-prototype-full.html` (이걸 React로 포팅한 게 시작점).
- GitHub: **maiteun/wakii** (`main` 브랜치). 배포: **https://wakii-tau.vercel.app** (Vercel, push 시 자동 배포).

## 백엔드 (Supabase)
- 프로젝트 URL: `https://urdstxneciyimpuakpmi.supabase.co` (publishable key는 `.env.local` / Vercel env에 있음).
- 키 없으면 자동으로 **localStorage 목업 모드**로 동작 (`src/lib/supabase.ts`의 `hasSupabase`).
- **실행된 SQL**: `supabase/schema.sql`(decks·cards·reactions + photos 버킷 + realtime), `supabase/storage.sql`(photos public read/open write/**open delete** 정책 — delete 정책은 2026-06-30 실행해 사진 삭제 가능).
- ⚠️ **아직 실행 안 한 SQL**: **`supabase/groups.sql`** — 그룹(참여코드) 테이블. 이걸 돌려야 그룹이 기기 간 공유됨. (지금은 코드에 폴백이 있어 안 돌려도 온보딩 플로우는 로컬 목업으로 진행됨.)

## 핵심 파일
- `src/components/WakiiApp.tsx` — **메인**(거의 모든 화면/상태). 온보딩, 홈, 방, 워키(걸음), 마이.
- `src/components/PhotoEditor.tsx` — 촬영 후 풀 에디터(스티커/그림/텍스트/음성 + 시간·날씨 스티커). 답장에 사용.
- `src/components/InstantCapture.tsx` — 즉석 반응 촬영(원형, 수정불가, 이모지 배지).
- `src/components/CircularGallery.jsx` — 덱 펼침 WebGL 갤러리(ogl). `loop={false}`로 최신→작성자 바운드.
- `src/lib/{supabase,db,types}.ts` — 클라이언트 / 데이터레이어 / 타입. `src/lib/courses.ts`(코스 11종), `src/lib/houses.ts`(우리집 8종).
- `src/app/globals.css` — 전체 스타일. `src/app/layout.tsx` — PWA 메타. `src/app/manifest.ts` + `icon-*.png/route.tsx`.
- `public/assets/` — `home_bg.svg`(홈 밤하늘), `wakii_logo.svg`(워드마크), `mapbg.png`(워키 맵 배경), `cloud.png`(구름), `empty_island.png`(미달성 섬), `house/<id>.png`(집 8종), `courses/<id>.png`(코스 11종).

## 구현된 기능
- **온보딩**: 로그인 화면(카카오/네이버/구글/Apple 버튼 — UI만, OAuth 미연동) → 이름 입력 → 그룹 만들기 / 참여 → 홈.
  - **초대는 링크 공유 방식**: 그룹 만들면 `💌 카카오톡으로 초대하기`(Web Share API `navigator.share` → 폰 공유시트에서 카톡 선택, 데스크톱은 링크 복사 폴백). 참여 코드는 작은 폴백으로만 노출.
  - **초대 링크로 자동 참여**: `/?j=CODE`로 접속하면 코드 입력 없이 자동 참여. 이름 있으면 즉시 참여→홈, 신규면 로그인→이름→자동 참여(카카오 OAuth 붙으면 이름 단계 생략 예정). URL 파라미터는 참여 후 제거.
  - 홈 그룹 목록은 코드 대신 `💌 가족 초대하기`(탭하면 그 그룹 초대 링크 공유)로 표시.
  - **데모 백도어**: 참여 코드 `1234`는 백엔드 상태와 무관하게 항상 `우리 가족`으로 참여 (`src/lib/db.ts`의 `joinGroup`).
- **홈 (Figma 프레임 302:2583에 맞춤, 다크)**: 배경=`home_bg.svg`(검정→#2B3D68 그라데이션+블루 노이즈), 좌상단 `wakii_logo.svg` 워드마크 + 우상단 걸음수. **미션 배너=상단 글래스 카드**(white .10 + 3px white .30, r30). 가운데 **떠 있는 집 섬**(`househero` 322×366). 하단 **글래스 그라데이션 시트**(white .20→.12→0, rounded-top 30, 음수 마진으로 집이 시트 위에 얹힘)에 그룹 목록(라이트 텍스트·원형 아바타).
  - **우리 집**: `src/lib/houses.ts`(8종). 온보딩에 "우리 집 고르기" 단계(이름 다음). 홈에서 집을 **길게 탭→ "우리 집 바꾸기" 시트**로 변경. `wakii.house`에 영속(기본 white_cottage).
- **방**: 채팅형(최신 아래, 위로 스크롤). 덱=겹친 카드, 탭하면 CircularGallery. 카드 밑 작성자 이름. 미션 덱=파란 네온+"오늘의 풍경" 푸터.
- **반응/답장**: 🙂 반응 → 이모지 한 줄 + 💬텍스트. 이모지 짧게=버블 와르르(저장), 길게=**즉석 원형 사진 반응(전면 카메라·1.3배 미러, 저장 안 함)**. 텍스트 짧게=10자 입력, 길게=AI 추천 멘트(와르르). 📷 답장=풀 에디터→덱에 카드 저장. 사진 **길게 탭=원본 보기**. 반응은 `recordReaction`으로 로컬 덱 상태에도 즉시 기록(재진입 시 재생·목업 영속).
- **사진 내리기**: 덱 갤러리에서 **내 글(cards[0].mine)일 때만 `🗑 내리기`** → 확인 후 `deleteDeck`(decks 삭제 cascade로 cards/reactions + Storage 사진 제거). 목업은 로컬 상태에서 제거.
- **워키(걸음) — 코스 시스템 (A 구조)**: 코스 1개 = 랜드마크 1개(실측 15~20km대), 한 번에 1개만 진행, 가족 걸음 합산 공동 진행, 완주(100%) 시 0으로 리셋, 모든 코스 영구 재선택 가능.
  - 데이터: `src/lib/courses.ts`(11개 코스 id/이름/distance_km/steps/ar). 이미지 `public/assets/courses/<id>.png`, `courseImg(id)`로 매핑. **11개 전부 이미지 보유**(angkor_wat 포함). `ar`=height/width로 맵에서 폭 고정(132). steps는 1km=1,350보 임시 환산(확정 시 일괄 교체).
  - 화면: 가족 아바타 행 → 완주 뱃지 모음 → **현재 코스 배너**(썸네일·목표/함께 km·진행률%, 100%면 배너 안에 `🏁 완주! 새 목표 고르기 →` 버튼 → 코스 선택 시트) → **지도형 경로 맵**(드래그 패닝+휠/핀치 줌+＋－, 진입 시 가로폭 fit·출발선 하단 고정, 위로 스크롤 탐험).
  - **노드 상태 = 구름 불투명도**: 완주(done) 0 → 진행 중(active) `0.98 - 진행률*0.45` → 미달성(unselected) 0.95. 구름=`CloudOverlay`(`public/assets/cloud.png`, 노드별 회전·반전 변주), 랜드마크 위 앱 레이어. 완주는 스탬프 아니라 **구름이 걷혀 드러나는 것**. 완주 노드 탭→리캡, 미달성 탭→코스 선택. 가족 마커는 active로 진행률만큼 이동.
  - **미달성 노드**: 빈 섬 `public/assets/empty_island.png`(courses.ts `EMPTY_ISLANDS`) + 구름. 종착지 없이 **위로 12개 계속 이어짐**(스크롤 탐험).
  - 진행 상태 localStorage 영속(`wakii.course` = {**v**, active, km, done[]}). `COURSE_SEED` 버전 올리면 기존 저장 1회 리셋. **현재 데모 시드(v3)**: 콜로세움 완주 + 에펠탑 진행 중(familyKm 8.6/15.4 ≈ 56%, 구름 절반).
  - 완주 리캡: 스탬프/완주 직후 진입. **사진 큐레이션 기준 미정 → 빈 placeholder**(`.rc-empty`). 상단에 코스 그림(`.rc-hero`).
  - ⚠️ 데모엔 **걸음 추가 수단이 없음**(steps 목업) — 진행률은 시드값/리셋(0)으로만 변함. 실제 걸음 연동 시 `familyKm` 갱신 연결 필요.
- **마이**: 캘린더(내가 올린 날짜·사진 **DB 연동**), 워키 레포트(주/월 — 걸음은 목업).
- **실시간**: 같은 방 사진/반응 realtime 반영. **실시간 서울 날씨**(Open-Meteo, 키 불필요).

## 워크플로우 규칙
- **편집 → `npx tsc --noEmit` → 커밋 → `git push`까지 알아서 진행**(2026-06-29부터 사용자가 자동 push 허용). 매번 "push 할까요?" 안 물어봐도 됨. 사용자는 배포본(Vercel)에서 확인함(로컬 dev가 느림).
- 로컬 dev 서버: `npm run dev` (포트 사용 중이면 3001 등). **dev 실행 중엔 `npm run build` 돌리지 말 것**(.next 충돌). 검증은 `npx tsc --noEmit`.
- 커밋 메시지 한국어 OK, 끝에 Co-Authored-By 트레일러.
- **Figma MCP 연동됨**: `figma.com/design/...` 링크 주면 `get_design_context`/`get_screenshot`/`get_metadata`/`get_variable_defs`로 프레임 수치·에셋 읽어 코드로 옮김. 에셋 URL은 curl로 `public/assets/`에 받음(SVG로 오는 경우 있음). 끊기면 사용자가 `/mcp` → "claude.ai Figma" 재인증.

## 다음에 할 만한 것 (백로그)
1. **`supabase/groups.sql` 실행** → 그룹 코드 기기 간 실제 공유.
2. **실제 소셜 OAuth**(카카오 우선) — Supabase Auth provider 설정 필요.
3. RLS 보안 강화(현재 프로토타입용으로 열려 있음) — 외부 공개 전 필수.
4. 걸음 수 실제 연동(헬스킷/구글핏) → `familyKm` 갱신에 연결 — 현재 목업(진행률이 시드/리셋으로만 변함).
5. 완주 리캡 사진 큐레이션 기준 정의(좋아요 수/이모지 종류 등) → 현재 빈 placeholder.
6. 개발용 Supabase 분리(로컬 테스트가 실서버 DB에 쌓이는 문제).
7. 하단 글래스 네비 — Figma 프레임 기준(글래스 알약 3개 + 우측 원형 버튼 + 커스텀 아이콘)으로 아직 안 맞춤(전역 컴포넌트라 보류 중).

## 참고
- 카메라·마이크·WebGL·소셜은 **HTTPS(배포 URL)** 에서 가장 잘 동작. 로컬 localhost도 OK, 폰 LAN 접속은 폴백.
- 날씨/캘린더 월은 **6월(2026) 기준**으로 일부 하드코딩.
