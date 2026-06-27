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
export async function createPhotoDeck(room: string, author: string, imageUrl: string) {
  if (!supabase) return;
  const { data: deck, error } = await supabase
    .from("decks")
    .insert({ room, label: author, is_mission: false })
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

export async function addReaction(cardId: string, author: string, emoji: string) {
  if (!supabase) return;
  await supabase.from("reactions").insert({ card_id: cardId, author, emoji });
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
  if (cardIds.length) {
    const { data: rx } = await supabase.from("reactions").select("card_id, emoji").in("card_id", cardIds);
    (rx || []).forEach((r: { card_id: string; emoji: string }) => {
      (reactionsByCard[r.card_id] = reactionsByCard[r.card_id] || []).push(r.emoji);
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
