// Shared room/deck/card shapes used by the UI and the data layer.

export type Card = {
  id?: string; // db id (present when backed by Supabase)
  who: string;
  mine: boolean;
  date: string;
  iso?: string; // 원본 created_at(ISO) — 리캡 기간 필터용
  ov: string;
  reply?: boolean;
  img?: string; // captured + edited photo (URL or data URL)
  reactions?: string[]; // emojis reacted to this card
  photoReactions?: { emoji: string; img: string }[]; // 즉석 원형 사진 반응(이모지 배지 + 사진)
  reactors?: string[]; // 이 카드에 반응한 사람들(작성자 키=이메일) — 중복 제거
};

export type Deck = {
  id?: string;
  label: string;
  when: string;
  isMission: boolean;
  cards: Card[];
};

export type RoomsData = Record<string, Deck[]>;
