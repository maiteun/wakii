# wakii — 작업 인수인계 (다음 세션용)

다음 세션 시작할 때 이 파일을 읽어달라고 하면 돼요. 예:
> "docs/HANDOFF.md 읽고 이어서 작업하자."

## 프로젝트 개요
- **wakii** — 가족이 사진(짤)을 올리고 반응/답장하며 함께 걷는 모바일 웹앱.
- 스택: **Next.js 14 (App Router) · React 18 · TypeScript · 순수 CSS(globals.css)**.
- 디자인 원본: `docs/khux-prototype-full.html` (이걸 React로 포팅한 게 시작점).
- GitHub: **maiteun/wakii** (`main` 브랜치). 배포: **https://wakii-tau.vercel.app** (Vercel, push 시 자동 배포).

## 백엔드 (Supabase)
- 프로젝트 URL: `https://urdstxneciyimpuakpmi.supabase.co` (publishable key는 `.env.local` / Vercel env에 있음).
- 키 없으면 자동으로 **localStorage 목업 모드**로 동작 (`src/lib/supabase.ts`의 `hasSupabase`).
- **실행된 SQL**: `supabase/schema.sql`(decks·cards·reactions + photos 버킷 + realtime), `supabase/storage.sql`.
- ⚠️ **아직 실행 안 한 SQL**: **`supabase/groups.sql`** — 그룹(참여코드) 테이블. 이걸 돌려야 그룹이 기기 간 공유됨. (지금은 코드에 폴백이 있어 안 돌려도 온보딩 플로우는 로컬 목업으로 진행됨.)

## 핵심 파일
- `src/components/WakiiApp.tsx` — **메인**(거의 모든 화면/상태). 온보딩, 홈, 방, 워키(걸음), 마이.
- `src/components/PhotoEditor.tsx` — 촬영 후 풀 에디터(스티커/그림/텍스트/음성 + 시간·날씨 스티커). 답장에 사용.
- `src/components/InstantCapture.tsx` — 즉석 반응 촬영(원형, 수정불가, 이모지 배지).
- `src/components/CircularGallery.jsx` — 덱 펼침 WebGL 갤러리(ogl). `loop={false}`로 최신→작성자 바운드.
- `src/lib/{supabase,db,types}.ts` — 클라이언트 / 데이터레이어 / 타입.
- `src/app/globals.css` — 전체 스타일. `src/app/layout.tsx` — PWA 메타. `src/app/manifest.ts` + `icon-*.png/route.tsx`.

## 구현된 기능
- **온보딩**: 로그인 화면(카카오/네이버/구글/Apple 버튼 — UI만, OAuth 미연동) → 이름 입력 → 그룹 만들기 / 참여 → 홈.
  - **초대는 링크 공유 방식**: 그룹 만들면 `💌 카카오톡으로 초대하기`(Web Share API `navigator.share` → 폰 공유시트에서 카톡 선택, 데스크톱은 링크 복사 폴백). 참여 코드는 작은 폴백으로만 노출.
  - **초대 링크로 자동 참여**: `/?j=CODE`로 접속하면 코드 입력 없이 자동 참여. 이름 있으면 즉시 참여→홈, 신규면 로그인→이름→자동 참여(카카오 OAuth 붙으면 이름 단계 생략 예정). URL 파라미터는 참여 후 제거.
  - 홈 그룹 목록은 코드 대신 `💌 가족 초대하기`(탭하면 그 그룹 초대 링크 공유)로 표시.
  - **데모 백도어**: 참여 코드 `1234`는 백엔드 상태와 무관하게 항상 `우리 가족`으로 참여 (`src/lib/db.ts`의 `joinGroup`).
- **홈**: 오늘의 미션 배너, 걸음수 텍스트, "우리" 집 아이콘, **내 그룹 목록**(+그룹 추가).
- **방**: 채팅형(최신 아래, 위로 스크롤). 덱=겹친 카드, 탭하면 CircularGallery. 카드 밑 작성자 이름. 미션 덱=파란 네온+"오늘의 풍경" 푸터.
- **반응/답장**: 🙂 반응 → 이모지 한 줄 + 💬텍스트. 이모지 짧게=버블 와르르(저장), 길게=**즉석 원형 사진 반응(저장 안 함)**. 텍스트 짧게=10자 입력, 길게=AI 추천 멘트(와르르). 📷 답장=풀 에디터→덱에 카드 저장. 사진 **길게 탭=원본 보기**. 보는 동안 반응 모션 계속 반복.
- **워키(걸음) — 코스 시스템 (A 구조)**: 코스 1개 = 랜드마크 1개(실측 15~20km대), 한 번에 1개만 진행, 가족 걸음 합산 공동 진행, 완주(100%) 시 0으로 리셋, 모든 코스 영구 재선택 가능.
  - 데이터: `src/lib/courses.ts`(11개 코스 id/이름/distance_km/steps). 이미지 `public/assets/courses/<id>.png`, `courseImg(id)`로 매핑. ⚠️ **angkor_wat 이미지만 누락**(나머지 10개 있음) → 없으면 🏝️ placeholder. steps는 1km=1,350보 임시 환산(확정 시 일괄 교체).
  - 화면: 가족 아바타 행 → 완주 뱃지 모음 → **현재 코스 배너**(썸네일·목표/함께 km·진행률%, 100%면 배너 안에 `🏁 완주! 새 목표 고르기 →` 버튼 → 코스 선택 시트) → **지도형 경로 맵**.
  - **노드 상태 = 구름 불투명도**(일관 축): 완주(done) 구름 0 → 진행 중(active) `0.8 - 진행률*0.6`(0%→0.8, 100%→0.2) → 미선택(unselected, 1개) 0.95. 구름은 `CloudOverlay`로 랜드마크 위에 얹는 앱 레이어(이미지에 굽지 않음). 완주는 스탬프/깃발이 아니라 **구름이 완전히 걷혀 랜드마크가 드러나는 것**. 완주 노드 탭→리캡, 미선택(빈 섬+?) 탭→코스 선택. 가족 마커는 active 노드로 진행률만큼 이동.
  - 미선택 빈 섬은 `EMPTY_ISLAND_IMG`(courses.ts, 현재 null→회색 placeholder). `public/assets/courses/empty_island.png` 추가 후 경로만 채우면 됨.
  - 진행 상태 localStorage 영속(`wakii.course` = {active, km, done[]}). 데모 시드: 한라산 100%(완주 버튼 노출) + 콜로세움·에펠탑 스탬프.
  - 완주 리캡: 스탬프 탭 또는 완주 직후 → 그 코스 기간 반응 많았던 사진 카드 보여줌.
  - ⚠️ 데모엔 **걸음 추가 수단이 없음**(steps 목업) — 진행률은 시드값/리셋(0)으로만 변함. 실제 걸음 연동 시 `familyKm` 갱신 연결 필요.
- **마이**: 캘린더(내가 올린 날짜·사진 **DB 연동**), 워키 레포트(주/월 — 걸음은 목업).
- **실시간**: 같은 방 사진/반응 realtime 반영. **실시간 서울 날씨**(Open-Meteo, 키 불필요).

## 워크플로우 규칙
- **로컬에서 개발/확인** → 준비되면 push → Vercel 자동 배포.
- **`git push`는 사용자가 "push"라고 할 때만.** 로컬 커밋은 평소처럼 진행.
- 로컬 dev 서버: `npm run dev` (http://localhost:3000). **dev 실행 중엔 `npm run build` 돌리지 말 것**(.next 충돌). 검증은 `npx tsc --noEmit`.

## 다음에 할 만한 것 (백로그)
1. **`supabase/groups.sql` 실행** → 그룹 코드 기기 간 실제 공유.
2. **실제 소셜 OAuth**(카카오 우선) — Supabase Auth provider 설정 필요.
3. RLS 보안 강화(현재 프로토타입용으로 열려 있음) — 외부 공개 전 필수.
4. 걸음 수 실제 연동(헬스킷/구글핏) → `familyKm` 갱신에 연결 — 현재 목업.
5. **누락 코스 이미지 추가**: angkor_wat (산토리니는 추가됨) → `public/assets/courses/<id>.png` 넣고 `src/lib/courses.ts`의 `WITH_IMAGE`에 id 추가.
6. 개발용 Supabase 분리(로컬 테스트가 실서버 DB에 쌓이는 문제).

## 참고
- 카메라·마이크·WebGL·소셜은 **HTTPS(배포 URL)** 에서 가장 잘 동작. 로컬 localhost도 OK, 폰 LAN 접속은 폴백.
- 날씨/캘린더 월은 **6월(2026) 기준**으로 일부 하드코딩.
