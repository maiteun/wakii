# wakii

가족과 함께 사진(짤)을 남기고 함께 걷는 모바일 앱. 홈 · 방 · 업로드 · 걸음 · 마이 5개 화면으로 구성된 프로토타입입니다.

원본 디자인: [`docs/khux-prototype-full.html`](docs/khux-prototype-full.html) — 이 단일 HTML 프로토타입을 Next.js(React) 앱으로 포팅했습니다.

## 스택

- Next.js 14 (App Router)
- React 18 · TypeScript
- Tailwind CSS (디자인은 `globals.css`의 포팅된 프로토타입 스타일 사용)

## 개발

```bash
npm install
npm run dev      # http://localhost:3000
npm run build    # 프로덕션 빌드 검증
```

## 구조

- `src/app/page.tsx` — 진입점, `WakiiApp` 렌더
- `src/components/WakiiApp.tsx` — 전체 앱 (화면 전환, 카드덱, 걸음 맵, 캘린더, 업로드)
- `src/app/globals.css` — 프로토타입 디자인 스타일

## 배포

Vercel에 연결해 `main` 브랜치 push 시 자동 배포됩니다.
