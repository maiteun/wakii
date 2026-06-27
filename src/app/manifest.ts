import type { MetadataRoute } from "next";

// Auto-served at /manifest.webmanifest and linked by Next. Makes wakii
// installable ("add to home screen") and launch full-screen, so it reads
// as a real app during user testing.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "wakii",
    short_name: "wakii",
    description: "가족과 함께 사진을 남기고 함께 걷는 앱",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#FBFAF9",
    theme_color: "#D8D6D3",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
