import { supabase, PHOTO_BUCKET } from "./supabase";
import type { Deck, Card } from "./types";

// data:image/...;base64,xxxx  ->  Blob
function dataUrlToBlob(dataUrl: string): Blob {
  const [head, body] = dataUrl.split(",");
  const mime = head.match(/:(.*?);/)?.[1] || "image/jpeg";
  const bin = atob(body);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

function relWhen(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const dayMs = 86400000;
  const diff = Math.floor((+new Date(today.getFullYear(), today.getMonth(), today.getDate()) - +new Date(d.getFullYear(), d.getMonth(), d.getDate())) / dayMs);
  if (diff <= 0) return "오늘";
  if (diff === 1) return "어제";
  if (diff < 7) return `${diff}일 전`;
  return "지난주";
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
}

// Upload a data-URL photo to Storage and return its public URL.
export async function uploadPhoto(dataUrl: string): Promise<string> {
  if (!supabase) return dataUrl;
  const blob = dataUrlToBlob(dataUrl);
  const name = `${Date.now()}-${Math.round(Math.random() * 1e6)}.jpg`;
  const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(name, blob, {
    contentType: blob.type,
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(PHOTO_BUCKET).getPublicUrl(name).data.publicUrl;
}

// Insert a new deck + its first card.
export async function createPhotoDeck(
  room: string,
  author: string,
  imageUrl: string,
  opts?: { isMission?: boolean; label?: string },
) {
  if (!supabase) return;
  const { data: deck, error } = await supabase
    .from("decks")
    .insert({ room, label: opts?.label ?? author, is_mission: opts?.isMission ?? false })
    .select()
    .single();
  if (error) throw error;
  const { error: cardErr } = await supabase
    .from("cards")
    .insert({ deck_id: deck.id, author, image_url: imageUrl, is_reply: false });
  if (cardErr) throw cardErr;
}

// Add a reply card to an existing deck.
export async function addReplyCard(deckId: string, author: string, imageUrl: string | null) {
  if (!supabase) return;
  await supabase.from("cards").insert({ deck_id: deckId, author, image_url: imageUrl, is_reply: true });
}

// ── groups (rooms joinable by code) ─────────────────────────────────
function randomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing 0/O/1/I
  let s = "";
  for (let i = 0; i < 6; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

export type Group = { code: string; name: string; avatar?: string };
export type CreateResult = { ok: true; group: Group } | { ok: false; reason: "taken" };

// create a group. The creator chooses the code (it doubles as the room's
// password — they share it with family) and can embed a room photo. Codes are
// case-insensitive (stored uppercased). A duplicate code is rejected so two
// groups can't collide; any other backend error (e.g. groups table not yet
// created) falls back to a local code so the onboarding flow stays walkable.
export async function createGroup(name: string, code?: string, avatarUrl?: string): Promise<CreateResult> {
  const c = (code?.trim() || randomCode()).toUpperCase();
  const group: Group = { code: c, name, avatar: avatarUrl };
  if (!supabase) return { ok: true, group };
  let { error } = await supabase.from("groups").insert({ code: c, name, avatar_url: avatarUrl ?? null });
  // groups_avatar.sql 미실행 → avatar_url 컬럼 없음. 사진 없이라도 그룹은 저장(참여 가능해야 함).
  if (error && /avatar_url/i.test(error.message)) {
    ({ error } = await supabase.from("groups").insert({ code: c, name }));
    group.avatar = undefined;
  }
  if (!error) return { ok: true, group };
  if (/duplicate|unique/i.test(error.message)) return { ok: false, reason: "taken" };
  return { ok: true, group }; // table missing → accept locally
}

// look up a group by its join code. If the table is missing (error) we accept
// the code as a mock join so the flow can be tested; a genuine "not found"
// (table exists, no row) returns null.
export async function joinGroup(code: string): Promise<Group | null> {
  // demo backdoor: "1234" always joins, regardless of backend state
  if (code.trim() === "1234") return { code: "1234", name: "우리 가족" };
  if (!supabase) return { code: code.toUpperCase(), name: "우리 가족" };
  const { data, error } = await supabase
    .from("groups")
    .select("code, name, avatar_url")
    .eq("code", code.toUpperCase())
    .maybeSingle();
  if (error) return { code: code.toUpperCase(), name: "우리 가족" };
  if (!data) return null;
  return { code: data.code, name: data.name, avatar: data.avatar_url || undefined };
}

// every card I authored (any room) — for the My-page calendar
export async function listMyCards(author: string): Promise<{ createdAt: string; img: string | null }[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("cards")
    .select("created_at, image_url")
    .eq("author", author)
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data || []).map((c: { created_at: string; image_url: string | null }) => ({
    createdAt: c.created_at,
    img: c.image_url,
  }));
}

// ── profiles (email → display name + avatar, shared across devices) ──
// Identity key is the email (unique). No-op without a backend (mock mode
// keeps the profile in localStorage only).
export type Profile = { name?: string; avatar?: string };
export async function upsertProfile(email: string, name: string, avatarUrl?: string) {
  if (!supabase || !email) return;
  await supabase
    .from("profiles")
    .upsert({ email, name, avatar_url: avatarUrl ?? null, updated_at: new Date().toISOString() });
}

// email → {name, avatar} for everyone with a profile (small table; fetch all).
export async function listProfiles(): Promise<Record<string, Profile>> {
  if (!supabase) return {};
  const { data, error } = await supabase.from("profiles").select("email, name, avatar_url");
  if (error) return {};
  const map: Record<string, Profile> = {};
  (data || []).forEach((p: { email: string; name: string | null; avatar_url: string | null }) => {
    map[p.email] = { name: p.name || undefined, avatar: p.avatar_url || undefined };
  });
  return map;
}

export async function addReaction(
  cardId: string,
  author: string,
  emoji: string,
  imageUrl?: string,
) {
  if (!supabase) return;
  await supabase
    .from("reactions")
    .insert({ card_id: cardId, author, emoji, image_url: imageUrl ?? null });
}

// Take down a whole deck (the user's post + its thread). Cascade removes the
// deck's cards + reactions; we also remove the photos from Storage.
export async function deleteDeck(deckId: string) {
  if (!supabase) return;
  const { data: cards } = await supabase.from("cards").select("image_url").eq("deck_id", deckId);
  const files = (cards || [])
    .map((c: { image_url: string | null }) => c.image_url)
    .filter((u): u is string => Boolean(u))
    .map((u) => u.split("/").pop() as string)
    .filter(Boolean);
  await supabase.from("decks").delete().eq("id", deckId);
  if (files.length) await supabase.storage.from(PHOTO_BUCKET).remove(files);
}

// Fetch every deck (newest first) for a room, with cards + reactions,
// mapped into the UI's Deck shape. `me` decides the `mine` flag.
export async function listRoom(room: string, me: string): Promise<Deck[]> {
  if (!supabase) return [];
  const { data: decks, error } = await supabase
    .from("decks")
    .select("id, label, is_mission, created_at, cards(id, author, image_url, is_reply, created_at)")
    .eq("room", room)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const cardIds = (decks || []).flatMap((d: { cards?: { id: string }[] }) => (d.cards || []).map((c) => c.id));
  const reactionsByCard: Record<string, string[]> = {};
  const photoReactionsByCard: Record<string, { emoji: string; img: string }[]> = {};
  if (cardIds.length) {
    const { data: rx } = await supabase
      .from("reactions")
      .select("card_id, emoji, image_url")
      .in("card_id", cardIds);
    (rx || []).forEach((r: { card_id: string; emoji: string; image_url: string | null }) => {
      if (r.image_url) {
        (photoReactionsByCard[r.card_id] = photoReactionsByCard[r.card_id] || []).push({
          emoji: r.emoji,
          img: r.image_url,
        });
      } else {
        (reactionsByCard[r.card_id] = reactionsByCard[r.card_id] || []).push(r.emoji);
      }
    });
  }

  type DbCard = { id: string; author: string; image_url: string | null; is_reply: boolean; created_at: string };
  type DbDeck = { id: string; label: string; is_mission: boolean; created_at: string; cards?: DbCard[] };

  return (decks as DbDeck[]).map((d) => {
    const cards: Card[] = (d.cards || [])
      .slice()
      .sort((a, b) => +new Date(a.created_at) - +new Date(b.created_at))
      .map((c) => ({
        id: c.id,
        who: c.author,
        mine: c.author === me,
        date: fmtDate(c.created_at),
        ov: "",
        reply: c.is_reply,
        img: c.image_url || undefined,
        reactions: reactionsByCard[c.id] || [],
        photoReactions: photoReactionsByCard[c.id] || [],
      }));
    return { id: d.id, label: d.label, when: relWhen(d.created_at), isMission: d.is_mission, cards };
  });
}

// Subscribe to any change in a room's data; calls cb() so the caller refetches.
export function subscribeRoom(room: string, cb: () => void) {
  const sb = supabase;
  if (!sb) return () => {};
  const ch = sb
    .channel(`room:${room}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "decks", filter: `room=eq.${room}` }, cb)
    .on("postgres_changes", { event: "*", schema: "public", table: "cards" }, cb)
    .on("postgres_changes", { event: "*", schema: "public", table: "reactions" }, cb)
    .subscribe();
  return () => {
    sb.removeChannel(ch);
  };
}
