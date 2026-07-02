# mockup/ — 데모 방(4444) 시드용 목업 이미지

`scripts/seed-demo-room.mjs` 가 이 이미지들을 Supabase Storage(`photos` 버킷)에 올리고,
그 공개 URL로 데모 방 "우리 가족 🏠"의 프로필/게시글/반응을 시드한다.
**앱 런타임이나 `public/` 과는 무관** — 시드 스크립트 전용.

## 폴더 구조
```
mockup/
  profiles/   프로필 아바타. 파일명 = Storage obj 키 (mom, dad, daughter1, daughter2)
  posts/      게시글·반응 사진. 파일명 = 시드 키 (p{게시글번호}-{용도})
```

## 네이밍 규칙 (유지보수 핵심)
- **ASCII·kebab-case**. 한글/공백 파일명 금지.
- `posts/` 파일명은 `seed-demo-room.mjs` 의 `PHOTOS` **키와 1:1로 일치**시킨다.
  예) 시드 키 `p4-reply1` → 파일 `posts/p4-reply1.png`. 그래야 시드만 보고 파일을 바로 찾는다.
- 키 규칙: `p<게시글번호>-<용도>` (main 원본 / react 반응 / reply 답장 / work·breakfast·m1… 내용).

## 새 목업 추가하는 법
1. 이미지를 `posts/` (또는 `profiles/`)에 규칙대로 넣는다. 예) `posts/p6-walk.png`.
2. `seed-demo-room.mjs` 의 `PHOTOS` 에 항목 추가:
   `"p6-walk": { file: "mockup/posts/p6-walk.png", obj: "demo/4444/p6-walk.png" },`
3. `DECKS` 시나리오에서 그 키를 `img`/`photo` 로 참조.
4. 시드 재실행: `node scripts/seed-demo-room.mjs`.
