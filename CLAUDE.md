# wakii — 작업 지침 (항상 적용)

## 디자인 적용 — SVG 정밀 분석 필수 (눈대중 절대 금지!!)
Figma/디자인을 코드로 옮길 때는 **반드시 SVG의 좌표·크기·색을 정밀 분석**해서 입힌다.
눈대중(PNG 썸네일만 보고 추정) 금지.

- **SVG + PNG를 같이 주면:** PNG = 최종 외형의 **정답(ground truth)**, SVG = 정확한 **좌표·치수·색**.
  → SVG 수치로 구현하되, **결과물이 PNG와 완전히 일치하도록** 맞춘다. PNG를 실제로 띄워(Read) 위치·비율·색을
  대조하고, 어긋나면 SVG 좌표를 다시 확인해 고친다. "비슷하게"가 아니라 "동일하게".
- **SVG 분석 방법.** `<rect>/<circle>/<path>/<linearGradient>/<stop>` 의
  `x,y,width,height,rx,cx,cy,r,fill,stop-color,offset,transform` 값을 **실제로 읽어서**
  (grep 또는 python으로 파싱) 위치·비율·여백·반경·색을 그대로 재현한다.
  - 프레임 대비 비율로 환산: 예) 뷰파인더 width 366 / 프레임 402 = 91% → `width:91%`.
  - aspect-ratio, border-radius, 좌표(top/left/bottom)도 SVG 수치에서 환산.
- **PNG는 화면에 그대로 박지 않는다.** 동일하게 보이도록 CSS+벡터로 재구성한다(확대 시 안 깨지게).
- **아이콘은 인라인 SVG + `currentColor`** 로 넣어 상태색(기본 흰색 ↔ 활성 민트 `#74F1F1`)이 CSS로 바뀌게 한다.
  - SVG 내부가 base64 래스터(`<image>`/`<pattern>`)면 깨끗한 벡터로 다시 그린다.
  - viewBox는 글리프 실제 경계에 맞춰, 양옆 형제 아이콘과 채움 비율을 맞춘다.
- 강조색 토큰: 민트 `#74F1F1`.

## 에셋 정리 — 다 쓴 SVG/PNG는 리네임 + 폴더화
디자인 에셋을 적용한 뒤에는 재사용하기 쉽게 정리한다.
- **ASCII·kebab-case 영문 이름**으로 변경한다. 한글/공백 파일명 금지
  (URL 인코딩·빌드 문제 + 코드에서 다루기 불편). 예) `플러스탭해서 사진찍을때.svg` → `capture/capture-screen.svg`.
- **용도별 폴더**로 묶는다. 예) `public/assets/{home,mission,capture,nav,house,walk,icons}/…`.
- 파일을 옮기거나 이름을 바꾸면 **코드의 `src=`/`url()` 참조도 함께 업데이트**하고 `npm run build`로 확인한다.
- 원본 참고용은 `public/assets/_ref/` 에 둔다(앱에서 직접 참조하지 않음).

## 빌드/배포 필수
- 푸시 전 **반드시 `npm run build`** 로 확인한다. `next dev`는 통과해도 프로덕션(cssnano)에서
  CSS 에러로 빌드가 깨지면 Vercel 배포가 조용히 막혀 옛 버전이 그대로 뜬다.
- CSS 주석은 중첩 불가: `/* ... */` 안에 `*/`(또는 `/* */`) 문자열을 넣지 말 것.

## git
- **사용자는 로컬에서 확인하지 않고 배포본(Vercel)으로 확인한다.** 따라서 수정한 내용은
  매번 "push 할까요?" 묻지 말고 **편집 → `npm run build`(통과 확인) → 커밋 → `git push`까지 바로 진행**한다.
- 푸시 후 `origin/main` 반영을 확인한다(작업 트리 클린 + `main...origin/main` 동기화).
- 커밋 메시지는 한국어 OK, 끝에 `Co-Authored-By` 트레일러.
