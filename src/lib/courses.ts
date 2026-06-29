// wakii — walking courses ("워키 여정").
// One course = one landmark = one independent journey (A 구조).
// distance_km: real measured walking-route values (fixed).
// steps: 1km ≈ 1,350 steps (0.74m stride) — provisional, to be swapped
//        once the final step conversion is decided.

export type Course = {
  id: string;
  name_ko: string;
  name_en: string;
  distance_km: number;
  steps: number;
  ar: number; // image aspect ratio (height / width) — fixes width on the map
};

export const COURSES: Course[] = [
  { id: "hallasan", name_ko: "한라산", name_en: "Hallasan", distance_km: 19.2, steps: 25920, ar: 0.886 },
  { id: "colosseum", name_ko: "콜로세움", name_en: "Colosseum", distance_km: 17.0, steps: 22950, ar: 0.812 },
  { id: "angkor_wat", name_ko: "앙코르와트", name_en: "Angkor Wat", distance_km: 18.0, steps: 24300, ar: 1.0 },
  { id: "taj_mahal", name_ko: "타지마할", name_en: "Taj Mahal", distance_km: 15.3, steps: 20655, ar: 0.978 },
  { id: "moai", name_ko: "모아이", name_en: "Moai", distance_km: 16.4, steps: 22140, ar: 1.029 },
  { id: "eiffel_tower", name_ko: "에펠탑", name_en: "Eiffel Tower", distance_km: 15.4, steps: 20790, ar: 1.585 },
  { id: "mount_fuji", name_ko: "후지산", name_en: "Mount Fuji", distance_km: 19.0, steps: 25650, ar: 0.815 },
  { id: "santorini", name_ko: "산토리니", name_en: "Santorini", distance_km: 15.2, steps: 20520, ar: 1.049 },
  { id: "statue_of_liberty", name_ko: "자유의 여신상", name_en: "Statue of Liberty", distance_km: 16.3, steps: 22005, ar: 1.059 },
  { id: "santiago_cathedral", name_ko: "산티아고 대성당", name_en: "Santiago de Compostela", distance_km: 19.9, steps: 26865, ar: 1.222 },
  { id: "times_square", name_ko: "타임스퀘어", name_en: "Times Square", distance_km: 15.1, steps: 20385, ar: 1.193 },
];

export const courseById = (id: string): Course | undefined => COURSES.find((c) => c.id === id);

// Island/landmark thumbnails live in public/assets/courses/<id>.png, mapped by
// id. angkor_wat has no image yet → null, render a placeholder. Add the missing
// PNG later and this picks it up automatically.
const WITH_IMAGE = new Set<string>([
  "hallasan",
  "colosseum",
  "taj_mahal",
  "moai",
  "eiffel_tower",
  "mount_fuji",
  "santorini",
  "statue_of_liberty",
  "santiago_cathedral",
  "times_square",
]);

export const courseImg = (id: string): string | null =>
  WITH_IMAGE.has(id) ? `/assets/courses/${id}.png` : null;

// Base art for an UNSELECTED (다음 목적지) node — a bare island the cloud + "?"
// sit on. Drop public/assets/courses/empty_island.png and set this to that path;
// until then the map draws a gray placeholder. Cloud and "?" are always app
// layers (the cloud's opacity is animated), never baked into the image.
export const EMPTY_ISLAND_IMG: string | null = null;
