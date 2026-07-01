/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // 베타 중 잦은 배포가 캐시에 막혀 옛 화면이 뜨는 걸 방지.
  // HTML 문서는 항상 재검증(새 CSS/JS 해시를 즉시 받게), 해시 박힌 정적 에셋은 장기 캐시 유지.
  async headers() {
    return [
      {
        source: "/_next/static/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        source: "/:path*",
        headers: [{ key: "Cache-Control", value: "no-cache, must-revalidate" }],
      },
    ];
  },
};

export default nextConfig;
