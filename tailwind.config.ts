import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./src/app/**/*.{ts,tsx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // design-tokens.css 의 --ds-* (RGB 트리플릿) 구동. alpha 지원: bg-accent/50 가능
        bg:      "rgb(var(--ds-bg) / <alpha-value>)",
        surface: "rgb(var(--ds-surface) / <alpha-value>)",
        line:    "rgb(var(--ds-line) / <alpha-value>)",
        ink:     "rgb(var(--ds-ink) / <alpha-value>)",
        muted:   "rgb(var(--ds-muted) / <alpha-value>)",
        accent:  "rgb(var(--ds-accent) / <alpha-value>)", // 민트 #74F1F1 — 선택/활성 전용
      },
      fontSize: {
        display: ["var(--fs-display)", { fontWeight: "800" }], // 30  게이지 주인공 숫자
        title:   ["var(--fs-title)",   { fontWeight: "800" }], // 20  타이틀·라벨
        body:    ["var(--fs-body)",    { fontWeight: "500" }], // 15  본문·버튼
        meta:    ["var(--fs-meta)",    { fontWeight: "500" }], // 12  캡션·단위·날짜
      },
      borderRadius: {
        glass: "var(--r-glass)", // 30
        card:  "var(--r-card)",  // 16
        btn:   "var(--r-btn)",   // 12
        chip:  "var(--r-chip)",  // 10
        pill:  "var(--r-pill)",  // 999
      },
      boxShadow: {
        glow: "var(--glow-accent)", // 민트 아웃글로우
      },
      maxWidth: {
        app: "430px", // mobile app frame width (≈ iPhone Pro Max)
      },
      fontFamily: {
        sans: ["var(--font-app)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;