// logo.png(122×38, 저해상)이 확대 시 깨져서 → 2색(흰 "wak" / 민트 "ii")을 분리 트레이싱해
// 선명한 벡터 public/assets/home/logo.svg 를 생성한다. 실행: node scripts/make-logo-svg.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";
import potrace from "potrace";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SRC = join(ROOT, "public/assets/home/logo.png");
const OUT = join(ROOT, "public/assets/home/logo.svg");
const MINT = "#74F1F1";
const SCALE = 6; // 트레이싱 전 확대배율(곡선 품질↑)

const traceMask = (pngBuf) =>
  new Promise((resolve, reject) => {
    const p = new potrace.Potrace({ turdSize: 8, alphaMax: 1.2, optCurve: true, optTolerance: 0.4, threshold: 128 });
    p.loadImage(pngBuf, (err) => {
      if (err) return reject(err);
      resolve(p.getPathTag()); // <path .../> (fill 미지정)
    });
  });

async function main() {
  const base = sharp(SRC).resize({ width: 122 * SCALE, kernel: "cubic" }).ensureAlpha();
  const { data, info } = await base.raw().toBuffer({ resolveWithObject: true });
  const { width: W, height: Hh, channels } = info;

  const whiteMask = Buffer.alloc(W * Hh, 255);
  const mintMask = Buffer.alloc(W * Hh, 255);
  for (let i = 0; i < W * Hh; i++) {
    const r = data[i * channels], g = data[i * channels + 1], b = data[i * channels + 2], a = data[i * channels + 3];
    if (a < 128) continue;
    const isMint = g > 165 && b > 165 && r < g - 35; // 시안(민트): g,b 높고 r 낮음
    const isWhite = r > 165 && g > 165 && b > 165 && !isMint;
    if (isMint) mintMask[i] = 0; // 트레이싱 대상=검정(0)
    else if (isWhite) whiteMask[i] = 0;
  }

  const toPng = (buf) => sharp(buf, { raw: { width: W, height: Hh, channels: 1 } }).png().toBuffer();
  const whitePath = (await traceMask(await toPng(whiteMask))).replace(/fill="[^"]*"/, `fill="#ffffff"`);
  const mintPath = (await traceMask(await toPng(mintMask))).replace(/fill="[^"]*"/, `fill="${MINT}"`);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${Hh}" fill="none">
${whitePath}
${mintPath}
</svg>
`;
  writeFileSync(OUT, svg);
  console.log(`✓ logo.svg 생성 (viewBox 0 0 ${W} ${Hh})`);
}

main().catch((e) => {
  console.error("실패:", e.message);
  process.exit(1);
});
