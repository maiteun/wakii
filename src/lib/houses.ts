// "우리 집" art shown on the home screen. Chosen during onboarding and
// changeable later by long-pressing the house. Images live in
// public/assets/house/<id>.png.

export type House = { id: string; label: string };

export const HOUSES: House[] = [
  { id: "white_cottage_house", label: "화이트 코티지" },
  { id: "cottage_house", label: "우드 코티지" },
  { id: "mint_cottage_house", label: "민트 코티지" },
  { id: "pink_cottage_house", label: "핑크 코티지" },
  { id: "brick_apartment_house", label: "벽돌 아파트" },
  { id: "blue_modern_house", label: "블루 모던" },
  { id: "black_modern_house", label: "블랙 모던" },
  { id: "kiwa_house", label: "기와집" },
];

export const houseImg = (id: string): string => `/assets/house/${id}.png`;
export const DEFAULT_HOUSE = "white_cottage_house";
