# Supabase 연동 설정 (한 번만)

wakii는 백엔드(Supabase) 키가 있으면 실서비스 모드로, 없으면 localStorage 목업 모드로 동작합니다. 아래를 따라 하시면 실제 업로드·반응·실시간 동기화가 켜집니다.

## 1. 프로젝트 만들기
1. https://supabase.com → 로그인 → **New project**
2. 이름(예: `wakii`), DB 비밀번호 설정, 리전은 **Northeast Asia (Seoul)** 권장 → 생성(1~2분)

## 2. 스키마 + 스토리지 만들기
1. 좌측 **SQL Editor → New query**
2. 이 저장소의 [`supabase/schema.sql`](supabase/schema.sql) 내용을 붙여넣고 **Run**
   - decks / cards / reactions 테이블, 실시간, `photos` 스토리지 버킷, 권한이 한 번에 만들어집니다.

## 3. API 키 가져오기
**Project Settings → API** 에서:
- `Project URL`
- `anon` `public` key

## 4. 로컬에 키 넣기
저장소 루트에 `.env.local` 파일 생성(`.env.local.example` 복사):

```
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGc...
```

그리고 dev 서버 재시작: `npm run dev`

## 5. Vercel에도 키 넣기 (배포용)
Vercel 프로젝트 → **Settings → Environment Variables** 에 위 두 값을 동일하게 추가 → **Redeploy**.

---

설정이 끝나면:
- 처음 진입 시 **이름**을 입력하고(가족 방 표시용),
- 사진을 찍어 편집·공유하면 **Storage에 업로드 + 덱에 카드 생성**,
- 다른 사람이 반응하면 **실시간으로** 덱에 반영됩니다.

> 현재 로그인은 이름만 사용합니다(비밀번호 없음). 추후 카카오 로그인으로 업그레이드 예정이라 권한(RLS)은 프로토타입용으로 열려 있습니다 — 실제 공개 전 반드시 강화하세요.
