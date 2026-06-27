import { ImageResponse } from "next/og";

// PWA icon (192×192) — rendered at request time so no binary asset is needed.
const SIZE = 192;

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
