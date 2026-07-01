// MVP 시연용 목업 시드 — 참여 코드 4444, 방 "우리 가족 🏠".
// 엄마·아빠·할머니·언니(전용 데모 계정)의 사진 기록을 DB에 미리 넣어둔다.
// 시연 때 내가(실계정) 반응/답장하면 기존 앱 흐름 그대로 DB에 저장된다.
// 실제 사용자 계정(maii·유영 등)은 건드리지 않는다(작성자가 전부 @wakii.demo).
//
// 멱등: 이 방의 기존 덱/카드/반응을 지우고 다시 넣는다. (재실행 안전)
// 실행:  node scripts/seed-demo-room.mjs
import { readFileSync } from "node:fs";

const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const URL_ = env.match(/NEXT_PUBLIC_SUPABASE_URL=(.*)/)[1].trim();
const KEY = env.match(/NEXT_PUBLIC_SUPABASE_ANON_KEY=(.*)/)[1].trim();
const H = { apikey: KEY, Authorization: `Bearer ${KEY}`, "Content-Type": "application/json" };
const REP = { ...H, Prefer: "return=representation" };

const ROOM = "우리 가족 🏠";
const MISSION_LABEL = "오늘의 풍경"; // WakiiApp의 MISSION_NAME과 동일해야 함

// 전용 데모 계정(실계정 아님) — 프로필 이름이 방 곳곳에 표시된다.
const MOM = "mom@wakii.demo";
const DAD = "dad@wakii.demo";
const GRANDMA = "grandma@wakii.demo";
const SISTER = "sister@wakii.demo";
const PROFILES = [
  { email: MOM, name: "엄마" },
  { email: DAD, name: "아빠" },
  { email: GRANDMA, name: "할머니" },
  { email: SISTER, name: "언니" },
];

// 사진 자리표시자(포토그래픽·seed 고정). 실제 가족 사진이 생기면 URL만 교체.
const pic = (k) => `https://picsum.photos/seed/wakii-${k}/640/800`;

// 시드 구조: 덱마다 라벨/미션여부/시각 + 카드들(각 카드에 반응 목록).
// r: 반응 = { by, emoji, photo?(원형 사진 반응) }
const DECKS = [
  {
    label: MISSION_LABEL,
    is_mission: true,
    at: "2026-07-01T03:00:00Z", // 오늘
    cards: [
      { author: MOM, img: pic("sky-mom"), at: "2026-07-01T03:01:00Z", r: [{ by: DAD, emoji: "❤️" }, { by: SISTER, emoji: "😍" }] },
      { author: DAD, img: pic("sky-dad"), at: "2026-07-01T03:03:00Z", r: [{ by: MOM, emoji: "👍" }] },
      { author: GRANDMA, img: pic("sky-grandma"), at: "2026-07-01T03:05:00Z", r: [{ by: MOM, emoji: "😂" }, { by: DAD, emoji: "❤️" }, { by: SISTER, emoji: "🥰" }] },
      { author: SISTER, img: pic("sky-sister"), at: "2026-07-01T03:07:00Z", r: [] },
    ],
  },
  {
    label: MOM,
    is_mission: false,
    at: "2026-07-01T02:00:00Z", // 오늘
    cards: [
      { author: MOM, img: pic("breakfast"), at: "2026-07-01T02:01:00Z", r: [{ by: DAD, emoji: "😋" }, { by: GRANDMA, emoji: "❤️" }, { by: SISTER, emoji: "👍" }] },
      { author: DAD, img: pic("coffee"), reply: true, at: "2026-07-01T02:20:00Z", r: [{ by: MOM, emoji: "😄" }] },
    ],
  },
  {
    label: GRANDMA,
    is_mission: false,
    at: "2026-06-30T03:00:00Z", // 어제
    cards: [
      { author: GRANDMA, img: pic("garden"), at: "2026-06-30T03:01:00Z", r: [{ by: MOM, emoji: "🥰" }, { by: DAD, emoji: "❤️" }, { by: SISTER, emoji: "👏" }, { by: MOM, emoji: "❤️", photo: pic("garden-love") }] },
    ],
  },
  {
    label: DAD,
    is_mission: false,
    at: "2026-06-29T03:00:00Z", // 2일 전
    cards: [
      { author: DAD, img: pic("fishing"), at: "2026-06-29T03:01:00Z", r: [{ by: MOM, emoji: "👍" }, { by: SISTER, emoji: "🎣" }] },
      { author: SISTER, img: pic("fish-cook"), reply: true, at: "2026-06-29T03:30:00Z", r: [{ by: DAD, emoji: "😋" }] },
    ],
  },
  {
    label: SISTER,
    is_mission: false,
    at: "2026-06-28T03:00:00Z", // 3일 전
    cards: [
      { author: SISTER, img: pic("cafe"), at: "2026-06-28T03:01:00Z", r: [{ by: MOM, emoji: "☕️" }, { by: GRANDMA, emoji: "😍" }] },
      { author: MOM, img: pic("dessert"), reply: true, at: "2026-06-28T03:20:00Z", r: [{ by: SISTER, emoji: "😋" }] },
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
  // 1) 데모 계정 프로필(이름) 업서트
  await api("POST", "profiles", PROFILES.map((p) => ({ ...p, avatar_url: null })), {
    ...REP,
    Prefer: "resolution=merge-duplicates,return=representation",
  });
  console.log(`✓ 프로필 업서트: ${PROFILES.map((p) => p.name).join(", ")}`);

  // 2) 기존 시드 정리(멱등)
  const wiped = await wipeRoom();
  console.log(`✓ 기존 덱 정리: ${wiped}개`);

  // 3) 덱 → 카드 → 반응 삽입
  let nCards = 0;
  let nReactions = 0;
  for (const d of DECKS) {
    const [deck] = await api("POST", "decks", { room: ROOM, label: d.label, is_mission: d.is_mission, created_at: d.at }, REP);
    for (const c of d.cards) {
      const [card] = await api("POST", "cards", { deck_id: deck.id, author: c.author, image_url: c.img, is_reply: !!c.reply, created_at: c.at }, REP);
      nCards++;
      for (const rx of c.r) {
        await api("POST", "reactions", { card_id: card.id, author: rx.by, emoji: rx.emoji, image_url: rx.photo ?? null });
        nReactions++;
      }
    }
    console.log(`  · 덱 "${d.label}" (카드 ${d.cards.length})`);
  }
  console.log(`✓ 완료: 덱 ${DECKS.length} · 카드 ${nCards} · 반응 ${nReactions}`);
  console.log(`\n방 "${ROOM}" (코드 4444)에 시연용 목업이 준비됐어요.`);
}

main().catch((e) => {
  console.error("시드 실패:", e.message);
  process.exit(1);
});
