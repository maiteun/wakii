// Shared room/deck/card shapes used by the UI and the data layer.

export type Card = {
  id?: string; // db id (present when backed by Supabase)
  who: string;
  mine: boolean;
  date: string;
  ov: string;
  reply?: boolean;
  img?: string; // captured + edited photo (URL or data URL)
  reactions?: string[]; // emojis reacted to this card
  photoReactions?: { emoji: string; img: string }[]; // 즉석 원형 사진 반응(이모지 배지 + 사진)
};

export type Deck = {
  id?: string;
  label: string;
  when: string;
  isMission: boolean;
  cards: Card[];
};

export type RoomsData = Record<string, Deck[]>;
