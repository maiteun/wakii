# wakii — 작업 지침 (항상 적용)

## 디자인 적용 — SVG 정밀 분석 필수
Figma/디자인을 코드로 옮길 때는 **반드시 SVG의 좌표·크기·색을 정밀 분석**해서 입힌다.
눈대중(PNG 썸네일만 보고 추정) 금지.

- **SVG 우선.** SVG가 있으면 그것을 분석한다. `<rect>/<circle>/<path>/<linearGradient>/<stop>` 의
  `x,y,width,height,rx,cx,cy,r,fill,stop-color,offset,transform` 값을 **실제로 읽어서**
  (grep 또는 python으로 파싱) 위치·비율·여백·반경·색을 그대로 재현한다.
  - 프레임 대비 비율로 환산: 예) 뷰파인더 width 366 / 프레임 402 = 91% → `width:91%`.
  - aspect-ratio, border-radius, 좌표(top/left/bottom)도 SVG 수치에서 환산.
- **PNG는 참고용.** 화면에 PNG를 그대로 박지 말고, 동일하게 보이도록 CSS+벡터로 재구성한다(확대 시 안 깨지게).
- **아이콘은 인라인 SVG + `currentColor`** 로 넣어 상태색(기본 흰색 ↔ 활성 민트 `#74F1F1`)이 CSS로 바뀌게 한다.
  - SVG 내부가 base64 래스터(`<image>`/`<pattern>`)면 깨끗한 벡터로 다시 그린다.
  - viewBox는 글리프 실제 경계에 맞춰, 양옆 형제 아이콘과 채움 비율을 맞춘다.
- 강조색 토큰: 민트 `#74F1F1`.

## 빌드/배포 필수
- 푸시 전 **반드시 `npm run build`** 로 확인한다. `next dev`는 통과해도 프로덕션(cssnano)에서
  CSS 에러로 빌드가 깨지면 Vercel 배포가 조용히 막혀 옛 버전이 그대로 뜬다.
- CSS 주석은 중첩 불가: `/* ... */` 안에 `*/`(또는 `/* */`) 문자열을 넣지 말 것.

## git
- 커밋/푸시는 사용자가 요청할 때만. 푸시 후 `origin/main` 반영을 확인한다.
