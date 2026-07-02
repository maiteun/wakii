// MVP 시연용 목업 시드 — 참여 코드 4444, 방 "우리 가족 🏠".
// mockup/ 폴더의 실제 사진을 Supabase Storage(photos 버킷)에 올리고, 그 공개 URL로
// 엄마·아빠·딸1·딸2(전용 데모 계정)의 게시글/반응/답장을 DB에 시드한다.
// 시연 때 내(실계정) 반응/답장은 기존 앱 흐름대로 저장되고, 실제 사용자 계정은 안 건드린다.
//
// 멱등: 이 방의 기존 덱/카드/반응을 지우고 다시 넣는다(사진은 x-upsert로 덮어씀). 재실행 안전.
// 실행:  node scripts/seed-demo-room.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const env = readFileSync(join(ROOT, ".env.local"), "utf8");
const URL_ = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const KEY = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const REP = { ...H, Prefer: "return=representation" };
const BUCKET = "photos";

const ROOM = "우리 가족 🏠";
const MISSION_LABEL = "오늘의 풍경"; // WakiiApp의 MISSION_NAME과 동일해야 함

// 전용 데모 계정(실계정 아님)
const MOM = "mom@wakii.demo";
const DAD = "dad@wakii.demo";
const D1 = "daughter1@wakii.demo";
const D2 = "daughter2@wakii.demo";

// 프로필: 이름 + 아바타(mockup/profiles/). 파일명 = obj 키와 동일.
const PROFILES = [
  { email: MOM, name: "엄마", file: "mockup/profiles/mom.png", obj: "demo/4444/mom.png" },
  { email: DAD, name: "아빠", file: "mockup/profiles/dad.png", obj: "demo/4444/dad.png" },
  { email: D1, name: "큰언니", file: "mockup/profiles/daughter1.png", obj: "demo/4444/daughter1.png" },
  { email: D2, name: "작은언니", file: "mockup/profiles/daughter2.png", obj: "demo/4444/daughter2.png" },
];

// 게시글 사진(로컬 → Storage 오브젝트 경로). 키로 시나리오에서 참조.
// mockup/posts/<키>.png — 파일명이 아래 키와 1:1로 일치하므로 찾기 쉬움.
const PHOTOS = {
  "p1-breakfast": { file: "mockup/posts/p1-breakfast.png", obj: "demo/4444/p1-breakfast.png" },
  "p1-coffee": { file: "mockup/posts/p1-coffee.png", obj: "demo/4444/p1-coffee.png" },
  "p1-d1react": { file: "mockup/posts/p1-d1react.png", obj: "demo/4444/p1-d1react.png" },
  "p2-work1": { file: "mockup/posts/p2-work1.png", obj: "demo/4444/p2-work1.png" },
  "p2-work2": { file: "mockup/posts/p2-work2.png", obj: "demo/4444/p2-work2.png" },
  "p3-m1": { file: "mockup/posts/p3-m1.png", obj: "demo/4444/p3-m1.png" },
  "p3-m2": { file: "mockup/posts/p3-m2.png", obj: "demo/4444/p3-m2.png" },
  "p3-m3": { file: "mockup/posts/p3-m3.png", obj: "demo/4444/p3-m3.png" },
  "p3-m4": { file: "mockup/posts/p3-m4.png", obj: "demo/4444/p3-m4.png" },
  "p4-main": { file: "mockup/posts/p4-main.png", obj: "demo/4444/p4-main.png" },
  "p4-react1": { file: "mockup/posts/p4-react1.png", obj: "demo/4444/p4-react1.png" },
  "p4-reply1": { file: "mockup/posts/p4-reply1.png", obj: "demo/4444/p4-reply1.png" },
  "p4-reply2": { file: "mockup/posts/p4-reply2.png", obj: "demo/4444/p4-reply2.png" },
  "p5-daughter": { file: "mockup/posts/p5-daughter.png", obj: "demo/4444/p5-daughter.png" },
  "p5-mom": { file: "mockup/posts/p5-mom.png", obj: "demo/4444/p5-mom.png" },
};

// 위치 스티커(날씨/위치 칩)를 합성할 사진 — 엄마·아빠는 대전. 앱 편집기 칩 스타일로 굽는다.
const CHIP = {
  "p1-breakfast": "대전", // 엄마
  "p1-coffee": "대전", // 아빠
  "p3-m1": "대전", // 아빠
  "p3-m3": "대전", // 엄마
  "p4-main": "대전", // 아빠
  "p5-mom": "대전", // 엄마
};

// 시나리오. r: 반응 = { by, emoji, photo?(즉석사진 키) }.  emoji에 텍스트를 넣으면 텍스트 반응.
const DECKS = [
  {
    // [오늘의 미션] 하루 하나 — 오늘 미션. 큰언니(큰딸동네) 먼저, 이어서 엄마(엄마동네)
    label: MISSION_LABEL,
    is_mission: true,
    at: "2026-07-02T09:00:00Z",
    cards: [
      { by: D1, img: "p5-daughter", at: "2026-07-02T09:01:00Z", r: [] },
      { by: MOM, img: "p5-mom", reply: true, at: "2026-07-02T09:05:00Z", r: [] },
    ],
  },
  {
    // [게시글4] 오늘 — 아빠가 올림
    label: DAD,
    is_mission: false,
    at: "2026-07-02T06:00:00Z",
    cards: [
      {
        by: DAD, img: "p4-main", at: "2026-07-02T06:01:00Z",
        r: [{ by: D1, emoji: "😍" }, { by: D2, emoji: "😮", photo: "p4-react1" }],
      },
      {
        by: D1, img: "p4-reply1", reply: true, at: "2026-07-02T06:20:00Z",
        r: [{ by: DAD, emoji: "건강한\n우리가족^^" }], // 아빠의 텍스트 반응(민트)
      },
      {
        by: D2, img: "p4-reply2", reply: true, at: "2026-07-02T06:25:00Z",
        r: [{ by: MOM, emoji: "파이팅해!!" }],
      },
    ],
  },
  {
    // [게시글3] 미션 · 어제(이전 미션) — 아빠가 올림
    label: MISSION_LABEL,
    is_mission: true,
    at: "2026-07-01T03:00:00Z",
    cards: [
      {
        by: DAD, img: "p3-m1", at: "2026-07-01T03:01:00Z",
        r: [{ by: MOM, emoji: "❤️" }, { by: D2, emoji: "😮", photo: "p3-m2" }],
      },
      { by: MOM, img: "p3-m3", reply: true, at: "2026-07-01T03:20:00Z", r: [] },
      { by: D2, img: "p3-m4", reply: true, at: "2026-07-01T03:25:00Z", r: [] },
    ],
  },
  {
    // [게시글2] 2일 전 — 딸1이 올림
    label: D1,
    is_mission: false,
    at: "2026-06-30T03:00:00Z",
    cards: [
      {
        by: D1, img: "p2-work1", at: "2026-06-30T03:01:00Z",
        r: [{ by: MOM, emoji: "밥은..?" }, { by: D2, emoji: "😂" }],
      },
      {
        by: D1, img: "p2-work2", reply: true, at: "2026-06-30T03:20:00Z",
        r: [{ by: MOM, emoji: "파아팅!" }],
      },
    ],
  },
  {
    // [게시글1] 3일 전 — 엄마가 올림
    label: MOM,
    is_mission: false,
    at: "2026-06-29T03:00:00Z",
    cards: [
      {
        by: MOM, img: "p1-breakfast", at: "2026-06-29T03:01:00Z",
        r: [
          { by: DAD, emoji: "😋" },
          { by: D1, emoji: "😂", photo: "p1-d1react" },
          { by: D2, emoji: "맛있겠다" },
        ],
      },
      {
        by: DAD, img: "p1-coffee", reply: true, at: "2026-06-29T03:20:00Z",
        r: [{ by: MOM, emoji: "😄" }],
      },
    ],
  },
];

async function api(method, path, body, headers = H) {
  const res = await fetch(`${URL_}/rest/v1/${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
  return text ? JSON.parse(text) : null;
}

// 바이트를 Storage에 올리고 공개 URL 반환.
// anon 키는 새 오브젝트 생성만 되고 덮어쓰기(update)는 RLS로 막히므로,
// 이미 있으면(409/중복) 업로드를 건너뛰고 기존 공개 URL을 그대로 쓴다.
async function putObject(obj, bytes) {
  const publicUrl = `${URL_}/storage/v1/object/public/${BUCKET}/${obj}`;
  const res = await fetch(`${URL_}/storage/v1/object/${BUCKET}/${obj}`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "image/png" },
    body: bytes,
  });
  if (res.ok) return publicUrl;
  const txt = await res.text();
  if (res.status === 409 || /exists|duplicate/i.test(txt)) return publicUrl; // 이미 있음 → 재사용
  throw new Error(`upload ${obj} → ${res.status} ${txt}`);
}
async function upload(file, obj) {
  return putObject(obj, readFileSync(join(ROOT, file)));
}

// 사진 위(오른쪽 위)에 앱 편집기 스타일 위치 칩(🌧 도시)을 합성해 PNG 버퍼로 반환.
async function bakeChip(file, city) {
  const img = sharp(readFileSync(join(ROOT, file)));
  const meta = await img.metadata();
  const W = meta.width || 1000;
  const Hh = meta.height || 1000;
  const fs = Math.round(W * 0.045);
  const padX = Math.round(fs * 0.75);
  const pillH = Math.round(fs * 1.95);
  const pillW = Math.round(fs * 3.5 + padX * 2); // 아이콘+공백+한글 2자 대략치
  const margin = Math.round(W * 0.038);
  const x = W - margin - pillW;
  const y = margin;
  const svg = Buffer.from(
    `<svg width="${W}" height="${Hh}" xmlns="http://www.w3.org/2000/svg">
       <g transform="translate(${x},${y})">
         <rect width="${pillW}" height="${pillH}" rx="${Math.round(pillH / 2)}"
               fill="rgba(15,17,22,0.42)" stroke="rgba(255,255,255,0.55)" stroke-width="${Math.max(1, Math.round(fs * 0.05))}"/>
         <text x="${Math.round(pillW / 2)}" y="${Math.round(pillH * 0.68)}" text-anchor="middle"
               font-family="Apple SD Gothic Neo, AppleGothic, sans-serif" font-size="${fs}" font-weight="700" fill="#ffffff">🌧 ${city}</text>
       </g>
     </svg>`,
  );
  return img.composite([{ input: svg, top: 0, left: 0 }]).png().toBuffer();
}

async function wipeRoom() {
  const room = encodeURIComponent(ROOM);
  const decks = await api("GET", `decks?room=eq.${room}&select=id`);
  const deckIds = decks.map((d) => d.id);
  if (!deckIds.length) return 0;
  const inDecks = `(${deckIds.map(encodeURIComponent).join(",")})`;
  const cards = await api("GET", `cards?deck_id=in.${inDecks}&select=id`);
  const cardIds = cards.map((c) => c.id);
  if (cardIds.length) {
    const inCards = `(${cardIds.map(encodeURIComponent).join(",")})`;
    await api("DELETE", `reactions?card_id=in.${inCards}`);
    await api("DELETE", `cards?deck_id=in.${inDecks}`);
  }
  await api("DELETE", `decks?id=in.${inDecks}`);
  return deckIds.length;
}

async function main() {
  // 1) 사진 업로드 → 키별 공개 URL (CHIP 대상은 위치 칩 합성본을 -loc로 업로드)
  const url = {};
  let nChip = 0;
  for (const [key, p] of Object.entries(PHOTOS)) {
    if (CHIP[key]) {
      const baked = await bakeChip(p.file, CHIP[key]);
      url[key] = await putObject(p.obj.replace(/\.png$/, "-loc.png"), baked);
      nChip++;
    } else {
      url[key] = await upload(p.file, p.obj);
    }
  }
  console.log(`✓ 게시글 사진 업로드: ${Object.keys(PHOTOS).length}장 (위치 칩 합성 ${nChip}장)`);

  // 2) 프로필(이름 + 아바타) 업서트
  const profileRows = [];
  for (const p of PROFILES) {
    const avatar = await upload(p.file, p.obj);
    profileRows.push({ email: p.email, name: p.name, avatar_url: avatar });
  }
  await api("POST", "profiles", profileRows, {
    ...REP,
    Prefer: "resolution=merge-duplicates,return=representation",
  });
  console.log(`✓ 프로필 업서트: ${PROFILES.map((p) => p.name).join(", ")} (아바타 포함)`);

  // 3) 기존 시드 정리(멱등)
  const wiped = await wipeRoom();
  console.log(`✓ 기존 덱 정리: ${wiped}개`);

  // 4) 덱 → 카드 → 반응 삽입
  let nCards = 0;
  let nReactions = 0;
  for (const d of DECKS) {
    const [deck] = await api("POST", "decks", { room: ROOM, label: d.label, is_mission: d.is_mission, created_at: d.at }, REP);
    for (const c of d.cards) {
      const [card] = await api(
        "POST", "cards",
        { deck_id: deck.id, author: c.by, image_url: url[c.img], is_reply: !!c.reply, created_at: c.at },
        REP,
      );
      nCards++;
      for (const rx of c.r) {
        await api("POST", "reactions", {
          card_id: card.id, author: rx.by, emoji: rx.emoji, image_url: rx.photo ? url[rx.photo] : null,
        });
        nReactions++;
      }
    }
    console.log(`  · 덱 "${d.label}" (카드 ${d.cards.length})`);
  }
  console.log(`✓ 완료: 덱 ${DECKS.length} · 카드 ${nCards} · 반응 ${nReactions}`);
  console.log(`\n방 "${ROOM}" (코드 4444)에 실제 사진 목업이 준비됐어요.`);
}

main().catch((e) => {
  console.error("시드 실패:", e.message);
  process.exit(1);
});
