"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import PhotoEditor, { type PhotoEditorHandle } from "./PhotoEditor";
import InstantCapture from "./InstantCapture";
import type { Card, Deck, RoomsData } from "@/lib/types";
import { hasSupabase } from "@/lib/supabase";
import { COURSES, courseById, courseImg, EMPTY_ISLANDS, EMPTY_ISLAND_AR } from "@/lib/courses";
import { HOUSES, houseImg, DEFAULT_HOUSE } from "@/lib/houses";
import {
  listRoom,
  subscribeRoom,
  listRoomSummaries,
  subscribeAllRooms,
  uploadPhoto,
  createPhotoDeck,
  addReplyCard,
  addReaction,
  deleteDeck,
  listMyCards,
  createGroup,
  joinGroup,
  upsertProfile,
  listProfiles,
  type Group,
  type Profile,
  type RoomSummary,
} from "@/lib/db";

// WebGL gallery is client-only (uses window / WebGL at runtime)
const CircularGallery = dynamic(() => import("./CircularGallery"), { ssr: false });

// role shown on each card by its position in the deck
const roleLabel = (i: number) => (i === 0 ? "" : `${i}차 반응자`);
// 스탬프 화면 섬 흩뿌림 위치(디자인처럼 랜덤한 느낌). 인덱스로 순환.
const STAMP_SCATTER: React.CSSProperties[] = [
  { top: "5%", left: "4%", width: "47%" },
  { top: "0%", left: "53%", width: "42%" },
  { top: "34%", left: "27%", width: "50%" },
  { top: "62%", left: "5%", width: "45%" },
  { top: "57%", left: "53%", width: "42%" },
  { top: "40%", left: "62%", width: "37%" },
];

// 홈 방 목록의 "n분 전" — 분/시간 단위까지 보여주는 상대 시각.
const relTime = (iso: string): string => {
  const sec = Math.max(0, Math.floor((Date.now() - +new Date(iso)) / 1000));
  if (sec < 60) return "방금";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}분 전`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}시간 전`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "어제";
  if (day < 7) return `${day}일 전`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}주 전`;
  return `${Math.floor(day / 30)}개월 전`;
};

// 완주 리캡 큐레이션 — 작성자별 "best 1"(가장 반응 많은 사진) 한 장씩.
// B안: 코스별 시작 시각(startedAt)이 아직 없어 여정 기간을 가를 수 없으므로
// 지금은 그룹 방 사진 전체를 기준으로 실시간 계산한다. A안(완주 시점 스냅샷)으로
// 갈 땐 deck 소스만 "그 코스 기간의 카드"로 바꾸면 된다.
export type RecapPhoto = { who: string; img: string; count: number; emojis: string[] };
function curateRecap(decks: Deck[]): RecapPhoto[] {
  const byAuthor = new Map<string, Card[]>();
  decks.forEach((d) =>
    d.cards.forEach((c) => {
      if (!c.img) return;
      const list = byAuthor.get(c.who);
      if (list) list.push(c);
      else byAuthor.set(c.who, [c]);
    }),
  );
  const out: RecapPhoto[] = [];
  byAuthor.forEach((cards, who) => {
    // 반응 수 → 동점이면 이모지 종류 수 (반응 0이어도 사진 있으면 한 장은 뽑힘)
    const rcount = (c: Card) => (c.reactions?.length ?? 0) + (c.photoReactions?.length ?? 0);
    const best = cards.slice().sort((a, b) => {
      const diff = rcount(b) - rcount(a);
      if (diff !== 0) return diff;
      return new Set(b.reactions).size - new Set(a.reactions).size;
    })[0];
    out.push({ who, img: best.img as string, count: rcount(best), emojis: best.reactions ?? [] });
  });
  // 반응 많은 사람 먼저
  return out.sort((a, b) => b.count - a.count);
}

// 기기에서 고른 사진을 ~max px로 줄여 data URL로. 프로필/방 대표 사진 공용.
function downscaleImage(file: File, max = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d")?.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL("image/jpeg", 0.85));
      };
      img.onerror = reject;
      img.src = String(reader.result || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// today's mission, noun-ified for the mission deck label/footer
const MISSION_NAME = "오늘의 풍경";

// map an Open-Meteo weather code to an emoji
function weatherEmoji(code: number): string {
  if (code === 0) return "☀️";
  if (code <= 2) return "⛅";
  if (code === 3) return "☁️";
  if (code === 45 || code === 48) return "🌫️";
  if (code >= 51 && code <= 67) return "🌧️";
  if (code >= 71 && code <= 77) return "❄️";
  if (code >= 80 && code <= 82) return "🌦️";
  if (code >= 85 && code <= 86) return "🌨️";
  if (code >= 95) return "⛈️";
  return "🌤️";
}

// reaction palette (long-press an emoji → instant photo reply)
const REACTIONS = [
  { emoji: "❤️", label: "하트" },
  { emoji: "🙂", label: "스마일" },
  { emoji: "👍", label: "좋아요" },
  { emoji: "😂", label: "슬퍼요" },
  { emoji: "😮", label: "놀라요" },
];

// AI-suggested phrases (long-press 텍스트); tapping one showers the phrase
const AI_PHRASES = ["파이팅!", "예쁘다!", "슬프다", "최고야!", "보고싶어"];

// gallery card image: real photos pass through as-is; cards without a photo
// get a gradient placeholder. The author shows as the label below the card.
function buildGalleryImage(card: Card): string {
  if (card.img) return card.img;
  const w = 600,
    h = 800;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const g = ctx.createLinearGradient(0, 0, w, h);
  if (card.mine) {
    g.addColorStop(0, "#6a6a6a");
    g.addColorStop(1, "#3a3a3a");
  } else {
    g.addColorStop(0, "#8a8a8a");
    g.addColorStop(1, "#5e5e5e");
  }
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  if (card.ov) {
    ctx.font = "240px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(card.ov, w / 2, h / 2);
  }
  return canvas.toDataURL("image/png");
}

// cloud image (alpha PNG) laid OVER a landmark; opacity = how "covered" a
// journey node is (1 = hidden/미선택, 0 = fully revealed/완주). Always an app
// layer, never baked into the landmark image.
const CLOUD_IMG = "/assets/walk/cloud.png";
// per-node rotation/flip breaks up the "same shape repeated" look
function CloudOverlay({
  cx,
  cy,
  size,
  op,
  rot = 0,
  flip = false,
}: {
  cx: number;
  cy: number;
  size: number;
  op: number;
  rot?: number;
  flip?: boolean;
}) {
  if (op <= 0.01) return null;
  const t = [`rotate(${rot} ${cx} ${cy})`];
  if (flip) t.push(`translate(${2 * cx} 0) scale(-1 1)`); // mirror around cx
  return (
    <image
      href={CLOUD_IMG}
      x={cx - size / 2}
      y={cy - size / 2}
      width={size}
      height={size}
      opacity={op}
      transform={t.join(" ")}
      preserveAspectRatio="xMidYMid meet"
      style={{ pointerEvents: "none" }}
    />
  );
}

/* ===================================================================
   wakii — full prototype, ported from khux-prototype-full.html to React.
   Behaviour and visuals match the original; logic is driven by React
   state instead of imperative DOM mutation so it's easy to iterate on.
   =================================================================== */

type ScreenId = "home" | "room" | "walk" | "my";



const initialRooms: RoomsData = {
  엄마아빠: [
    {
      label: "오늘의 풍경",
      when: "오늘",
      isMission: true,
      cards: [
        { who: "나", mine: true, date: "2026. 6. 26", ov: "🌻" },
        { who: "엄마", mine: false, date: "2026. 6. 26", ov: "🌷" },
      ],
    },
    {
      label: "엄마",
      when: "어제",
      isMission: false,
      cards: [
        { who: "엄마", mine: false, date: "2026. 6. 25", ov: "🌅" },
        { who: "나", mine: true, date: "2026. 6. 25", ov: "☕️", reply: true },
        { who: "아빠", mine: false, date: "2026. 6. 26", ov: "" },
      ],
    },
    {
      label: "아빠",
      when: "지난주",
      isMission: false,
      cards: [
        { who: "아빠", mine: false, date: "2026. 6. 18", ov: "🍱" },
        { who: "나", mine: true, date: "2026. 6. 18", ov: "🌧️", reply: true },
      ],
    },
  ],
  언니: [
    {
      label: "언니",
      when: "어제",
      isMission: false,
      cards: [
        { who: "언니", mine: false, date: "2026. 6. 25", ov: "🐶" },
        { who: "나", mine: true, date: "2026. 6. 25", ov: "🍙", reply: true },
      ],
    },
  ],
  동생: [
    {
      label: "동생",
      when: "3일 전",
      isMission: false,
      cards: [{ who: "동생", mine: false, date: "2026. 6. 23", ov: "☕️" }],
    },
  ],
  할머니: [
    {
      label: "할머니",
      when: "지난주",
      isMission: false,
      cards: [{ who: "할머니", mine: false, date: "2026. 6. 19", ov: "🌷" }],
    },
  ],
};

const uploadedDays: Record<number, number> = {
  1: 2, 5: 1, 8: 3, 11: 1, 12: 2, 13: 1, 17: 1, 23: 2, 24: 1, 25: 3, 26: 1,
};
const stepsByDay: Record<number, number> = {
  1: 5400, 5: 7100, 8: 3200, 11: 8800, 12: 6600, 13: 4100, 17: 9200, 23: 5800, 24: 6200, 25: 7400, 26: 6200,
};

type Bubble = { id: number; emoji: string; img?: string; text?: boolean; left: number; size: number; dx: number; dy: number; dur: number; delay: number };
type UploadMode = "new" | "mission" | "room" | "reply";

export default function WakiiApp() {
  const [screen, setScreen] = useState<ScreenId>("home");

  // toast
  const [toastMsg, setToastMsg] = useState("");
  const [toastShown, setToastShown] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = (m: string) => {
    setToastMsg(m);
    setToastShown(true);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastShown(false), 1700);
  };

  // identity + onboarding (login → email+name → group). 신원 키 = 이메일(고유).
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [nameDraft, setNameDraft] = useState("");
  const [emailDraft, setEmailDraft] = useState("");
  const author = email || name || "나"; // DB에 저장되는 작성자 키(고유 이메일)
  type ObStep = "login" | "name" | "house" | "group" | "create" | "join" | "code" | "joined";
  // "우리 집" art: chosen at onboarding, changeable via long-press on home
  const [house, setHouse] = useState(DEFAULT_HOUSE);
  const [housePicker, setHousePicker] = useState(false);
  const [stampOpen, setStampOpen] = useState(false); // 스탬프(완주 코스 컬렉션) 화면
  const [avatar, setAvatar] = useState<string | null>(null); // 마이 프로필 사진(data URL or 업로드 URL)
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const [profileMap, setProfileMap] = useState<Record<string, Profile>>({}); // 이메일 → {name, avatar} (팀원 포함)
  // 작성자 키(이메일) → 표시 이름 / 아바타. 프로필 없으면 키 그대로(시드 데이터 등).
  const nameOf = (key: string) => profileMap[key]?.name || key;
  const avatarOf = (key: string) => profileMap[key]?.avatar;
  // 팀원 프로필(DB) + 내 프로필(로컬)을 합쳐 갱신 — profiles 테이블이 비어도 내 사진/이름은 항상 보이게.
  const syncProfiles = useCallback(() => {
    listProfiles().then((m) =>
      setProfileMap(email ? { ...m, [email]: { name: name || m[email]?.name, avatar: avatar || m[email]?.avatar } } : m),
    );
  }, [email, name, avatar]);
  const [obStep, setObStep] = useState<ObStep>("login");
  const [addingGroup, setAddingGroup] = useState(false); // opening the group flow from "+"
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [groupNameDraft, setGroupNameDraft] = useState("");
  const [groupCodeDraft, setGroupCodeDraft] = useState(""); // 만든 사람이 정하는 코드(=비번)
  const [groupPhotoDraft, setGroupPhotoDraft] = useState<string | null>(null); // 방 대표 사진(생성 시)
  const groupPhotoRef = useRef<HTMLInputElement>(null);
  const [joinCodeDraft, setJoinCodeDraft] = useState("");
  const [pendingGroup, setPendingGroup] = useState<Group | null>(null); // created/joined, awaiting confirm
  const [pendingJoinCode, setPendingJoinCode] = useState(""); // from an invite deep-link (/?j=CODE), joined after onboarding
  const needSetup = !name || !email || myGroups.length === 0;

  // rooms — start empty on the backend (real data); seeded demo only in mock mode
  const [rooms, setRooms] = useState<RoomsData>(hasSupabase ? {} : initialRooms);
  // 홈 방 목록: 방별 최근 활동 시각 + 안 읽은 수
  const [roomSummaries, setRoomSummaries] = useState<Record<string, RoomSummary>>({});
  // 이 기기가 각 방을 마지막으로 본 시각(방 입장 시 갱신) — 안 읽은 수 계산용
  const seenAtRef = useRef<Record<string, string>>({});
  const [currentRoom, setCurrentRoom] = useState("");
  const [currentRoomEmoji, setCurrentRoomEmoji] = useState("🏠");
  const [openDeckIdx, setOpenDeckIdx] = useState<number | null>(null);
  // 갤러리에서 지금 가운데 보이는 카드 인덱스 — 반응은 이 카드에만 붙는다
  const [activeCardIdx, setActiveCardIdx] = useState(0);
  const [galReact, setGalReact] = useState(false); // reaction row in the deck gallery
  const [dgMenuOpen, setDgMenuOpen] = useState(false); // deck gallery ⋯ menu (delete/close)
  const [peekImg, setPeekImg] = useState<string | null>(null); // long-press → original photo, no reactions
  const [replyEmoji, setReplyEmoji] = useState(""); // reaction emoji pre-placed on a reply photo
  const [instantEmoji, setInstantEmoji] = useState<string | null>(null); // emoji long-press → instant (non-editable) reaction photo
  const [replyDeckIdx, setReplyDeckIdx] = useState<number | null>(null);
  const [textReactOpen, setTextReactOpen] = useState(false);
  const [textReactDraft, setTextReactDraft] = useState("");
  const [phrasesOpen, setPhrasesOpen] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longFired = useRef(false);
  // 홈 바텀시트 끌어올리기 — 그립을 마우스/터치로 드래그하면 스크롤
  const homeScrollRef = useRef<HTMLDivElement>(null);
  const sheetDragY = useRef<number | null>(null);
  const onGripDown = (e: React.PointerEvent) => {
    sheetDragY.current = e.clientY;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onGripMove = (e: React.PointerEvent) => {
    if (sheetDragY.current == null || !homeScrollRef.current) return;
    homeScrollRef.current.scrollTop -= e.clientY - sheetDragY.current;
    sheetDragY.current = e.clientY;
  };
  const onGripUp = (e: React.PointerEvent) => {
    sheetDragY.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
  };
  const [roomViewMode, setRoomViewMode] = useState<"deck" | "review">("deck");
  const roomScreenRef = useRef<HTMLDivElement>(null);

  // reaction bubbles (shown in the deck gallery)
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const bubbleId = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null);

  // upload
  const [uploadShow, setUploadShow] = useState(false);
  const [uploadMode, setUploadMode] = useState<UploadMode>("new");
  const [shotTaken, setShotTaken] = useState(false);
  const [shareShow, setShareShow] = useState(false);
  const [shareTargets, setShareTargets] = useState<string[]>([]);
  const [recentRooms, setRecentRooms] = useState<string[]>([]);

  // camera
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedSrc, setCapturedSrc] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null); // camera capture fallback
  const galleryInputRef = useRef<HTMLInputElement>(null); // pick from library
  const editorRef = useRef<PhotoEditorHandle>(null);

  // recap
  const [recapShow, setRecapShow] = useState(false);
  const [recapTitle, setRecapTitle] = useState("");
  const [recapSub, setRecapSub] = useState("");
  const [recapCourseId, setRecapCourseId] = useState("");
  const [recapPhotos, setRecapPhotos] = useState<RecapPhoto[]>([]);

  // walk — course system (A 구조: one active course = one landmark; the whole
  // family's steps combine into the shared distance; finishing resets to 0 and
  // stamps the course; every course is re-selectable forever)
  const [walkSel, setWalkSel] = useState(0); // highlighted family member (avatar row)
  // demo seed: 콜로세움만 완주(맨 아래), 에펠탑이 진행 중(~56%)이라 그 위에
  // 구름이 절반쯤 덮인 상태로 보인다.
  const [activeCourseId, setActiveCourseId] = useState("eiffel_tower");
  const [familyKm, setFamilyKm] = useState(8.6); // combined distance on the active course (에펠탑 15.4km ≈ 56%)
  const [completedCourses, setCompletedCourses] = useState<string[]>(["colosseum"]);
  const [courseSheet, setCourseSheet] = useState(false);
  const [courseLoaded, setCourseLoaded] = useState(false);
  // journey map pan & zoom (the screen behaves like a real map)
  const [mapZoom, setMapZoom] = useState(0.82);
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 });
  const mapViewRef = useRef<HTMLDivElement>(null);
  const mapPtrs = useRef<Map<number, { x: number; y: number }>>(new Map());
  const mapDrag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const mapPinch = useRef<{ dist: number; zoom: number; px: number; py: number; mx: number; my: number } | null>(null);
  const mapInited = useRef(false);

  // calendar — my uploaded content per day (June 2026), from the DB
  const [calSel, setCalSel] = useState<number | null>(null);
  const [myDays, setMyDays] = useState<Record<number, string[]>>({});
  // step report range
  const [stepRange, setStepRange] = useState<"week" | "month">("week");

  // live weather for Seoul (Open-Meteo, no API key)
  const [weather, setWeather] = useState("🌤️ 서울");
  useEffect(() => {
    fetch("https://api.open-meteo.com/v1/forecast?latitude=37.5665&longitude=126.9780&current_weather=true")
      .then((r) => r.json())
      .then((d) => {
        const cw = d?.current_weather;
        if (cw) setWeather(`${weatherEmoji(cw.weathercode)} 서울·${Math.round(cw.temperature)}°`);
      })
      .catch(() => {});
  }, []);

  // ---------- navigation ----------
  const go = (id: ScreenId) => setScreen(id);

  const openRoom = (name: string, emoji: string) => {
    // 이 방을 본 시각 기록 → 안 읽은 수 초기화(이 기기 기준)
    seenAtRef.current = { ...seenAtRef.current, [name]: new Date().toISOString() };
    try {
      localStorage.setItem("wakii.seen", JSON.stringify(seenAtRef.current));
    } catch {
      /* ignore */
    }
    setRoomSummaries((s) => (s[name] ? { ...s, [name]: { ...s[name], unread: 0 } } : s));
    setCurrentRoom(name);
    setCurrentRoomEmoji(emoji);
    setOpenDeckIdx(null);
    setRoomViewMode("deck");
    setScreen("room");
  };

  // ---------- room board ----------
  const decks = rooms[currentRoom];
  const currentGroup = myGroups.find((g) => g.name === currentRoom); // 현재 방의 그룹(참여코드 등)
  const openDeck = openDeckIdx != null ? decks?.[openDeckIdx] : null;

  // chat-style: newest deck sits at the bottom; entering a room (or new
  // content) jumps to the bottom, and you scroll up to see older decks.
  useEffect(() => {
    if (screen === "room" && roomViewMode === "deck" && roomScreenRef.current) {
      const el = roomScreenRef.current;
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, currentRoom, roomViewMode, decks?.length]);

  // cards for the open deck, as image+label items for the circular gallery.
  // Built async because the author chip is composited onto each card image.
  const [galleryItems, setGalleryItems] = useState<{ image: string; text: string }[]>([]);
  useEffect(() => {
    if (openDeckIdx == null) {
      setGalleryItems([]);
      return;
    }
    const deck = rooms[currentRoom]?.[openDeckIdx];
    if (!deck) {
      setGalleryItems([]);
      return;
    }
    // 작성자는 카드 좌상단 글래스 칩(.dg-author)으로 보여주므로 갤러리 하단 라벨은 비운다
    setGalleryItems(deck.cards.map((c) => ({ image: buildGalleryImage(c), text: "" })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDeckIdx, currentRoom, rooms, profileMap]);

  // 덱을 새로 열면 활성 카드를 최신(마지막) 카드로 초기화 — 갤러리가 거기서 시작하므로.
  // (rooms 실시간 갱신엔 반응하지 않게 deck/room 변경 시에만 리셋)
  useEffect(() => {
    if (openDeckIdx == null) return;
    const len = rooms[currentRoom]?.[openDeckIdx]?.cards.length ?? 1;
    setActiveCardIdx(Math.max(0, len - 1));
    setDgMenuOpen(false); // 새 덱 열면 ⋯ 메뉴 닫기
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDeckIdx, currentRoom]);

  // load saved name + groups on mount; route the onboarding wizard
  useEffect(() => {
    let nm = "";
    let grps: Group[] = [];
    let em = "";
    try {
      nm = localStorage.getItem("wakii.name") || "";
      em = localStorage.getItem("wakii.email") || "";
    } catch {
      /* ignore */
    }
    try {
      grps = JSON.parse(localStorage.getItem("wakii.groups") || "[]");
    } catch {
      /* ignore */
    }
    if (nm) setName(nm);
    if (em) setEmail(em);
    setMyGroups(grps);
    let av = "";
    try {
      const h = localStorage.getItem("wakii.house");
      if (h) setHouse(h);
      av = localStorage.getItem("wakii.avatar") || "";
      if (av) setAvatar(av);
    } catch {
      /* ignore */
    }
    // 팀원 아바타(DB) + 내 프로필(로컬)을 합친다. profiles 테이블이 아직 비어 있어도
    // 내 사진/이름은 로컬값으로 항상 보이게 한다.
    listProfiles().then((m) =>
      setProfileMap(em ? { ...m, [em]: { name: nm || m[em]?.name, avatar: av || m[em]?.avatar } } : m),
    );

    // invite deep-link (/?j=CODE) — shared via KakaoTalk. Join automatically
    // instead of asking the user to read & type the code.
    let invite = "";
    try {
      invite = (new URLSearchParams(window.location.search).get("j") || "").trim();
    } catch {
      /* ignore */
    }
    if (invite) {
      // drop the param so a refresh / re-share doesn't re-trigger the join
      try {
        window.history.replaceState({}, "", window.location.pathname);
      } catch {
        /* ignore */
      }
      setPendingJoinCode(invite);
      if (nm && em) {
        // already onboarded (email+name) → join straight away
        joinGroup(invite).then((g) => {
          if (g) {
            addGroup(g);
            toast(`${g.name}에 참여했어요`);
          } else {
            toast("초대 코드를 찾을 수 없어요");
            if (grps.length) setCurrentRoom(grps[0].name);
          }
          setPendingJoinCode("");
        });
      } else {
        // new/incomplete profile → login → email+name → auto-join
        if (nm) setNameDraft(nm);
        setObStep("login");
      }
      return;
    }

    const onboarded = nm && em;
    if (!onboarded && nm) setNameDraft(nm); // 이름은 채워두고 이메일만 더 받기
    setObStep(onboarded ? "group" : "login");
    if (onboarded && grps.length) setCurrentRoom(grps[0].name);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const chooseHouse = (id: string) => {
    setHouse(id);
    try {
      localStorage.setItem("wakii.house", id);
    } catch {
      /* ignore */
    }
  };
  // profile photo: pick from device, downscale, persist + share via profiles
  const pickAvatar = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    downscaleImage(f)
      .then((url) => {
        setAvatar(url); // 즉시 반영(내 화면)
        toast("프로필 사진을 바꿨어요");
        // 팀원에게도 보이도록 Storage 업로드 → profiles(email) 테이블에 저장
        const persist = (saved: string) => {
          try {
            localStorage.setItem("wakii.avatar", saved);
          } catch {
            /* ignore */
          }
          if (email) {
            setProfileMap((m) => ({ ...m, [email]: { name, avatar: saved } })); // 내 화면 즉시 매핑
            upsertProfile(email, name, saved).then(() => syncProfiles());
          }
        };
        if (hasSupabase) {
          uploadPhoto(url)
            .then((publicUrl) => {
              setAvatar(publicUrl);
              persist(publicUrl);
            })
            .catch(() => persist(url));
        } else {
          persist(url);
        }
      })
      .catch(() => {});
  };
  // routing after identity (name + house) is set: invite link → auto-join,
  // otherwise the group step
  const afterIdentity = () => {
    if (pendingJoinCode) {
      joinGroup(pendingJoinCode).then((g) => {
        if (g) {
          addGroup(g);
          toast(`${g.name}에 참여했어요`);
        } else {
          toast("초대 코드를 찾을 수 없어요");
          setObStep("group");
        }
        setPendingJoinCode("");
      });
      return;
    }
    setObStep("group");
  };
  // 이메일(신원 키) + 이름(표시명)으로 프로필 생성
  const saveName = () => {
    const v = nameDraft.trim();
    const em = emailDraft.trim().toLowerCase();
    if (!v) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(em)) {
      toast("이메일을 정확히 입력해주세요");
      return;
    }
    setName(v);
    setEmail(em);
    try {
      localStorage.setItem("wakii.name", v);
      localStorage.setItem("wakii.email", em);
    } catch {
      /* ignore */
    }
    setProfileMap((m) => ({ ...m, [em]: { name: v, avatar: m[em]?.avatar } })); // 내 화면 즉시 매핑
    upsertProfile(em, v, avatar || undefined).then(() => syncProfiles());
    setObStep("house"); // pick "우리 집" before joining/creating a group
  };
  // social login UI — real OAuth (Kakao/Naver/Google/Apple) is wired later.
  // Once Kakao login is connected the display name will come from the Kakao
  // profile and the name step can be skipped; for now we ask for it.
  const pickLogin = (_provider: string) => setObStep("name");

  // ---------- groups (rooms by code) ----------
  const addGroup = (g: Group) => {
    setMyGroups((prev) => {
      const next = prev.some((x) => x.code === g.code) ? prev : [...prev, g];
      try {
        localStorage.setItem("wakii.groups", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
    setCurrentRoom(g.name);
    setAddingGroup(false);
    setObStep("login");
  };
  const doCreateGroup = async () => {
    const nm = groupNameDraft.trim();
    const code = groupCodeDraft.trim();
    if (!nm) {
      toast("그룹 이름을 입력해주세요");
      return;
    }
    if (code.length < 4) {
      toast("코드는 4자 이상으로 정해주세요");
      return;
    }
    try {
      // 방 대표 사진: Supabase면 업로드해 URL로, 아니면 data URL 그대로
      let avatarUrl: string | undefined;
      if (groupPhotoDraft) {
        avatarUrl = hasSupabase ? await uploadPhoto(groupPhotoDraft).catch(() => undefined) : groupPhotoDraft;
      }
      const res = await createGroup(nm, code, avatarUrl);
      if (!res.ok) {
        toast("이미 쓰는 코드예요 — 다른 코드로 해주세요");
        return;
      }
      setPendingGroup(res.group);
      setGroupNameDraft("");
      setGroupCodeDraft("");
      setGroupPhotoDraft(null);
      setObStep("code");
    } catch {
      toast("그룹 생성 실패 — 다시 시도해주세요");
    }
  };
  // 방 대표 사진 선택(생성 단계)
  const pickGroupPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    downscaleImage(f).then(setGroupPhotoDraft).catch(() => {});
  };
  const doJoinGroup = async () => {
    const code = joinCodeDraft.trim();
    if (!code) return;
    const g = await joinGroup(code);
    if (!g) {
      toast("코드를 찾을 수 없어요");
      return;
    }
    setPendingGroup(g);
    setJoinCodeDraft("");
    setObStep("joined");
  };
  const copyCode = () => {
    if (pendingGroup) navigator.clipboard?.writeText(pendingGroup.code).then(() => toast("코드를 복사했어요"), () => {});
  };
  // share an invite LINK (opens the phone's share sheet → pick KakaoTalk).
  // Opening the link auto-joins the group, so no code typing is needed.
  // Falls back to copying the link when the Web Share API is unavailable.
  const shareInvite = async (g: Group) => {
    const url = `${window.location.origin}/?j=${encodeURIComponent(g.code)}`;
    const text = `wakii에서 "${g.name}" 그룹에 초대했어요 🐾\n링크를 누르면 바로 들어와요.`;
    try {
      if (typeof navigator !== "undefined" && navigator.share) {
        await navigator.share({ title: "wakii 초대", text, url });
        return;
      }
    } catch {
      return; // user dismissed the share sheet
    }
    try {
      await navigator.clipboard.writeText(url);
      toast("초대 링크를 복사했어요");
    } catch {
      toast(url);
    }
  };
  const openAddGroup = () => {
    setAddingGroup(true);
    setObStep("group");
  };

  // remember recently-shared room order (for the share sheet)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("wakii.recentRooms");
      if (saved) setRecentRooms(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  }, []);

  // ── backend (Supabase) vs mock (localStorage) ──────────────────────
  const refreshRoom = useCallback(
    (room: string) => {
      listRoom(room, author)
        .then((decks) => setRooms((r) => ({ ...r, [room]: decks })))
        .catch(() => {});
    },
    [author],
  );

  // fetch + live-subscribe the current room when backed by Supabase
  useEffect(() => {
    if (!hasSupabase) return;
    refreshRoom(currentRoom);
    syncProfiles(); // 새로 들어온 팀원 아바타 + 내 프로필 반영
    const unsub = subscribeRoom(currentRoom, () => refreshRoom(currentRoom));
    return unsub;
  }, [currentRoom, refreshRoom, syncProfiles]);

  // 홈 방 목록 요약(최근 활동·안 읽은 수) — 마운트 시 last-seen 로드
  useEffect(() => {
    try {
      seenAtRef.current = JSON.parse(localStorage.getItem("wakii.seen") || "{}");
    } catch {
      /* ignore */
    }
  }, []);

  const refreshSummaries = useCallback(() => {
    if (!hasSupabase) return;
    const names = myGroups.map((g) => g.name);
    listRoomSummaries(names, author, seenAtRef.current).then(setRoomSummaries).catch(() => {});
  }, [myGroups, author]);

  // 홈에 있을 때 요약을 불러오고, 누군가 새 글/답장을 올리면 실시간 갱신
  useEffect(() => {
    if (!hasSupabase || screen !== "home") return;
    refreshSummaries();
    const unsub = subscribeAllRooms(refreshSummaries);
    return unsub;
  }, [screen, refreshSummaries]);

  // mock DB fallback: persist rooms to localStorage
  useEffect(() => {
    if (hasSupabase) return;
    try {
      const saved = localStorage.getItem("wakii.rooms");
      if (saved) setRooms(JSON.parse(saved));
    } catch {
      /* ignore corrupt/unavailable storage */
    }
  }, []);
  useEffect(() => {
    if (hasSupabase) return;
    try {
      localStorage.setItem("wakii.rooms", JSON.stringify(rooms));
    } catch {
      /* quota or unavailable — fine for the prototype */
    }
  }, [rooms]);


  // ---------- emoji react ----------
  // record a reaction onto the open deck's author card in LOCAL state so it
  // replays when the deck is re-opened (and persists in mock mode). Supabase
  // mode additionally writes to the server.
  const recordReaction = (emoji: string) => {
    if (openDeckIdx == null) return;
    const ci = activeCardIdx;
    setRooms((prev) => {
      const list = prev[currentRoom];
      if (!list || !list[openDeckIdx] || !list[openDeckIdx].cards[ci]) return prev;
      const next = list.map((dk, i) => {
        if (i !== openDeckIdx) return dk;
        const cards = dk.cards.slice();
        const reactors = (cards[ci].reactors || []).includes(author)
          ? cards[ci].reactors
          : [...(cards[ci].reactors || []), author];
        cards[ci] = { ...cards[ci], reactions: [...(cards[ci].reactions || []), emoji], reactors };
        return { ...dk, cards };
      });
      return { ...prev, [currentRoom]: next };
    });
    if (hasSupabase) {
      const cardId = openDeck?.cards[ci]?.id;
      if (cardId) addReaction(cardId, author, emoji).then(() => refreshRoom(currentRoom));
    }
  };
  // 즉석 원형 사진 반응: 이모지 반응처럼 덱에 저장 → 재진입 시 같은 모션으로 재생.
  const recordPhotoReaction = (emoji: string, img: string) => {
    if (openDeckIdx == null) return;
    const ci = activeCardIdx;
    setRooms((prev) => {
      const list = prev[currentRoom];
      if (!list || !list[openDeckIdx] || !list[openDeckIdx].cards[ci]) return prev;
      const next = list.map((dk, i) => {
        if (i !== openDeckIdx) return dk;
        const cards = dk.cards.slice();
        const reactors = (cards[ci].reactors || []).includes(author)
          ? cards[ci].reactors
          : [...(cards[ci].reactors || []), author];
        cards[ci] = { ...cards[ci], photoReactions: [...(cards[ci].photoReactions || []), { emoji, img }], reactors };
        return { ...dk, cards };
      });
      return { ...prev, [currentRoom]: next };
    });
    if (hasSupabase) {
      const cardId = openDeck?.cards[ci]?.id;
      if (cardId) {
        uploadPhoto(img)
          .then((url) => addReaction(cardId, author, emoji, url))
          .then(() => refreshRoom(currentRoom))
          .catch(() => {});
      }
    }
  };
  const pickEmoji = (e: string) => {
    spawnBubble(e);
    toast(e + " 반응을 남겼어요");
    recordReaction(e);
  };
  // iMessage-style shower rising from across the bottom edge. With `img` set,
  // each bubble is the captured photo thumbnail (emoji as a corner badge).
  const spawnBubble = (e: string, img?: string, count?: number, isText?: boolean) => {
    const made: Bubble[] = [];
    // photos: fewer on screen and ~0.5× speed. 텍스트: 더 적게·더 천천히·넓게 시차를 둬서
    // 화면 전반에서 부드럽게 올라오게 한다(한쪽 쏠림 X).
    const n = count ?? (img ? 6 : isText ? 11 : 16);
    for (let i = 0; i < n; i++) {
      made.push({
        id: bubbleId.current++,
        emoji: e,
        img,
        text: isText,
        // 텍스트는 중앙 기준(렌더에서 translateX(-50%))으로 12~88% 전 영역에 분산.
        // 이모지·사진은 좌측 모서리 기준 전체 폭 분산.
        left: isText ? 28 + Math.random() * 44 : 4 + Math.random() * 92,
        size: img ? 46 + Math.random() * 34 : isText ? 18 + Math.random() * 12 : 20 + Math.random() * 18,
        dx: (Math.random() - 0.5) * (img ? 120 : isText ? 44 : 90),
        dy: -(420 + Math.random() * 360),
        // 텍스트는 4.4~7.4s로 느리게(기존 2.4~4.0보다 천천히)
        dur: img ? 4.8 + Math.random() * 3.2 : isText ? 4.4 + Math.random() * 3.0 : 2.4 + Math.random() * 1.6,
        // 텍스트는 시차를 넓게(0~1.1s) 둬서 한꺼번에 안 올라옴
        delay: Math.random() * (isText ? 1.1 : 0.6),
      });
    }
    setBubbles((b) => [...b, ...made]);
    const ids = made.map((m) => m.id);
    setTimeout(() => setBubbles((b) => b.filter((x) => !ids.includes(x.id))), img ? 9400 : isText ? 8200 : 4600);
  };

  // while a deck's gallery is open, its saved reactions keep gently floating
  // up (the motion doesn't just play once and vanish).
  useEffect(() => {
    if (openDeckIdx == null) return;
    const deck = rooms[currentRoom]?.[openDeckIdx];
    // 반응은 카드별 — 지금 보고 있는 카드(activeCardIdx)의 반응만 재생한다.
    const card = deck?.cards[activeCardIdx];
    const items: { emoji: string; img?: string }[] = card
      ? [
          ...(card.reactions || []).map((e) => ({ emoji: e })),
          ...(card.photoReactions || []),
        ]
      : [];
    if (!items.length) return;
    let i = 0;
    const id = setInterval(() => {
      const it = items[i % items.length];
      spawnBubble(it.emoji, it.img, it.img ? 2 : 3);
      i++;
    }, 1500);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openDeckIdx, currentRoom, rooms, activeCardIdx]);

  // ---------- press (short tap vs long press) ----------
  const startPress = (onLong: () => void) => {
    longFired.current = false;
    if (pressTimer.current) clearTimeout(pressTimer.current);
    pressTimer.current = setTimeout(() => {
      longFired.current = true;
      onLong();
    }, 450);
  };
  const endPress = (onShort: () => void) => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
    if (!longFired.current) onShort();
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  // ---------- reply (instant photo into the open deck) ----------
  const sendReply = async (deckIdx: number, dataUrl: string) => {
    const deck = rooms[currentRoom]?.[deckIdx];
    if (hasSupabase) {
      try {
        const url = await uploadPhoto(dataUrl);
        if (deck?.id) await addReplyCard(deck.id, author, url);
        refreshRoom(currentRoom);
      } catch {
        toast("답장 업로드 실패");
      }
    } else {
      const d = new Date();
      const date = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
      setRooms((prev) => {
        const next: RoomsData = { ...prev, [currentRoom]: prev[currentRoom].map((dk) => ({ ...dk, cards: [...dk.cards] })) };
        next[currentRoom][deckIdx].cards.push({ who: author, mine: true, date, ov: "", img: dataUrl, reply: true });
        return next;
      });
    }
  };
  // emoji long-press → instant, NON-editable reaction photo with the emoji
  // overlaid + the "와르르" bubble motion. Gallery stays open underneath.
  const startInstant = (emoji: string) => {
    setInstantEmoji(emoji);
    setGalReact(false);
  };
  const onInstantSend = (dataUrl: string) => {
    const emoji = instantEmoji;
    setInstantEmoji(null);
    // 사진(이모지 배지)이 화면 위로 촤르륵 떠오르고, 덱에 저장돼 재진입 시 재생됨.
    spawnBubble(emoji || "", dataUrl);
    recordPhotoReaction(emoji || "", dataUrl);
    toast("반응을 보냈어요");
  };

  // 답장 → open the FULL editor (stickers/draw/text/voice + time & weather),
  // targeting the open deck. Gallery closes while editing and reopens after.
  const startReply = (emoji: string) => {
    setReplyDeckIdx(openDeckIdx);
    setReplyEmoji(emoji);
    setGalReact(false);
    setOpenDeckIdx(null);
    openUpload("reply");
  };
  const doReply = async () => {
    const idx = replyDeckIdx;
    const emoji = replyEmoji;
    const img = (await editorRef.current?.getComposite()) || capturedSrc || undefined;
    closeUpload();
    if (img && idx != null) await sendReply(idx, img);
    if (idx != null) setOpenDeckIdx(idx); // reopen the gallery on the same deck
    if (emoji) spawnBubble(emoji);
    toast("답장을 보냈어요");
  };

  // ---------- take down my photo (delete the open deck) ----------
  const deleteOpenDeck = async () => {
    const idx = openDeckIdx;
    if (idx == null) return;
    const deck = decks?.[idx];
    if (!deck || !deck.cards[0]?.mine) return;
    if (typeof window !== "undefined" && !window.confirm("이 사진을 내릴까요? 되돌릴 수 없어요.")) return;
    setOpenDeckIdx(null);
    if (hasSupabase && deck.id) {
      try {
        await deleteDeck(deck.id);
        refreshRoom(currentRoom);
      } catch {
        toast("삭제 실패 — 잠시 후 다시 시도해주세요");
        return;
      }
    } else {
      setRooms((prev) => ({
        ...prev,
        [currentRoom]: (prev[currentRoom] || []).filter((_, i) => i !== idx),
      }));
    }
    toast("사진을 내렸어요");
  };

  // ---------- 지금 보고 있는 카드 사진 저장하기 ----------
  const saveActivePhoto = async () => {
    const url = openDeck?.cards[activeCardIdx]?.img;
    if (!url) {
      toast("저장할 사진이 없어요");
      return;
    }
    try {
      const res = await fetch(url);
      const blob = await res.blob();
      const obj = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = obj;
      a.download = `wakii-${Date.now()}.jpg`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(obj);
      toast("사진을 저장했어요");
    } catch {
      // 크로스오리진 등으로 blob 저장 실패 시 새 탭으로 열어 길게 눌러 저장하게
      window.open(url, "_blank");
    }
  };

  // ---------- text / AI phrase reactions ----------
  const sendTextReaction = (text: string) => {
    const t = text.trim().slice(0, 10);
    if (!t) return;
    spawnBubble(t, undefined, undefined, true);
    toast("“" + t + "” 남겼어요");
    recordReaction(t);
  };
  // AI phrase tap → shower many copies of the phrase, like the text reaction
  const playPhrase = (text: string) => {
    setPhrasesOpen(false);
    setGalReact(false);
    spawnBubble(text, undefined, undefined, true);
    toast("“" + text + "” 남겼어요");
    recordReaction(text);
  };

  // ---------- upload / camera ----------
  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  };

  // start the live camera whenever the upload overlay is open and no shot
  // has been taken yet. Falls back silently (cameraActive=false) when the
  // device/browser can't grant a live stream — the shutter then opens the
  // native camera / file picker instead.
  useEffect(() => {
    if (!uploadShow || shotTaken) return;
    let cancelled = false;
    (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play().catch(() => {});
        }
        setCameraActive(true);
      } catch {
        setCameraActive(false);
      }
    })();
    return () => {
      cancelled = true;
      stopCamera();
    };
  }, [uploadShow, shotTaken]);

  const afterCapture = () => {
    setShotTaken(true);
    stopCamera();
  };

  const openUpload = (mode: UploadMode) => {
    setUploadMode(mode);
    setShotTaken(false);
    setCapturedSrc(null);
    setShareShow(false);
    // preselect: current room for the in-room camera, else the most recent room
    setShareTargets(mode === "room" ? [currentRoom] : [recentRooms[0] || myGroups[0]?.name].filter(Boolean) as string[]);
    setUploadShow(true);
  };
  const closeUpload = () => {
    stopCamera();
    setUploadShow(false);
    setShareShow(false);
    setShotTaken(false);
    setCapturedSrc(null);
  };
  const shoot = () => {
    const v = videoRef.current;
    if (cameraActive && v && v.videoWidth) {
      // grab the current frame, centre-cropped to the 3:4 viewfinder
      const vw = v.videoWidth,
        vh = v.videoHeight;
      const ratio = 3 / 4;
      let sw = vw,
        sh = vw / ratio;
      if (sh > vh) {
        sh = vh;
        sw = vh * ratio;
      }
      const sx = (vw - sw) / 2,
        sy = (vh - sh) / 2;
      const canvas = canvasRef.current;
      if (canvas) {
        canvas.width = sw;
        canvas.height = sh;
        canvas.getContext("2d")?.drawImage(v, sx, sy, sw, sh, 0, 0, sw, sh);
        setCapturedSrc(canvas.toDataURL("image/jpeg", 0.9));
      }
      afterCapture();
    } else {
      // no live camera → let the OS take the photo
      fileInputRef.current?.click();
    }
  };
  const onPickFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      setCapturedSrc(reader.result as string);
      afterCapture();
    };
    reader.readAsDataURL(f);
  };
  const toggleShare = (room: string) =>
    setShareTargets((s) => (s.includes(room) ? s.filter((r) => r !== room) : [...s, room]));

  // my groups ordered by most-recently shared (for the share sheet)
  const orderedRooms = [
    ...recentRooms,
    ...myGroups.map((g) => g.name).filter((n) => !recentRooms.includes(n)),
  ]
    .map((nm) => myGroups.find((g) => g.name === nm))
    .filter((g): g is Group => Boolean(g))
    .map((g) => ({ nm: g.name, e: "🏠" }));

  const bumpRecent = (targets: string[]) => {
    setRecentRooms((prev) => {
      const next = [...targets, ...prev.filter((r) => !targets.includes(r))];
      try {
        localStorage.setItem("wakii.recentRooms", JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  };

  // add a freshly shared photo as a new (newest-first) deck in a room
  const addPhotoDeck = (roomName: string, img: string, isMission: boolean) => {
    const d = new Date();
    const date = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
    setRooms((prev) => {
      const list = prev[roomName] ? [...prev[roomName]] : [];
      list.unshift({
        label: isMission ? MISSION_NAME : author,
        when: "오늘",
        isMission,
        cards: [{ who: author, mine: true, date, ov: "", img }],
      });
      return { ...prev, [roomName]: list };
    });
  };

  const doShare = async () => {
    const img = (await editorRef.current?.getComposite()) || capturedSrc || undefined;
    const targets = shareTargets.length ? shareTargets : [currentRoom];
    const isMission = uploadMode === "mission";
    if (img) {
      if (hasSupabase) {
        try {
          const url = await uploadPhoto(img);
          await Promise.all(
            targets.map((r) => createPhotoDeck(r, author, url, { isMission, label: isMission ? MISSION_NAME : author })),
          );
          refreshRoom(currentRoom);
        } catch {
          toast("업로드 실패 — 잠시 후 다시 시도해주세요");
        }
      } else {
        targets.forEach((r) => addPhotoDeck(r, img, isMission));
      }
    }
    bumpRecent(targets);
    closeUpload();
    go("home");
    toast(isMission ? "미션 완수! 덱에 올라갔어요" : "공유했어요 · 덱에 올라갔어요");
  };

  // ---------- walk ----------
  // ---------- course system ----------
  // load saved course progress. Bumping COURSE_SEED resets everyone once to the
  // new demo state (so a previously-stored 100% doesn't hide the cloud).
  const COURSE_SEED = 3;
  useEffect(() => {
    try {
      const raw = localStorage.getItem("wakii.course");
      if (raw) {
        const o = JSON.parse(raw);
        if (o.v === COURSE_SEED) {
          if (typeof o.active === "string") setActiveCourseId(o.active);
          if (typeof o.km === "number") setFamilyKm(o.km);
          if (Array.isArray(o.done)) setCompletedCourses(o.done);
        }
      }
    } catch {
      /* ignore */
    }
    setCourseLoaded(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!courseLoaded) return;
    try {
      localStorage.setItem(
        "wakii.course",
        JSON.stringify({ v: COURSE_SEED, active: activeCourseId, km: familyKm, done: completedCourses }),
      );
    } catch {
      /* ignore */
    }
  }, [courseLoaded, activeCourseId, familyKm, completedCourses]);

  const activeCourse = courseById(activeCourseId) || COURSES[0];
  const courseKm = activeCourse.distance_km;
  const pct = Math.min(100, Math.round((familyKm / courseKm) * 100));
  const isComplete = familyKm >= courseKm;
  const activeGroup = myGroups[walkSel] || myGroups[0]; // 워키 상단 = 실제 그룹(홈과 동일)

  // recap of a course. The photo-curation rule (좋아요 수/이모지 종류 등) is TBD,
  // so the photo section is an empty placeholder for now.
  const openRecap = (courseId: string) => {
    const c = courseById(courseId);
    if (!c) return;
    setRecapCourseId(courseId);
    setRecapTitle(`${c.name_ko} 완주!`);
    setRecapSub(`함께 ${c.distance_km}km · 가족이 함께 걸어 도착했어요`);
    // 그룹의 모든 방 사진을 모아 사람별 best 1 큐레이션 (B안: 여정 기간 미반영)
    setRecapPhotos(curateRecap(Object.values(rooms).flat()));
    setRecapShow(true);
  };

  // pick a course → it becomes "in progress" from 0. If the current course is
  // finished, stamp it (and show its recap) before moving on.
  const selectCourse = (id: string) => {
    const finishing = isComplete;
    const finishedId = activeCourseId;
    if (finishing) setCompletedCourses((prev) => [...prev, finishedId]);
    setActiveCourseId(id);
    setFamilyKm(0);
    setCourseSheet(false);
    if (finishing) openRecap(finishedId);
  };

  // Journey path (bottom → top = 과거 → 미래). Cloud opacity is the single axis
  // for a node's state: done(0) → active(0.8→0.2, 진행률 연동) → unselected(1.0).
  //   - done:       완주해 구름이 완전히 걷힌 랜드마크 (누적, 탭→리캡)
  //   - active:     진행 중 코스. 구름이 진행률만큼 걷힘 + 가족 마커
  //   - unselected: 다음 목적지 빈 자리 (빈 섬 + ? + 구름). 1개. 탭→코스 선택
  type MapNode = { kind: "start" | "done" | "active" | "unselected"; id?: string };
  // many unselected nodes above the active course → no visible "끝", the
  // undiscovered path keeps going up as you scroll
  const mapNodes: MapNode[] = [
    { kind: "start" },
    ...completedCourses.map((id) => ({ kind: "done" as const, id })),
    { kind: "active", id: activeCourseId },
    ...Array.from({ length: 12 }, () => ({ kind: "unselected" as const })),
  ];

  // deterministic pseudo-random (stable across renders) for organic spacing
  const rnd = (n: number) => {
    const s = Math.sin(n * 127.1 + 0.5) * 43758.5453;
    return s - Math.floor(s);
  };
  // narrow horizontal band → limited left/right panning; tall gaps so the path
  // between courses is long and winding (game-level-map feel)
  const W = 432,
    PAD_TOP = 110,
    PAD_BOT = 70,
    SEG_H = 300; // 더 넓은 세로 간격 → 위로 스크롤하며 탐험
  const gaps = mapNodes.map((_, i) => (i === 0 ? 0 : SEG_H + (rnd(i * 1.7) - 0.3) * 96));
  let acc = 0;
  const cum = gaps.map((g2) => (acc += g2));
  const H = PAD_BOT + PAD_TOP + cum[cum.length - 1];
  const pts: [number, number][] = mapNodes.map((_, i) => {
    const y = H - PAD_BOT - cum[i];
    // 넓은 지그재그 → 좌우로 크게 굽이치는 탐험 경로
    const x = Math.max(92, Math.min(W - 92, W / 2 + Math.sin(i * 1.12) * 122 + (rnd(i * 3.3 + 2) - 0.5) * 44));
    return [x, y];
  });
  let dpath = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    // bow the control points outward so the line really snakes between nodes
    const dir = cx >= px ? 1 : -1;
    const bow = 82 + rnd(i * 5.1) * 54;
    dpath += ` C${px + dir * bow},${py - (py - cy) * 0.32} ${cx - dir * bow},${cy + (py - cy) * 0.32} ${cx},${cy}`;
  }
  const curIdx = 1 + completedCourses.length;
  const mt = Math.max(0, Math.min(1, pct / 100));
  const markerX = pts[curIdx - 1][0] + (pts[curIdx][0] - pts[curIdx - 1][0]) * mt;
  const markerY = pts[curIdx - 1][1] + (pts[curIdx][1] - pts[curIdx - 1][1]) * mt;

  // ---------- journey map: pan & zoom (drag, wheel, pinch) ----------
  const clampZoom = (z: number) => Math.max(0.3, Math.min(2.6, z));
  // keep the map from being dragged off into empty space (small overscroll only)
  const clampPan = (p: { x: number; y: number }, z: number) => {
    const el = mapViewRef.current;
    const vw = el?.clientWidth || 360;
    const vh = el?.clientHeight || 560;
    const cw = W * z;
    const ch = H * z;
    const m = 20; // allowed overscroll margin
    const ax = cw <= vw
      ? Math.max((vw - cw) / 2 - m, Math.min((vw - cw) / 2 + m, p.x))
      : Math.max(vw - cw - m, Math.min(m, p.x));
    const ay = ch <= vh
      ? Math.max((vh - ch) / 2 - m, Math.min((vh - ch) / 2 + m, p.y))
      : Math.max(vh - ch - m, Math.min(m, p.y));
    return { x: ax, y: ay };
  };
  // zoom keeping the point (px,py) in the viewport fixed under the cursor
  const zoomAt = (px: number, py: number, factor: number) => {
    const nz = clampZoom(mapZoom * factor);
    const ratio = nz / mapZoom;
    setMapPan((p) => clampPan({ x: px - (px - p.x) * ratio, y: py - (py - p.y) * ratio }, nz));
    setMapZoom(nz);
  };
  const onMapPointerDown = (e: React.PointerEvent) => {
    mapViewRef.current?.setPointerCapture(e.pointerId);
    mapPtrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (mapPtrs.current.size === 1) {
      mapDrag.current = { x: e.clientX, y: e.clientY, px: mapPan.x, py: mapPan.y };
    } else {
      mapDrag.current = null;
      mapPinch.current = null; // re-initialised on the next move
    }
  };
  const onMapPointerMove = (e: React.PointerEvent) => {
    if (!mapPtrs.current.has(e.pointerId)) return;
    mapPtrs.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts2 = Array.from(mapPtrs.current.values());
    const rect = mapViewRef.current?.getBoundingClientRect();
    if (pts2.length >= 2 && rect) {
      const [a, b] = pts2;
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mx = (a.x + b.x) / 2 - rect.left;
      const my = (a.y + b.y) / 2 - rect.top;
      if (!mapPinch.current) {
        mapPinch.current = { dist, zoom: mapZoom, px: mapPan.x, py: mapPan.y, mx, my };
      } else {
        const p0 = mapPinch.current;
        const nz = clampZoom(p0.zoom * (dist / p0.dist));
        const ratio = nz / p0.zoom;
        setMapPan(clampPan({ x: p0.mx - (p0.mx - p0.px) * ratio, y: p0.my - (p0.my - p0.py) * ratio }, nz));
        setMapZoom(nz);
      }
    } else if (mapDrag.current) {
      const d = mapDrag.current;
      setMapPan(clampPan({ x: d.px + (e.clientX - d.x), y: d.py + (e.clientY - d.y) }, mapZoom));
    }
  };
  const onMapPointerUp = (e: React.PointerEvent) => {
    mapPtrs.current.delete(e.pointerId);
    mapPinch.current = null;
    if (mapPtrs.current.size === 1) {
      const [only] = Array.from(mapPtrs.current.values());
      mapDrag.current = { x: only.x, y: only.y, px: mapPan.x, py: mapPan.y };
    } else if (mapPtrs.current.size === 0) {
      mapDrag.current = null;
    }
  };

  // native (non-passive) wheel listener so we can preventDefault to zoom
  useEffect(() => {
    const el = mapViewRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const rect = el.getBoundingClientRect();
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // first time the walk map shows: fit the WIDTH (so the zigzag reads at a
  // comfortable size) and pin 출발 to the bottom edge. The tall winding path
  // then extends upward → user scrolls/pans up to explore the journey.
  useEffect(() => {
    if (mapInited.current || screen !== "walk") return;
    const el = mapViewRef.current;
    if (!el) return;
    const vw = el.clientWidth || 360;
    const vh = el.clientHeight || 560;
    let minX = Infinity,
      maxX = -Infinity;
    for (let i = 0; i <= curIdx; i++) {
      const [x] = pts[i];
      minX = Math.min(minX, x - 84);
      maxX = Math.max(maxX, x + 84);
    }
    const startY = pts[0][1];
    const z = clampZoom((vw * 0.94) / (maxX - minX)); // fit width only
    setMapZoom(z);
    setMapPan(clampPan({ x: vw / 2 - ((minX + maxX) / 2) * z, y: vh - 34 - startY * z }, z));
    mapInited.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen]);

  // ---------- calendar detail ----------
  // load my uploaded cards (current month) from the DB for the calendar
  useEffect(() => {
    if (!hasSupabase || !author) return;
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    listMyCards(author)
      .then((cards) => {
        const map: Record<number, string[]> = {};
        cards.forEach((c) => {
          const d = new Date(c.createdAt);
          if (d.getFullYear() === y && d.getMonth() === m) {
            (map[d.getDate()] = map[d.getDate()] || []).push(c.img || "");
          }
        });
        setMyDays(map);
      })
      .catch(() => {});
  }, [author, rooms]);

  // day → uploaded content (image URLs). DB-backed when online; mock otherwise.
  const dayContent: Record<number, string[]> = hasSupabase
    ? myDays
    : Object.fromEntries(Object.entries(uploadedDays).map(([d, n]) => [Number(d), Array(n).fill("")]));

  const calDetail = (() => {
    if (calSel == null) return null;
    const imgs = dayContent[calSel] || [];
    const steps = stepsByDay[calSel] || 0;
    if (!imgs.length && !steps) return null;
    return { day: calSel, up: imgs.length, imgs, steps };
  })();

  // calendar grid — 현재 달 기준(월 라벨·일수·시작 요일 동적)
  const calNow = new Date();
  const calMonthNum = calNow.getMonth() + 1; // 표시용 1-base
  const calDaysInMonth = new Date(calNow.getFullYear(), calNow.getMonth() + 1, 0).getDate();
  const calLeadEmpty = new Date(calNow.getFullYear(), calNow.getMonth(), 1).getDay(); // 0=일

  // ---------- step report (this week / this month) ----------
  const weekCols = [
    { d: 22, lbl: "월" },
    { d: 23, lbl: "화" },
    { d: 24, lbl: "수" },
    { d: 25, lbl: "목" },
    { d: 26, lbl: "금" },
    { d: 27, lbl: "토" },
    { d: 28, lbl: "일" },
  ];
  const reportCols =
    stepRange === "week"
      ? weekCols.map((c) => ({ ...c, v: stepsByDay[c.d] || 0 }))
      : Array.from({ length: 30 }, (_, i) => ({ d: i + 1, lbl: String(i + 1), v: stepsByDay[i + 1] || 0 }));
  const reportTotal = reportCols.reduce((s, c) => s + c.v, 0);
  const reportActive = reportCols.filter((c) => c.v > 0).length || 1;
  const reportAvg = Math.round(reportTotal / reportActive);
  const reportMax = Math.max(1, ...reportCols.map((c) => c.v));

  return (
    <>
      <div className="head">
        <div className="eye">wakii · 전체 프로토타입</div>
        <h1>홈 · 방 · 업로드 · 걸음 · 마이</h1>
        <p>하단 글래스 네비로 이동 · 방 들어가 카드덱 펼치기 · 걸음 맵 · 마이 캘린더</p>
      </div>

      <div className="device">
        <div className="notch" />
        <div className="status">
          <span>9:41</span>
          <span>▮▮▮ ▮▮</span>
        </div>

        <div className="viewport" ref={viewportRef}>
          {/* ===== HOME ===== */}
          <div className={"screen home-screen" + (screen === "home" ? " active" : "")} id="s-home" ref={homeScrollRef}>
            <div className="home-hero">
              <div className="home-top">
                <img className="home-logo" src="/assets/home/logo.png" alt="wakii" />
                <div className="home-step">
                  <b>6,200</b>
                </div>
              </div>

              {/* 오늘의 미션 — 글래스 박스(CSS) + 벡터 텍스트(SVG) + 벡터 카메라. 전부 선명. 탭→촬영 */}
              <div className="mission" onClick={() => openUpload("mission")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  className="mission-text"
                  src="/assets/mission/mission-text.svg"
                  alt="오늘의 미션 — 오늘은 하지예요! 1년 중 해가 가장 긴 날의 풍경을 담아보세요"
                />
                <svg className="mission-cam" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                  <path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
                </svg>
              </div>

              <div
                className="mark"
                onPointerDown={() => startPress(() => setHousePicker(true))}
                onPointerUp={() => endPress(() => {})}
                onPointerLeave={cancelPress}
              >
                <img className="househero" src={houseImg(house)} alt="우리 집" draggable={false} />
              </div>
            </div>

            {/* 방 선택 바텀시트 — 기본은 집 아래로 살짝 보이고, 위로 스크롤하면 올라옴.
                시간/안읽음 배지는 아직 백엔드 필드가 없어 디자인 목업값으로 표시한다. */}
            <div className="homesheet">
              <div
                className="sheet-handle"
                onPointerDown={onGripDown}
                onPointerMove={onGripMove}
                onPointerUp={onGripUp}
                onPointerCancel={onGripUp}
              >
                <div className="sheet-grip" />
              </div>
              {myGroups.map((grp) => {
                const sum = roomSummaries[grp.name];
                const unread = sum?.unread ?? 0;
                // 최근 활동 시각: Supabase면 실데이터, 목업이면 첫 덱의 상대시각
                const timeLabel = sum?.lastIso
                  ? relTime(sum.lastIso)
                  : !hasSupabase
                    ? rooms[grp.name]?.[0]?.when ?? ""
                    : "";
                return (
                  <div key={grp.code} className="room" onClick={() => openRoom(grp.name, "🏠")}>
                    <div className={"ravatar" + (unread > 0 ? " on" : "")}>
                      {grp.avatar ? <img src={grp.avatar} alt="" /> : null}
                    </div>
                    <div className="rmeta">
                      <div className="rname">{grp.name}</div>
                      {timeLabel && <div className="rtime">{timeLabel}</div>}
                    </div>
                    {unread > 0 && <span className="rbadge">{unread}</span>}
                  </div>
                );
              })}
              <div className="room room-add" onClick={openAddGroup}>
                <div className="ravatar">＋</div>
                <div className="rmeta">
                  <div className="rname">그룹 추가</div>
                  <div className="rprev">만들기 · 참여 코드</div>
                </div>
              </div>
            </div>
          </div>

          {/* ===== ROOM ===== */}
          <div
            className={"screen" + (screen === "room" ? " active" : "")}
            id="s-room"
            ref={roomScreenRef}
          >
            <div className="rhead">
              <span className="bk" onClick={() => go("home")}>
                ‹
              </span>
              <span className="ttl">
                {currentRoom}
              </span>
              <span className="cam" onClick={() => openUpload("room")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="cam-ic" src="/assets/mission/mission-icon.svg" alt="촬영" />
              </span>
            </div>
            <div className="vtoggle">
              <span
                className={roomViewMode === "deck" ? "on" : ""}
                onClick={() => setRoomViewMode("deck")}
              >
                사진
              </span>
              <span
                className={roomViewMode === "review" ? "on" : ""}
                onClick={() => setRoomViewMode("review")}
              >
                Recap
              </span>
            </div>

            {roomViewMode === "deck" && (
              <div className="board">
                {(decks || [])
                  .map((deck, di) => ({ deck, di }))
                  .reverse()
                  .map(({ deck, di }) => {
                  const n = deck.cards.length;
                  // 미션 덱은 작성자가 여럿 — 작성자 키(이메일) 중복 제거 후 아바타+이름 표시
                  const authorKeys = Array.from(new Set(deck.cards.map((c) => c.who)));
                  // 이 덱에 반응한 사람들(중복 제거) — 실제 DB의 reactions.author 기반
                  const reactors = Array.from(new Set(deck.cards.flatMap((c) => c.reactors || [])));
                  return (
                    <div key={di} className="deckwrap">
                      <div className="decklabel">
                        {deck.isMission ? (
                          <span className="dl-author">
                            <span className="dl-avas">
                              {authorKeys.slice(0, 5).map((a) => (
                                <span key={a} className="dl-ava">
                                  {avatarOf(a) ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={avatarOf(a)} alt="" />
                                  ) : (
                                    nameOf(a).slice(0, 1)
                                  )}
                                </span>
                              ))}
                            </span>
                            <b className="mission-names">{authorKeys.map(nameOf).join(" · ")}</b>
                          </span>
                        ) : (
                          <span className="dl-author">
                            <span className="dl-ava">
                              {avatarOf(deck.label) ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={avatarOf(deck.label)} alt="" />
                              ) : (
                                nameOf(deck.label).slice(0, 1)
                              )}
                            </span>
                            <span className="dl-txt">
                              <b>{nameOf(deck.label)}</b>가 시작 · {deck.when}
                            </span>
                          </span>
                        )}
                        {reactors.length > 0 && (
                          <span className="dl-reactors" title={reactors.map(nameOf).join(", ")}>
                            {reactors.slice(0, 5).map((r) => (
                              <span key={r} className="dl-rava">
                                {avatarOf(r) ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={avatarOf(r)} alt="" />
                                ) : (
                                  nameOf(r).slice(0, 1)
                                )}
                              </span>
                            ))}
                            {reactors.length > 5 && <span className="dl-rmore">+{reactors.length - 5}</span>}
                          </span>
                        )}
                        <span className="cnt">{n}장</span>
                      </div>

                      {/* closed stack — tap to open the circular gallery */}
                      <div className="deck" onClick={() => setOpenDeckIdx(di)}>
                        {deck.cards.map((c, i) => {
                          // 최초 사진(i=0)이 맨 앞·맨 위, 이후 반응들이 뒤로 차곡차곡 쌓인다
                          const depth = i;
                          const style: React.CSSProperties = {
                            transform: `translateX(calc(-50% + ${depth * -4}px)) translateY(${depth * 5}px) scale(${1 - depth * 0.03})`,
                            zIndex: 10 + (n - 1 - i),
                            opacity: depth > 3 ? 0 : 1,
                          };
                          if (c.img) {
                            style.backgroundImage = `url(${c.img})`;
                            style.backgroundSize = "cover";
                            style.backgroundPosition = "center";
                          }
                          return (
                            <div
                              key={i}
                              className={"card" + (c.mine ? " mine" : "") + (deck.isMission ? " mission" : "")}
                              style={style}
                            >
                              {(deck.isMission ? nameOf(c.who) : roleLabel(i)) && (
                                <div className="meta">{deck.isMission ? nameOf(c.who) : roleLabel(i)}</div>
                              )}
                              {!c.img && c.ov && <div className="ov">{c.ov}</div>}
                              <div className="seq">{i + 1}</div>
                              {c.reply &&
                                (deck.cards[i - 1]?.img ? (
                                  <div
                                    className="reporig"
                                    style={{
                                      backgroundImage: `url(${deck.cards[i - 1].img})`,
                                      backgroundSize: "cover",
                                      backgroundPosition: "center",
                                    }}
                                  />
                                ) : (
                                  <div className="reporig" />
                                ))}
                            </div>
                          );
                        })}
                      </div>

                      {deck.isMission && <div className="missionchip">{deck.label}</div>}
                    </div>
                  );
                })}
              </div>
            )}

            {roomViewMode === "review" && (
              <div className="review">
                {(() => {
                  const all: Card[] = [];
                  (decks || []).forEach((d) => d.cards.forEach((c) => all.push(c)));
                  const groups: Record<string, Card[]> = {};
                  all.forEach((c) => {
                    (groups[c.date] = groups[c.date] || []).push(c);
                  });
                  const dates = Object.keys(groups).sort((a, b) => b.localeCompare(a));
                  return dates.map((date) => (
                    <div key={date} className="daygroup">
                      <div className="daydate">{date}</div>
                      <div className="daygrid">
                        {groups[date].map((c, i) => (
                          <div
                            key={i}
                            className={"gcell " + (c.mine ? "mine" : "")}
                            style={
                              c.img
                                ? { backgroundImage: `url(${c.img})`, backgroundSize: "cover", backgroundPosition: "center" }
                                : undefined
                            }
                          >
                            {!c.img && c.ov && <div className="gov">{c.ov}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}

            {/* 참여코드(=비번) — MVP: 잘 안 보이는 방 맨 아래에 두고, 탭하면 복사 */}
            {currentGroup && (
              <div
                className="roomcode"
                onClick={() => {
                  navigator.clipboard?.writeText(currentGroup.code).then(
                    () => toast("참여코드를 복사했어요"),
                    () => {},
                  );
                }}
              >
                참여코드 {currentGroup.code}
              </div>
            )}
          </div>

          {/* ===== WALK ===== */}
          <div className={"screen" + (screen === "walk" ? " active" : "")} id="s-walk">
            {/* 상단: 방 아바타 행(활성=민트 발광) + STAMP 민트 알약 (Figma '세번째 화면') */}
            <div className="walktop">
              <div className="walkstories">
                {myGroups.map((grp, i) => (
                  <div
                    key={grp.code}
                    className={"wstory" + (i === walkSel ? " on" : "")}
                    onClick={() => setWalkSel(i)}
                  >
                    <div className="ring">
                      <div className="inner">
                        {grp.avatar ? <img src={grp.avatar} alt="" /> : grp.name.slice(0, 1)}
                      </div>
                    </div>
                    <div className="nm">{grp.name}</div>
                  </div>
                ))}
              </div>
              <button className="stamp-pill" onClick={() => setStampOpen(true)} aria-label="스탬프">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/assets/walk/stamp-button.svg" alt="STAMP" />
              </button>
            </div>

            {/* 진행 중(구름 덮인 목표가 있으면) 방 행 아래 % 완주 표시 — 기존 UI 유지 */}
            {!isComplete && (
              <div className="walkprogress">
                <b>{activeCourse.name_ko}</b>까지 <b className="wp-pct">{pct}%</b>
                <span className="wp-km">
                  {familyKm.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}/{courseKm}km
                </span>
              </div>
            )}

            {/* 워키 여정 — 레이어드 섬(near=완주/선명, 중간=진행중+구름, far=미래 empty+구름).
                완주 랜드마크 탭→recap / 미래 섬은 현재 코스 완주 시에만 코스 선택 가능 */}
            <div className="journey">
              {/* 미래(맨 위/멀리): 빈 섬 + 구름. 현재 코스 완주했을 때만 새 목표 선택 */}
              <div
                className={"j-isle j-future" + (isComplete ? " on" : "")}
                onClick={() => isComplete && setCourseSheet(true)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="j-island" src="/assets/walk/empty_island.png" alt="" draggable={false} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="j-cloud" src="/assets/walk/cloud.png" alt="" draggable={false} />
                {isComplete && <div className="j-hint">＋ 새 목표 고르기</div>}
              </div>

              {/* 진행 중 목표(가운데): 코스 섬 + 구름. 완주하면 선명해지고 recap 가능 */}
              <div
                className={"j-isle j-active" + (isComplete ? " done" : "")}
                onClick={() => isComplete && openRecap(activeCourseId)}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="j-island" src={courseImg(activeCourseId) || "/assets/walk/empty_island.png"} alt={activeCourse.name_ko} draggable={false} />
                {!isComplete && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="j-cloud" src="/assets/walk/cloud.png" alt="" draggable={false} />
                )}
                <div className="j-nm">{activeCourse.name_ko}{isComplete ? " 완주!" : ` ${pct}%`}</div>
              </div>

              {/* 완주한 코스(아래/가까이): 선명 랜드마크. 탭 → recap(사용자별 best 1) */}
              {[...completedCourses].reverse().map((id) => (
                <div key={id} className="j-isle j-done" onClick={() => openRecap(id)}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="j-island" src={courseImg(id) || "/assets/walk/empty_island.png"} alt={courseById(id)?.name_ko} draggable={false} />
                  <div className="j-nm">{courseById(id)?.name_ko}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ===== MY ===== */}
          <div className={"screen" + (screen === "my" ? " active" : "")} id="s-my">
            <div className="myhero">
              <div className="myava-wrap" onClick={() => avatarFileRef.current?.click()}>
                <div className="myava">{avatar ? <img src={avatar} alt="프로필" /> : "🙂"}</div>
                <span className="myava-edit">＋</span>
              </div>
              <input
                ref={avatarFileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={pickAvatar}
              />
              <div className="myname">{name || "나"}</div>
              <div className="mysub">{myGroups.length}와 함께 와키 중</div>
            </div>
            <div className="cal">
              <h4>{calMonthNum}월</h4>
              <div className="calgrid">
                {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                  <div key={d} className="caldow">
                    {d}
                  </div>
                ))}
                {Array.from({ length: calLeadEmpty }).map((_, i) => (
                  <div key={"e" + i} className="calday empty" />
                ))}
                {Array.from({ length: calDaysInMonth }).map((_, idx) => {
                  const d = idx + 1;
                  return (
                    <div
                      key={d}
                      className={
                        "calday" + (dayContent[d]?.length ? " has" : "") + (calSel === d ? " sel" : "")
                      }
                      onClick={() => setCalSel(d)}
                    >
                      {d}
                    </div>
                  );
                })}
              </div>
            </div>
            {calDetail && (
              <div className="caldetail show">
                <div className="cd-date">{calMonthNum}월 {calDetail.day}일</div>
                <div className="cd-row">
                  👣 그날 내 걸음{" "}
                  <b style={{ marginLeft: "auto", color: "#fff" }}>
                    {calDetail.steps.toLocaleString()}
                  </b>
                </div>
                <div className="cd-row">📷 올린 콘텐츠 {calDetail.up}개</div>
                <div className="cd-thumbs">
                  {calDetail.up > 0 ? (
                    calDetail.imgs.map((src, i) =>
                      src ? (
                        <div
                          key={i}
                          style={{ backgroundImage: `url(${src})`, backgroundSize: "cover", backgroundPosition: "center" }}
                        />
                      ) : (
                        <div key={i} />
                      ),
                    )
                  ) : (
                    <span style={{ fontSize: 10, color: "var(--g40)" }}>없음</span>
                  )}
                </div>
              </div>
            )}
            {/* step report */}
            <div className="report">
              <div className="report-head">
                <h4>워키 레포트</h4>
                <div className="report-toggle">
                  <span className={stepRange === "week" ? "on" : ""} onClick={() => setStepRange("week")}>
                    이번 주
                  </span>
                  <span className={stepRange === "month" ? "on" : ""} onClick={() => setStepRange("month")}>
                    이번 달
                  </span>
                </div>
              </div>
              <div className="report-stats">
                <div className="rs-item">
                  <div className="rs-num">{reportTotal.toLocaleString()}</div>
                  <div className="rs-lbl">총 걸음</div>
                </div>
                <div className="rs-item">
                  <div className="rs-num">{reportAvg.toLocaleString()}</div>
                  <div className="rs-lbl">하루 평균</div>
                </div>
              </div>
              <div className={"report-chart" + (stepRange === "month" ? " dense" : "")}>
                {reportCols.map((c) => (
                  <div key={c.d} className="rc-col">
                    <div className="rc-bar" style={{ height: Math.round((c.v / reportMax) * 100) + "%" }} />
                    <div className="rc-lbl">{c.lbl}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="mylist">
              <div className="myitem" onClick={() => toast("알림 설정")}>
                <span className="mi">🔔</span> 알림 <span className="chev">›</span>
              </div>
              <div className="myitem" onClick={() => toast("계정·설정")}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img className="mi" src="/assets/icons/settings.png" alt="" /> 설정 <span className="chev">›</span>
              </div>
            </div>
          </div>

          {/* upload overlay */}
          <div className={"uploadlayer" + (uploadShow ? " show" : "")}>
            <div className="ul-top">
              <span className="bk" onClick={closeUpload} aria-label="뒤로">
                ‹
              </span>
            </div>
            <div className="ul-stage">
              {!shotTaken && (
                <>
                  {uploadMode === "mission" && (
                    <div className="ul-mcard">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        className="mission-text"
                        src="/assets/mission/mission-text.svg"
                        alt="오늘의 미션 — 오늘은 하지예요! 1년 중 해가 가장 긴 날의 풍경을 담아보세요"
                      />
                    </div>
                  )}
                  <div className="vf">
                    <video
                      ref={videoRef}
                      playsInline
                      muted
                      autoPlay
                      style={{
                        position: "absolute",
                        inset: 0,
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        display: cameraActive ? "block" : "none",
                      }}
                    />
                    {uploadMode === "new" && (
                      <div className="ul-gallery" onClick={() => galleryInputRef.current?.click()} aria-label="갤러리">
                        <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                          <path d="M22 16V4a2 2 0 0 0-2-2H8a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2zM11 12l2.03 2.71L16 11l4 5H8l3-4zM2 6v14a2 2 0 0 0 2 2h14v-2H4V6H2z" />
                        </svg>
                      </div>
                    )}
                  </div>
                  <button className="ul-shutter" onClick={shoot} aria-label="촬영">
                    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                      <path d="M9 3 7.2 5H4a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-3.2L15 3H9zm3 4a5 5 0 1 1 0 10 5 5 0 0 1 0-10zm0 2a3 3 0 1 0 0 6 3 3 0 0 0 0-6z" />
                    </svg>
                  </button>
                </>
              )}
              {/* after capture: full Instagram-style editor (all modes) */}
              {shotTaken && capturedSrc && (
                <PhotoEditor
                  ref={editorRef}
                  src={capturedSrc}
                  toast={toast}
                  weather={weather}
                  initialEmoji={uploadMode === "reply" ? replyEmoji : undefined}
                />
              )}
            </div>
            {/* hidden capture targets — used when a live stream isn't available
                (shutter) or to pick an existing photo (gallery) */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              style={{ display: "none" }}
              onChange={onPickFile}
            />
            <input
              ref={galleryInputRef}
              type="file"
              accept="image/*"
              style={{ display: "none" }}
              onChange={onPickFile}
            />
            <canvas ref={canvasRef} style={{ display: "none" }} />
            {shotTaken && (
              <div className="ul-next" onClick={() => (uploadMode === "reply" ? doReply() : setShareShow(true))}>
                →
              </div>
            )}
            {/* share — bottom sheet, rooms ordered by most-recently shared */}
            <div className={"sharesheet" + (shareShow ? " show" : "")} onClick={() => setShareShow(false)}>
              <div className="ss-panel" onClick={(e) => e.stopPropagation()}>
                <div className="grip" />
                <h4>어디에 공유할까요?</h4>
                {orderedRooms.map((r) => {
                  const on = shareTargets.includes(r.nm);
                  return (
                    <div
                      key={r.nm}
                      className={"ss-room" + (on ? " sel" : "")}
                      onClick={() => toggleShare(r.nm)}
                    >
                      {r.e} {r.nm}{" "}
                      <span className="ck" style={on ? undefined : { color: "var(--g25)" }}>
                        {on ? "✓" : "○"}
                      </span>
                    </div>
                  );
                })}
                <button className="ss-go" onClick={doShare}>
                  공유 ({shareTargets.length})
                </button>
              </div>
            </div>
          </div>

          {/* recap modal */}
          <div className={"recap" + (recapShow ? " show" : "")}>
            <span className="rc-x" onClick={() => setRecapShow(false)}>
              ✕
            </span>
            {courseImg(recapCourseId) ? (
              <img className="rc-hero" src={courseImg(recapCourseId) as string} alt="" />
            ) : (
              <div className="rc-flag">🏁</div>
            )}
            <div className="rc-title">{recapTitle}</div>
            <div className="rc-sub">{recapSub}</div>
            {recapPhotos.length > 0 ? (
              <>
                <div className="rc-caption">가족이 가장 많이 반응한 사진</div>
                <div className="rc-grid">
                  {recapPhotos.map((p, i) => (
                    <div key={i} className="rc-card">
                      <img className="rc-photo" src={p.img} alt="" />
                      {p.count > 0 && (
                        <div className="rc-react">
                          {p.emojis[0] || "❤️"} {p.count}
                        </div>
                      )}
                      <div className="rc-who">
                        <span className="rc-avatar">
                          {avatarOf(p.who) ? <img src={avatarOf(p.who)} alt="" /> : nameOf(p.who).slice(0, 1)}
                        </span>
                        {nameOf(p.who)}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="rc-empty">이 여정 동안 가족이 올린 사진이<br />아직 없어요</div>
            )}
          </div>

          {/* course select — "새 목표 고르기" (모든 코스 재선택 가능) */}
          <div className={"sharesheet" + (courseSheet ? " show" : "")} onClick={() => setCourseSheet(false)}>
            <div className="ss-panel" onClick={(e) => e.stopPropagation()}>
              <div className="grip" />
              <h4>워키 여정 고르기</h4>
              <div className="cs-list">
                {COURSES.map((c) => {
                  const done = completedCourses.includes(c.id);
                  const active = c.id === activeCourseId;
                  const img = courseImg(c.id);
                  return (
                    <div
                      key={c.id}
                      className={"cs-row" + (active ? " active" : "")}
                      onClick={() => selectCourse(c.id)}
                    >
                      <div className="cs-thumb">{img ? <img src={img} alt={c.name_ko} /> : <span>🏝️</span>}</div>
                      <div className="cs-meta">
                        <div className="cs-name">
                          {c.name_ko}
                          {done && <span className="cs-stamp">🏁</span>}
                        </div>
                        <div className="cs-sub">
                          {c.distance_km}km · 약 {c.steps.toLocaleString()}보
                        </div>
                      </div>
                      {active ? <span className="cs-tag">진행 중</span> : <span className="cs-go">선택 ›</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* house picker — long-press the home house to change it */}
          <div className={"sharesheet housesheet" + (housePicker ? " show" : "")} onClick={() => setHousePicker(false)}>
            <div className="ss-panel" onClick={(e) => e.stopPropagation()}>
              <div className="grip" />
              <div className="housegrid">
                {HOUSES.map((hh) => (
                  <div
                    key={hh.id}
                    className={"hcell" + (house === hh.id ? " on" : "")}
                    onClick={() => {
                      chooseHouse(hh.id);
                      setHousePicker(false);
                    }}
                  >
                    <img src={houseImg(hh.id)} alt={hh.label} draggable={false} />
                    <span>{hh.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* 스탬프 화면 — 워키여정 상단 STAMP 탭 시. 글래스 패널에 완주 코스 섬 컬렉션 */}
          {stampOpen && (
            <div className="stampscreen" onClick={() => setStampOpen(false)}>
              <div className="stamp-panel" onClick={(e) => e.stopPropagation()}>
                <div className="stamp-head">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img className="stamp-pill" src="/assets/walk/stamp-button.svg" alt="STAMP" />
                  <span className="stamp-x" onClick={() => setStampOpen(false)}>
                    ✕
                  </span>
                </div>
                <div className="stamp-islands">
                  {completedCourses.length === 0 && (
                    <div className="stamp-empty">아직 완주한 코스가 없어요</div>
                  )}
                  {completedCourses.map((id, i) => {
                    const c = courseById(id);
                    const img = courseImg(id);
                    return (
                      <div
                        key={i}
                        className="stamp-island"
                        style={STAMP_SCATTER[i % STAMP_SCATTER.length]}
                        onClick={() => {
                          setStampOpen(false);
                          openRecap(id);
                        }}
                      >
                        {img ? <img src={img} alt={c?.name_ko} /> : <span className="si-emoji">🏝️</span>}
                        <div className="stamp-nm">{c?.name_ko}</div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* toast */}
          <div className={"toast" + (toastShown ? " show" : "")}>{toastMsg}</div>
        </div>

        {/* glass nav — 알약형 글래스(홈·카메라·워키) + 분리된 원형 마이 버튼.
            기본은 흰색, 활성 화면 아이콘은 민트로 불이 켜짐. 카메라는 촬영 후 공유하기. */}
        <div className="nav">
          <div className="navpill">
            <div className={"tab" + (screen === "home" ? " on" : "")} onClick={() => go("home")} aria-label="홈">
              <svg className="ni" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M12 2.6 3 11h2.4v9h5.1v-5.4h3V20h5.1v-9H21z" />
              </svg>
            </div>
            <div className="tab cam" onClick={() => openUpload("new")} aria-label="사진 추가">
              <svg className="ni" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                <path d="M10.8 4h2.4v6.8H20v2.4h-6.8V20h-2.4v-6.8H4v-2.4h6.8z" />
              </svg>
            </div>
            <div className={"tab" + (screen === "walk" ? " on" : "")} onClick={() => go("walk")} aria-label="워키">
              <svg className="ni" viewBox="10 10 30 30" fill="currentColor" aria-hidden>
                <path d="M34.8287 17.0979C35.2427 18.2517 34.6374 19.5345 33.4836 19.9485C33.2948 20.0162 33.1089 20.0592 32.9223 20.067L30.5243 25.1305C30.637 25.2795 30.7257 25.4608 30.7935 25.6496C31.2075 26.8034 30.6022 28.0861 29.4484 28.5001C28.2946 28.9141 27.0118 28.3089 26.5978 27.1551C26.5301 26.9663 26.4833 26.7699 26.4755 26.5833L22.8411 24.8683C22.6921 24.981 22.5108 25.0697 22.322 25.1375C22.1332 25.2052 21.9369 25.252 21.7502 25.2597L18.694 31.7552C18.8066 31.9043 18.8916 32.075 18.9593 32.2638C19.3733 33.4176 18.7681 34.7004 17.6143 35.1144C16.4605 35.5284 15.1777 34.9231 14.7637 33.7693C14.3497 32.6155 14.955 31.3328 16.1088 30.9188C16.2976 30.851 16.4834 30.808 16.6701 30.8002L19.7406 24.3115C19.6279 24.1625 19.5392 23.9812 19.4715 23.7924C19.0574 22.6386 19.6627 21.3558 20.8165 20.9418C21.9703 20.5278 23.2531 21.1331 23.6671 22.2869C23.7348 22.4757 23.7816 22.672 23.7894 22.8587L27.4238 24.5736C27.5728 24.461 27.7541 24.3723 27.9429 24.3045C28.1317 24.2368 28.328 24.19 28.5147 24.1822L30.8984 19.112C30.7857 18.963 30.7008 18.7922 30.633 18.6034C30.219 17.4496 30.8243 16.1669 31.9781 15.7528C33.1319 15.3388 34.4147 15.9441 34.8287 17.0979Z" />
              </svg>
            </div>
          </div>
          <div className={"navmy" + (screen === "my" ? " on" : "")} onClick={() => go("my")} aria-label="마이">
            <svg className="ni" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
              <path d="M12 12c2.2 0 4-1.8 4-4s-1.8-4-4-4-4 1.8-4 4 1.8 4 4 4zm0 2c-2.7 0-8 1.3-8 4v2h16v-2c0-2.7-5.3-4-8-4z" />
            </svg>
          </div>
        </div>

        {/* ===== deck circular gallery (opens over everything, dark/blur bg) ===== */}
        {openDeck && (
          <div className="deckgallery" onClick={() => setOpenDeckIdx(null)}>
            <div
              className="dg-stage"
              onClick={(e) => e.stopPropagation()}
              onPointerDown={() => startPress(() => setPeekImg(openDeck?.cards[activeCardIdx]?.img || null))}
              onPointerUp={() => endPress(() => {})}
              onPointerMove={cancelPress}
              onPointerLeave={cancelPress}
            >
              {/* 카드 헤더: 좌상단 작성자(프로필+이름), 우상단 ⋯ 메뉴 */}
              <div className="dg-cardbar" onPointerDown={(e) => e.stopPropagation()}>
                <div className="dg-author">
                  <span className="dg-ava">
                    {avatarOf(openDeck.cards[activeCardIdx]?.who || "") ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={avatarOf(openDeck.cards[activeCardIdx]?.who || "")} alt="" />
                    ) : null}
                  </span>
                  <span className="dg-name">{nameOf(openDeck.cards[activeCardIdx]?.who || openDeck.label)}</span>
                </div>
                <div className="dg-headbtns">
                  <div className="dg-morewrap">
                    <button
                      className="dg-icbtn"
                      aria-label="더보기"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDgMenuOpen((v) => !v);
                      }}
                    >
                      ⋯
                    </button>
                    {dgMenuOpen && (
                      <div className="dg-menu" onClick={(e) => e.stopPropagation()}>
                        {openDeck.cards[0]?.mine && (
                          <button
                            className="dg-mi del"
                            onClick={() => {
                              setDgMenuOpen(false);
                              deleteOpenDeck();
                            }}
                          >
                            사진 내리기
                          </button>
                        )}
                        <button
                          className="dg-mi"
                          onClick={() => {
                            setDgMenuOpen(false);
                            saveActivePhoto();
                          }}
                        >
                          사진 저장하기
                        </button>
                      </div>
                    )}
                  </div>
                  <button className="dg-icbtn" aria-label="나가기" onClick={() => setOpenDeckIdx(null)}>
                    ✕
                  </button>
                </div>
              </div>
              <CircularGallery
                items={galleryItems}
                bend={3}
                textColor="#ffffff"
                borderRadius={0.06}
                font="600 30px sans-serif"
                fontUrl={undefined}
                scrollEase={0.03}
                loop={false}
                onActiveChange={setActiveCardIdx}
              />
              {/* floating reaction bubbles (emoji/text, or the instant photo) */}
              {bubbles.map((b) =>
                b.img ? (
                  <div
                    key={b.id}
                    className="bubble photobubble"
                    style={
                      {
                        left: b.left + "%",
                        marginLeft: -b.size / 2,
                        bottom: 4,
                        width: b.size,
                        animationDuration: b.dur + "s",
                        animationDelay: b.delay + "s",
                        backgroundImage: `url(${b.img})`,
                        ["--dx" as string]: b.dx + "px",
                        ["--dy" as string]: b.dy + "px",
                      } as React.CSSProperties
                    }
                  >
                    {b.emoji && <span className="pb-badge">{b.emoji}</span>}
                  </div>
                ) : (
                  <div
                    key={b.id}
                    className={"bubble" + (b.text ? " txt" : "")}
                    style={
                      {
                        left: b.left + "%",
                        bottom: 4,
                        fontSize: b.size,
                        animationDuration: b.dur + "s",
                        animationDelay: b.delay + "s",
                        ["--dx" as string]: b.dx + "px",
                        ["--dy" as string]: b.dy + "px",
                      } as React.CSSProperties
                    }
                  >
                    {b.emoji}
                  </div>
                ),
              )}
            </div>


            {/* reaction palette: emojis (short=react, long=instant photo) + 텍스트 */}
            {galReact && (
              <div className="rx-bar" onClick={(e) => e.stopPropagation()}>
                {REACTIONS.map((r) => (
                  <button
                    key={r.emoji}
                    className="rx-btn"
                    onPointerDown={() => startPress(() => startInstant(r.emoji))}
                    onPointerUp={() =>
                      endPress(() => {
                        setGalReact(false);
                        pickEmoji(r.emoji);
                      })
                    }
                    onPointerLeave={() => pressTimer.current && clearTimeout(pressTimer.current)}
                  >
                    {r.emoji}
                  </button>
                ))}
                <button
                  className="rx-btn rx-text"
                  onPointerDown={() =>
                    startPress(() => {
                      setGalReact(false);
                      setPhrasesOpen(true);
                    })
                  }
                  onPointerUp={() =>
                    endPress(() => {
                      setGalReact(false);
                      setTextReactOpen(true);
                    })
                  }
                  onPointerLeave={() => pressTimer.current && clearTimeout(pressTimer.current)}
                >
                  💬
                </button>
              </div>
            )}

            {textReactOpen && (
              <div className="rx-textinput" onClick={(e) => e.stopPropagation()}>
                <input
                  autoFocus
                  maxLength={10}
                  value={textReactDraft}
                  placeholder="10자 이내로 입력"
                  onChange={(e) => setTextReactDraft(e.target.value.slice(0, 10))}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      sendTextReaction(textReactDraft);
                      setTextReactDraft("");
                      setTextReactOpen(false);
                    }
                  }}
                />
                <button
                  onClick={() => {
                    sendTextReaction(textReactDraft);
                    setTextReactDraft("");
                    setTextReactOpen(false);
                  }}
                >
                  보내기
                </button>
              </div>
            )}

            {phrasesOpen && (
              <div className="rx-phrases" onClick={(e) => e.stopPropagation()}>
                <div className="rx-phrases-title">✨ AI 추천 멘트</div>
                <div className="rx-phrases-row">
                  {AI_PHRASES.map((p) => (
                    <button key={p} onClick={() => playPhrase(p)}>
                      {p}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="dg-acts" onClick={(e) => e.stopPropagation()}>
              <button
                className="b-react"
                onClick={() => {
                  setTextReactOpen(false);
                  setPhrasesOpen(false);
                  setGalReact((v) => !v);
                }}
              >
                🙂 반응
              </button>
              {!openDeck.isMission && (
                <button className="b-reply" onClick={() => startReply("")}>
                  📷 답장
                </button>
              )}
            </div>
          </div>
        )}

        {/* instant (non-editable) emoji reaction photo */}
        {instantEmoji != null && (
          <InstantCapture emoji={instantEmoji} onSend={onInstantSend} onClose={() => setInstantEmoji(null)} />
        )}

        {/* long-press peek: the original uploaded photo, no reactions */}
        {peekImg && (
          <div className="peek" onClick={() => setPeekImg(null)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={peekImg} alt="원본 사진" />
            <div className="peek-hint">탭하면 닫기</div>
          </div>
        )}

        {/* onboarding: login → name → group (create / join) */}
        {(needSetup || addingGroup) && (
          <div className="onboarding">
            {obStep === "login" && (
              <>
                <div className="ob-logo">wakii</div>
                <div className="ob-tag">
                  간편하게 로그인하고
                  <br />
                  다양한 서비스를 이용해보세요.
                </div>
                <div className="ob-buttons">
                  <button className="ob-btn kakao" onClick={() => pickLogin("카카오")}>
                    <span className="ob-ic">💬</span> 카카오 로그인
                  </button>
                  <button className="ob-btn naver" onClick={() => pickLogin("네이버")}>
                    <span className="ob-ic">N</span> 네이버 로그인
                  </button>
                  <button className="ob-btn google" onClick={() => pickLogin("구글")}>
                    <span className="ob-ic">G</span> 구글 로그인
                  </button>
                  <button className="ob-btn apple" onClick={() => pickLogin("Apple")}>
                    <span className="ob-ic"></span> Apple로 로그인
                  </button>
                  <div className="ob-email" onClick={() => setObStep("name")}>
                    다른 이메일로 시작하기
                  </div>
                </div>
              </>
            )}

            {obStep === "name" && (
              <>
                <div className="ob-logo">wakii</div>
                <div className="ob-tag">이메일과 이름으로 프로필을 만들어요</div>
                <div className="ob-name">
                  <input
                    autoFocus
                    type="email"
                    value={emailDraft}
                    placeholder="이메일"
                    autoCapitalize="off"
                    onChange={(e) => setEmailDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveName()}
                  />
                  <input
                    value={nameDraft}
                    placeholder="이름 (가족에게 보일 이름)"
                    onChange={(e) => setNameDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && saveName()}
                  />
                  <button className="nm-go" onClick={saveName}>
                    다음
                  </button>
                  <div className="ob-back" onClick={() => setObStep("login")}>
                    ‹ 로그인 방법 다시 선택
                  </div>
                </div>
              </>
            )}

            {obStep === "house" && (
              <>
                <div className="ob-logo">우리 집 고르기</div>
                <div className="ob-tag">홈 화면에 띄울 집을 골라주세요</div>
                <div className="housegrid">
                  {HOUSES.map((hh) => (
                    <div
                      key={hh.id}
                      className={"hcell" + (house === hh.id ? " on" : "")}
                      onClick={() => chooseHouse(hh.id)}
                    >
                      <img src={houseImg(hh.id)} alt={hh.label} draggable={false} />
                      <span>{hh.label}</span>
                    </div>
                  ))}
                </div>
                <button className="nm-go" style={{ marginTop: 14 }} onClick={afterIdentity}>
                  다음
                </button>
                <div className="ob-back" onClick={() => setObStep("name")}>
                  ‹ 뒤로
                </div>
              </>
            )}

            {obStep === "group" && (
              <>
                <div className="ob-logo">wakii</div>
                <div className="ob-tag">그룹을 만들거나 참여하세요</div>
                <div className="ob-buttons">
                  <button className="ob-btn dark" onClick={() => setObStep("create")}>
                    그룹 만들기
                  </button>
                  <button className="ob-btn outline" onClick={() => setObStep("join")}>
                    참여 코드로 참여하기
                  </button>
                  {addingGroup && (
                    <div className="ob-email" onClick={() => setAddingGroup(false)}>
                      닫기
                    </div>
                  )}
                </div>
              </>
            )}

            {obStep === "create" && (
              <>
                <div className="ob-logo">그룹 만들기</div>
                <div className="ob-tag">참여 코드를 직접 정해 가족에게 공유하세요</div>
                <div className="ob-name">
                  <div
                    className="ob-roomphoto"
                    onClick={() => groupPhotoRef.current?.click()}
                    title="방 대표 사진"
                  >
                    {groupPhotoDraft ? <img src={groupPhotoDraft} alt="방 대표 사진" /> : <span>＋ 방 사진</span>}
                  </div>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <input
                    ref={groupPhotoRef}
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    onChange={pickGroupPhoto}
                  />
                  <input
                    value={groupNameDraft}
                    placeholder="그룹 이름 (예: 우리 가족)"
                    onChange={(e) => setGroupNameDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && doCreateGroup()}
                  />
                  <input
                    value={groupCodeDraft}
                    placeholder="참여 코드 (예: umma2026)"
                    style={{ textTransform: "uppercase", letterSpacing: ".08em" }}
                    onChange={(e) => setGroupCodeDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && doCreateGroup()}
                  />
                  <button className="nm-go" onClick={doCreateGroup}>
                    그룹 만들기
                  </button>
                  <div className="ob-back" onClick={() => setObStep("group")}>
                    ‹ 뒤로
                  </div>
                </div>
              </>
            )}

            {obStep === "code" && pendingGroup && (
              <>
                <div className="ob-tag" style={{ marginBottom: 6 }}>
                  가족을 초대해보세요
                </div>
                <div className="ob-codesub" style={{ marginBottom: 18 }}>{pendingGroup.name}</div>
                <button className="ob-share" onClick={() => shareInvite(pendingGroup)}>
                  💌 카카오톡으로 초대하기
                </button>
                <div className="ob-codenote">링크를 받은 가족이 누르면 바로 같은 방에 들어와요.</div>
                <div className="ob-codefallback">
                  또는 참여 코드 <b>{pendingGroup.code}</b>{" "}
                  <span onClick={copyCode}>복사</span>
                </div>
                <button className="nm-go" style={{ marginTop: 14 }} onClick={() => addGroup(pendingGroup)}>
                  홈으로 가기
                </button>
              </>
            )}

            {obStep === "join" && (
              <>
                <div className="ob-logo">참여하기</div>
                <div className="ob-tag">친구·가족에게 받은 코드를 입력하세요</div>
                <div className="ob-name">
                  <input
                    autoFocus
                    value={joinCodeDraft}
                    placeholder="참여 코드 (예: A3K7F2)"
                    style={{ textTransform: "uppercase", letterSpacing: ".12em" }}
                    onChange={(e) => setJoinCodeDraft(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && doJoinGroup()}
                  />
                  <button className="nm-go" onClick={doJoinGroup}>
                    참여하기
                  </button>
                  <div className="ob-back" onClick={() => setObStep("group")}>
                    ‹ 뒤로
                  </div>
                </div>
              </>
            )}

            {obStep === "joined" && pendingGroup && (
              <>
                <div className="ob-check">✓</div>
                <div className="ob-tag" style={{ fontSize: 18 }}>
                  {pendingGroup.name}에<br />참여했어요!
                </div>
                <div className="ob-codenote">가족이 사진을 올리면 알림을 보내드릴게요.</div>
                <button className="nm-go" style={{ marginTop: 16 }} onClick={() => addGroup(pendingGroup)}>
                  시작하기
                </button>
              </>
            )}
          </div>
        )}
      </div>

      <div className="hintline">
        포인트: 홈 미션 배너 → 촬영 / 방 들어가 덱 탭하면 펼침 · 답장으로 카드 쌓기 / 걸음 탭에서 맵 위 깃발 눌러 리캡 / 마이 캘린더 날짜 탭
      </div>
    </>
  );
}
