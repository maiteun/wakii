"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import PhotoEditor, { type PhotoEditorHandle } from "./PhotoEditor";
import type { Card, Deck, RoomsData } from "@/lib/types";
import { hasSupabase } from "@/lib/supabase";
import { listRoom, subscribeRoom, uploadPhoto, createPhotoDeck, addReplyCard, addReaction } from "@/lib/db";

// WebGL gallery is client-only (uses window / WebGL at runtime)
const CircularGallery = dynamic(() => import("./CircularGallery"), { ssr: false });

// role shown on each card by its position in the deck
const roleLabel = (i: number) => (i === 0 ? "작성자" : `${i}차 반응자`);

function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function loadImg(src: string, crossOrigin = false): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const im = new Image();
    if (crossOrigin) im.crossOrigin = "anonymous";
    im.onload = () => res(im);
    im.onerror = rej;
    im.src = src;
  });
}

// draw a small profile (initial) + name chip at the top-left of a card
function drawAuthorChip(ctx: CanvasRenderingContext2D, name: string) {
  const ax = 24,
    ay = 24,
    av = 56;
  ctx.font = "600 30px 'Apple SD Gothic Neo', sans-serif";
  ctx.textBaseline = "middle";
  const nameW = ctx.measureText(name).width;
  const pillW = av + 12 + nameW + 22;
  ctx.fillStyle = "rgba(0,0,0,.4)";
  roundRectPath(ctx, ax, ay, pillW, av, av / 2);
  ctx.fill();
  // avatar
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(ax + av / 2, ay + av / 2, av / 2 - 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.textAlign = "center";
  ctx.font = "700 28px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(name.slice(0, 1), ax + av / 2, ay + av / 2 + 1);
  // name
  ctx.fillStyle = "#fff";
  ctx.textAlign = "left";
  ctx.font = "600 30px 'Apple SD Gothic Neo', sans-serif";
  ctx.fillText(name, ax + av + 10, ay + av / 2 + 1);
}

// build a gallery card image (photo or placeholder) with the author chip
// baked into the top-left. Falls back to the raw photo if it can't be drawn
// to canvas (cross-origin taint).
async function buildGalleryImage(card: Card): Promise<string> {
  const w = 600,
    h = 800;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return card.img || "";
  if (card.img) {
    try {
      const img = await loadImg(card.img, true);
      const ir = img.naturalWidth / img.naturalHeight,
        tr = w / h;
      let sw, sh, sx, sy;
      if (ir > tr) {
        sh = img.naturalHeight;
        sw = sh * tr;
        sx = (img.naturalWidth - sw) / 2;
        sy = 0;
      } else {
        sw = img.naturalWidth;
        sh = sw / tr;
        sx = 0;
        sy = (img.naturalHeight - sh) / 2;
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
    } catch {
      return card.img; // tainted — show the photo without the overlay
    }
  } else {
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
  }
  drawAuthorChip(ctx, card.who || "나");
  try {
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return card.img || "";
  }
}

/* ===================================================================
   wakii — full prototype, ported from khux-prototype-full.html to React.
   Behaviour and visuals match the original; logic is driven by React
   state instead of imperative DOM mutation so it's easy to iterate on.
   =================================================================== */

type ScreenId = "home" | "room" | "walk" | "my";


const overlays = ["🌅", "☕️", "🐶", "🍱", "🌷", "🌧️", "🌻", "🍙", ""];

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

const walkRooms = [
  { nm: "엄마아빠", e: "🏠" },
  { nm: "언니", e: "👩" },
  { nm: "동생", e: "🐣" },
  { nm: "할머니", e: "👵" },
];
const walkGoals = [
  { name: "나일강 종주", dist: 6650, done: 4180 },
  { name: "룸피니 둘레", dist: 2500, done: 900 },
  { name: "한라산 등반", dist: 1950, done: 1950 },
  { name: "제주 올레길", dist: 4250, done: 300 },
];

const uploadedDays: Record<number, number> = {
  1: 2, 5: 1, 8: 3, 11: 1, 12: 2, 13: 1, 17: 1, 23: 2, 24: 1, 25: 3, 26: 1,
};
const stepsByDay: Record<number, number> = {
  1: 5400, 5: 7100, 8: 3200, 11: 8800, 12: 6600, 13: 4100, 17: 9200, 23: 5800, 24: 6200, 25: 7400, 26: 6200,
};

type Bubble = { id: number; emoji: string; left: number; size: number; dx: number; dy: number; dur: number; delay: number };
type UploadMode = "new" | "mission" | "room";

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

  // identity — name only for now (Kakao login later)
  const [name, setName] = useState("");
  const [needName, setNeedName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const author = name || "나";

  // rooms — start empty on the backend (real data); seeded demo only in mock mode
  const [rooms, setRooms] = useState<RoomsData>(hasSupabase ? {} : initialRooms);
  const [currentRoom, setCurrentRoom] = useState("엄마아빠");
  const [currentRoomEmoji, setCurrentRoomEmoji] = useState("🏠");
  const [openDeckIdx, setOpenDeckIdx] = useState<number | null>(null);
  const [galReact, setGalReact] = useState(false); // reaction row in the deck gallery
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
  const [recentRooms, setRecentRooms] = useState<string[]>(walkRooms.map((r) => r.nm));

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
  const [recapTitle, setRecapTitle] = useState("나일강 종주 완주!");
  const [recapSub, setRecapSub] = useState("312시간 만에 함께 도착했어요");

  // walk
  const [walkSel, setWalkSel] = useState(0);

  // calendar
  const [calSel, setCalSel] = useState<number | null>(null);

  // ---------- navigation ----------
  const go = (id: ScreenId) => setScreen(id);

  const openRoom = (name: string, emoji: string) => {
    setCurrentRoom(name);
    setCurrentRoomEmoji(emoji);
    setOpenDeckIdx(null);
    setRoomViewMode("deck");
    setScreen("room");
    if (roomScreenRef.current) roomScreenRef.current.scrollTop = 0;
  };

  // ---------- room board ----------
  const decks = rooms[currentRoom];
  const openDeck = openDeckIdx != null ? decks?.[openDeckIdx] : null;

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
    let cancelled = false;
    Promise.all(
      deck.cards.map((c, i) =>
        buildGalleryImage(c).then((image) => ({
          image,
          text: deck.isMission ? c.who : roleLabel(i),
        })),
      ),
    ).then((items) => {
      if (!cancelled) setGalleryItems(items);
    });
    return () => {
      cancelled = true;
    };
  }, [openDeckIdx, currentRoom, rooms]);

  // load the saved name on mount (prompt for it the first time)
  useEffect(() => {
    try {
      const saved = localStorage.getItem("wakii.name");
      if (saved) setName(saved);
      else setNeedName(true);
    } catch {
      setNeedName(true);
    }
  }, []);
  const saveName = () => {
    const v = nameDraft.trim();
    if (!v) return;
    setName(v);
    setNeedName(false);
    try {
      localStorage.setItem("wakii.name", v);
    } catch {
      /* ignore */
    }
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
      listRoom(room, name)
        .then((decks) => setRooms((r) => ({ ...r, [room]: decks })))
        .catch(() => {});
    },
    [name],
  );

  // fetch + live-subscribe the current room when backed by Supabase
  useEffect(() => {
    if (!hasSupabase) return;
    refreshRoom(currentRoom);
    const unsub = subscribeRoom(currentRoom, () => refreshRoom(currentRoom));
    return unsub;
  }, [currentRoom, refreshRoom]);

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

  const addReply = (di: number) => {
    const deck = rooms[currentRoom]?.[di];
    if (hasSupabase) {
      if (deck?.id) addReplyCard(deck.id, author, null).then(() => refreshRoom(currentRoom));
      toast("답장을 남겼어요");
      return;
    }
    setRooms((prev) => {
      const next: RoomsData = { ...prev, [currentRoom]: prev[currentRoom].map((d) => ({ ...d, cards: [...d.cards] })) };
      next[currentRoom][di].cards.push({
        who: author,
        mine: true,
        date: "2026. 6. 26",
        ov: overlays[Math.floor(Math.random() * overlays.length)],
        reply: true,
      });
      return next;
    });
    toast("답장이 덱에 쌓였어요 (선형 +1)");
  };

  // ---------- emoji react ----------
  const pickEmoji = (e: string) => {
    spawnBubble(e);
    toast(e + " 반응을 남겼어요");
    if (hasSupabase) {
      const cardId = openDeck?.cards[0]?.id;
      if (cardId) addReaction(cardId, author, e).then(() => refreshRoom(currentRoom));
    }
  };
  const spawnBubble = (e: string) => {
    // iMessage-style: many emojis rising from across the whole bottom edge,
    // over a longer (~2x) duration.
    const made: Bubble[] = [];
    const count = 16;
    for (let i = 0; i < count; i++) {
      made.push({
        id: bubbleId.current++,
        emoji: e,
        left: 4 + Math.random() * 92,
        size: 20 + Math.random() * 18,
        dx: (Math.random() - 0.5) * 90,
        dy: -(360 + Math.random() * 300),
        dur: 2.4 + Math.random() * 1.6,
        delay: Math.random() * 0.6,
      });
    }
    setBubbles((b) => [...b, ...made]);
    const ids = made.map((m) => m.id);
    setTimeout(() => setBubbles((b) => b.filter((x) => !ids.includes(x.id))), 4600);
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
    setShareTargets(mode === "room" ? [currentRoom] : recentRooms.slice(0, 1));
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

  // rooms ordered by most-recently shared (for the share sheet)
  const orderedRooms = [
    ...recentRooms,
    ...walkRooms.map((r) => r.nm).filter((n) => !recentRooms.includes(n)),
  ]
    .map((nm) => walkRooms.find((r) => r.nm === nm))
    .filter((r): r is (typeof walkRooms)[number] => Boolean(r));

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
  const addPhotoDeck = (roomName: string, img: string) => {
    const d = new Date();
    const date = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
    setRooms((prev) => {
      const list = prev[roomName] ? [...prev[roomName]] : [];
      list.unshift({
        label: author,
        when: "오늘",
        isMission: false,
        cards: [{ who: author, mine: true, date, ov: "", img }],
      });
      return { ...prev, [roomName]: list };
    });
  };

  const doShare = async () => {
    const img = (await editorRef.current?.getComposite()) || capturedSrc || undefined;
    const targets = shareTargets.length ? shareTargets : [currentRoom];
    if (img) {
      if (hasSupabase) {
        try {
          const url = await uploadPhoto(img);
          await Promise.all(targets.map((r) => createPhotoDeck(r, author, url)));
          refreshRoom(currentRoom);
        } catch {
          toast("업로드 실패 — 잠시 후 다시 시도해주세요");
        }
      } else {
        targets.forEach((r) => addPhotoDeck(r, img));
      }
    }
    bumpRecent(targets);
    closeUpload();
    go("home");
    toast("공유했어요 · 덱에 올라갔어요");
  };

  // ---------- walk ----------
  const g = walkGoals[walkSel];
  const pct = Math.round((g.done / g.dist) * 100);

  const showRecap = (name: string, i: number) => {
    setRecapTitle(name + " 구간 " + i / 2 + " 도착!");
    setRecapSub(Math.round(40 + Math.random() * 300) + "시간 만에 함께 도착했어요");
    setRecapShow(true);
  };
  const lockFlag = () => toast("아직 도착 전이에요 · 함께 걸어서 채워요");

  // build winding walk map (same maths as the prototype)
  const W = 308,
    H = 760,
    segs = 7;
  const pts: [number, number][] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const y = H - 20 - (H - 60) * t;
    const x = W / 2 + Math.sin(t * Math.PI * 3) * 100;
    pts.push([x, y]);
  }
  let dpath = `M${pts[0][0]},${pts[0][1]}`;
  for (let i = 1; i < pts.length; i++) {
    const [px, py] = pts[i - 1];
    const [cx, cy] = pts[i];
    const my = (py + cy) / 2;
    dpath += ` C${px},${my} ${cx},${my} ${cx},${cy}`;
  }
  const reached = pct / 100;

  // ---------- calendar detail ----------
  const calDetail = (() => {
    if (calSel == null) return null;
    const up = uploadedDays[calSel] || 0;
    const steps = stepsByDay[calSel] || 0;
    if (!up && !steps) return null;
    return { day: calSel, up, steps };
  })();

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
          <div className={"screen" + (screen === "home" ? " active" : "")} id="s-home">
            <div className="mission">
              <span className="mlabel">오늘의 미션</span>
              <div className="mtext">
                오늘은 하지예요! 1년 중 해가
                <br />가장 긴 날의 풍경을 담아보세요 ☀️
              </div>
              <button className="mbtn" onClick={() => openUpload("mission")}>
                📷 촬영 후 공유하기
              </button>
            </div>

            <div className="steptext">
              <b>6,200</b> 걸음
            </div>

            <div className="mark">
              <div className="house">🏠</div>
              <div className="mk">우리</div>
            </div>

            <div className="roomsheet">
              <div className="room" onClick={() => openRoom("엄마아빠", "🏠")}>
                <div className="ravatar on">🏠</div>
                <div className="rmeta">
                  <div className="rname">엄마아빠</div>
                  <div className="rprev">새 사진</div>
                </div>
                <span className="rbadge">2</span>
              </div>
              <div className="room" onClick={() => openRoom("언니", "👩")}>
                <div className="ravatar">👩</div>
                <div className="rmeta">
                  <div className="rname">언니</div>
                  <div className="rprev">어제</div>
                </div>
              </div>
              <div className="room" onClick={() => openRoom("동생", "🐣")}>
                <div className="ravatar">🐣</div>
                <div className="rmeta">
                  <div className="rname">동생</div>
                  <div className="rprev">3일 전</div>
                </div>
              </div>
              <div className="room" onClick={() => openRoom("할머니", "👵")}>
                <div className="ravatar">👵</div>
                <div className="rmeta">
                  <div className="rname">할머니</div>
                  <div className="rprev">지난주</div>
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
                {currentRoom} {currentRoomEmoji}
              </span>
              <span className="cam" onClick={() => openUpload("room")}>
                📷
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
                {(decks || []).map((deck, di) => {
                  const n = deck.cards.length;
                  const names = Array.from(new Set(deck.cards.map((c) => c.who)));
                  const rxTotal = deck.cards.reduce((s, c) => s + (c.reactions?.length || 0), 0);
                  return (
                    <div key={di} className="deckwrap">
                      <div className="decklabel">
                        {deck.isMission ? (
                          <b className="mission-names">📷 {names.join(" · ")}</b>
                        ) : (
                          <>
                            <b>{deck.label}</b>가 시작 · {deck.when}
                          </>
                        )}
                        {rxTotal > 0 && <span className="rxcnt">🙂 {rxTotal}</span>}
                        <span className="cnt">{n}장</span>
                      </div>

                      {/* closed stack — tap to open the circular gallery */}
                      <div className="deck" onClick={() => setOpenDeckIdx(di)}>
                        {deck.cards.map((c, i) => {
                          const depth = n - 1 - i;
                          const style: React.CSSProperties = {
                            transform: `translateX(calc(-50% + ${depth * -4}px)) translateY(${depth * 5}px) scale(${1 - depth * 0.03})`,
                            zIndex: 10 + i,
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
                              <div className="meta">{deck.isMission ? c.who : roleLabel(i)}</div>
                              {!c.img && c.ov && <div className="ov">{c.ov}</div>}
                              <div className="seq">{i + 1}</div>
                              {c.reply && <div className="reporig" />}
                            </div>
                          );
                        })}
                        <div className="hint">탭하면 둘러보기 ›</div>
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
                          <div key={i} className={"gcell " + (c.mine ? "mine" : "")}>
                            {c.ov && <div className="gov">{c.ov}</div>}
                          </div>
                        ))}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            )}
          </div>

          {/* ===== WALK ===== */}
          <div className={"screen" + (screen === "walk" ? " active" : "")} id="s-walk">
            <div className="sec-title">걸음 · 공동 여정</div>
            <div className="walkstories">
              {walkRooms.map((r, i) => (
                <div
                  key={i}
                  className={"wstory" + (i === walkSel ? " on" : "")}
                  onClick={() => setWalkSel(i)}
                >
                  <div className="ring">
                    <div className="inner">{r.e}</div>
                  </div>
                  <div className="nm">{r.nm}</div>
                </div>
              ))}
            </div>
            <div className="walkgoal">
              <div>
                <div className="gname">{g.name}</div>
                <div className="gdist">
                  목표 {g.dist.toLocaleString()}km · 함께 {g.done.toLocaleString()}km
                </div>
              </div>
              <div className="gpct">{pct}%</div>
            </div>
            {pct >= 100 && (
              <div style={{ textAlign: "center", margin: "8px 16px 0" }}>
                <span
                  className="change"
                  style={{ background: "var(--ink)", color: "#fff", borderColor: "var(--ink)" }}
                  onClick={() => toast("새 목표 — 함께 걸은 거리보다 먼 곳만 선택지로 떠요")}
                >
                  🏁 완주! 새 목표 고르기 →
                </span>
              </div>
            )}
            <div className="walkmap">
              <svg
                viewBox={`0 0 ${W} ${H}`}
                width="100%"
                height="100%"
                preserveAspectRatio="xMidYMin meet"
              >
                <defs>
                  <filter id="fog" x="-60%" y="-60%" width="220%" height="220%">
                    <feGaussianBlur stdDeviation="2.4" />
                  </filter>
                </defs>
                <path d={dpath} fill="none" stroke="#fff" strokeWidth="10" strokeLinecap="round" opacity="0.7" />
                <path d={dpath} fill="none" stroke="#9E9E9E" strokeWidth="3" strokeDasharray="4 5" />
                <text x={pts[0][0]} y={pts[0][1] + 24} fontSize="13" textAnchor="middle">
                  🚩 출발
                </text>
                {pts.map((p, i) => {
                  if (i === 0 || i % 2 !== 0) return null;
                  const t = i / segs;
                  const done = t <= reached;
                  if (done) {
                    return (
                      <g key={i} style={{ cursor: "pointer" }} onClick={() => showRecap(g.name, i)}>
                        <circle cx={p[0]} cy={p[1]} r="15" fill="#1A1A1A" stroke="#fff" strokeWidth="2.5" />
                        <text x={p[0]} y={p[1] + 5} fontSize="14" textAnchor="middle" fill="#fff">
                          🏁
                        </text>
                      </g>
                    );
                  }
                  return (
                    <g key={i} style={{ cursor: "pointer" }} onClick={lockFlag}>
                      <circle cx={p[0]} cy={p[1]} r="15" fill="#CFCDCA" stroke="#BBB8B5" strokeWidth="1.5" filter="url(#fog)" />
                      <text x={p[0]} y={p[1] + 5} fontSize="13" textAnchor="middle" fill="#fff" opacity="0.85">
                        ?
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </div>

          {/* ===== MY ===== */}
          <div className={"screen" + (screen === "my" ? " active" : "")} id="s-my">
            <div className="myhero">
              <div className="myava">🙂</div>
              <div className="myname">나</div>
              <div className="mysub">가족 4 · 함께 걷는 중</div>
            </div>
            <div className="cal">
              <h4>활동 캘린더 · 6월</h4>
              <div className="calgrid">
                {["일", "월", "화", "수", "목", "금", "토"].map((d) => (
                  <div key={d} className="caldow">
                    {d}
                  </div>
                ))}
                {Array.from({ length: 1 }).map((_, i) => (
                  <div key={"e" + i} className="calday empty" />
                ))}
                {Array.from({ length: 30 }).map((_, idx) => {
                  const d = idx + 1;
                  return (
                    <div
                      key={d}
                      className={
                        "calday" + (uploadedDays[d] ? " has" : "") + (calSel === d ? " sel" : "")
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
                <div className="cd-date">6월 {calDetail.day}일</div>
                <div className="cd-row">
                  👣 그날 내 걸음{" "}
                  <b style={{ marginLeft: "auto", color: "var(--ink)" }}>
                    {calDetail.steps.toLocaleString()}
                  </b>
                </div>
                <div className="cd-row">📷 올린 콘텐츠 {calDetail.up}개</div>
                <div className="cd-thumbs">
                  {calDetail.up > 0 ? (
                    Array.from({ length: calDetail.up }).map((_, i) => <div key={i} />)
                  ) : (
                    <span style={{ fontSize: 10, color: "var(--g40)" }}>없음</span>
                  )}
                </div>
              </div>
            )}
            <div className="mylist">
              <div className="myitem" onClick={() => toast("프로필 사진 = 걸음 맵 마커로 쓰여요")}>
                <span className="mi">📷</span> 프로필 사진 <span className="chev">›</span>
              </div>
              <div className="myitem" onClick={() => toast("방·가족 관리")}>
                <span className="mi">🏠</span> 방 관리 <span className="chev">›</span>
              </div>
              <div className="myitem" onClick={() => toast("알림 설정")}>
                <span className="mi">🔔</span> 알림 <span className="chev">›</span>
              </div>
              <div className="myitem" onClick={() => toast("계정·설정")}>
                <span className="mi">⚙️</span> 설정 <span className="chev">›</span>
              </div>
            </div>
          </div>

          {/* upload overlay */}
          <div className={"uploadlayer" + (uploadShow ? " show" : "")}>
            <div className="ul-top">
              <span className="x" onClick={closeUpload}>
                ✕
              </span>
              <span className="ttl">{uploadMode === "mission" ? "미션 촬영" : "새 짤"}</span>
              <span style={{ width: 18 }} />
            </div>
            <div className="ul-stage">
              {!shotTaken && (
                <>
                  {uploadMode === "mission" && <div className="ul-prompt">💡 오늘의 미션 촬영</div>}
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
                    <div className="ratio">3:4</div>
                  </div>
                  <div className="ul-shutter" onClick={shoot} />
                  {uploadMode === "new" && (
                    <div className="ul-gallery" onClick={() => galleryInputRef.current?.click()}>
                      🖼️
                    </div>
                  )}
                </>
              )}
              {/* after capture: full Instagram-style editor (all modes) */}
              {shotTaken && capturedSrc && (
                <PhotoEditor ref={editorRef} src={capturedSrc} toast={toast} />
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
              <div className="ul-next" onClick={() => setShareShow(true)}>
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
            <div className="rc-flag">🏁</div>
            <div className="rc-title">{recapTitle}</div>
            <div className="rc-sub">{recapSub}</div>
            <div className="rc-strip">
              <div />
              <div />
              <div />
              <div />
            </div>
            <div className="rc-ai">AI가 이 여정에서 반응 많았던 짤을 골랐어요</div>
          </div>

          {/* toast */}
          <div className={"toast" + (toastShown ? " show" : "")}>{toastMsg}</div>
        </div>

        {/* glass nav */}
        <div className="nav">
          <div className={"tab" + (screen === "home" ? " on" : "")} onClick={() => go("home")}>
            <span className="ni">🏠</span>
            <span className="nl">홈</span>
          </div>
          <div className="upload" onClick={() => openUpload("new")}>
            ＋
          </div>
          <div className={"tab" + (screen === "walk" ? " on" : "")} onClick={() => go("walk")}>
            <span className="ni">👣</span>
            <span className="nl">걸음</span>
          </div>
          <div className="divider" />
          <div className={"tab" + (screen === "my" ? " on" : "")} onClick={() => go("my")}>
            <span className="ni">👤</span>
            <span className="nl">마이</span>
          </div>
        </div>

        {/* ===== deck circular gallery (opens over everything, dark/blur bg) ===== */}
        {openDeck && (
          <div className="deckgallery" onClick={() => setOpenDeckIdx(null)}>
            <div className="dg-top" onClick={(e) => e.stopPropagation()}>
              <b>
                {openDeck.isMission ? "📷 " : ""}
                {openDeck.label}
              </b>
              <span className="dg-x" onClick={() => setOpenDeckIdx(null)}>
                ✕
              </span>
            </div>

            <div className="dg-stage" onClick={(e) => e.stopPropagation()}>
              <CircularGallery
                items={galleryItems}
                bend={3}
                textColor="#ffffff"
                borderRadius={0.06}
                font="600 30px sans-serif"
                fontUrl={undefined}
                scrollEase={0.03}
              />
              {/* floating reaction bubbles */}
              {bubbles.map((b) => (
                <div
                  key={b.id}
                  className="bubble"
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
              ))}
            </div>

            {galReact && (
              <div className="dg-emojis" onClick={(e) => e.stopPropagation()}>
                {["❤️", "🙂", "👍", "😢", "😮"].map((e) => (
                  <span
                    key={e}
                    onClick={() => {
                      setGalReact(false);
                      pickEmoji(e);
                    }}
                  >
                    {e}
                  </span>
                ))}
              </div>
            )}

            <div className="dg-acts" onClick={(e) => e.stopPropagation()}>
              <button className="b-react" onClick={() => setGalReact((v) => !v)}>
                🙂 반응
              </button>
              {!openDeck.isMission && (
                <button className="b-reply" onClick={() => openDeckIdx != null && addReply(openDeckIdx)}>
                  📷 답장
                </button>
              )}
              <button className="b-close" onClick={() => setOpenDeckIdx(null)}>
                닫기
              </button>
            </div>
          </div>
        )}

        {/* first-run name prompt */}
        {needName && (
          <div className="namemodal">
            <div className="nm-panel">
              <div className="nm-title">이름을 알려주세요</div>
              <div className="nm-sub">가족 방에 이 이름으로 표시돼요</div>
              <input
                autoFocus
                value={nameDraft}
                placeholder="예) 줄리"
                onChange={(e) => setNameDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveName()}
              />
              <button className="nm-go" onClick={saveName}>
                시작하기
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="hintline">
        포인트: 홈 미션 배너 → 촬영 / 방 들어가 덱 탭하면 펼침 · 답장으로 카드 쌓기 / 걸음 탭에서 맵 위 깃발 눌러 리캡 / 마이 캘린더 날짜 탭
      </div>
    </>
  );
}
