import { ImageResponse } from "next/og";

// PWA icon (512×512) — used for install / splash / maskable.
const SIZE = 512;

export function GET() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1A1A1A",
          color: "#FBFAF9",
          fontSize: SIZE * 0.3,
          fontWeight: 800,
          letterSpacing: "-0.04em",
          fontFamily: "sans-serif",
        }}
      >
        wakii
      </div>
    ),
    { width: SIZE, height: SIZE },
  );
}
