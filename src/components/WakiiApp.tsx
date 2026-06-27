"use client";

import { useRef, useState } from "react";

/* ===================================================================
   wakii — full prototype, ported from khux-prototype-full.html to React.
   Behaviour and visuals match the original; logic is driven by React
   state instead of imperative DOM mutation so it's easy to iterate on.
   =================================================================== */

type ScreenId = "home" | "room" | "walk" | "my";

type Card = {
  who: string;
  mine: boolean;
  date: string;
  ov: string;
  reply?: boolean;
};
type Deck = { label: string; when: string; isMission: boolean; cards: Card[] };
type RoomsData = Record<string, Deck[]>;

const overlays = ["🌅", "☕️", "🐶", "🍱", "🌷", "🌧️", "🌻", "🍙", ""];

const initialRooms: RoomsData = {
  엄마아빠: [
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
      label: "오늘의 풍경",
      when: "오늘",
      isMission: true,
      cards: [
        { who: "나", mine: true, date: "2026. 6. 26", ov: "🌻" },
        { who: "엄마", mine: false, date: "2026. 6. 26", ov: "🌷" },
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

type Bubble = { id: number; emoji: string; left: number; size: number; dx: number; dy: number };
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

  // rooms
  const [rooms, setRooms] = useState<RoomsData>(initialRooms);
  const [currentRoom, setCurrentRoom] = useState("엄마아빠");
  const [currentRoomEmoji, setCurrentRoomEmoji] = useState("🏠");
  const [openDeckIdx, setOpenDeckIdx] = useState<number | null>(null);
  const [activeByDeck, setActiveByDeck] = useState<Record<number, number>>({});
  const [roomViewMode, setRoomViewMode] = useState<"deck" | "review">("deck");
  const roomScreenRef = useRef<HTMLDivElement>(null);

  // emoji react bar
  const [emojiShown, setEmojiShown] = useState(false);
  const [emojiBottom, setEmojiBottom] = useState(0);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const bubbleId = useRef(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const emojibarRef = useRef<HTMLDivElement>(null);

  // upload
  const [uploadShow, setUploadShow] = useState(false);
  const [uploadMode, setUploadMode] = useState<UploadMode>("new");
  const [shotTaken, setShotTaken] = useState(false);
  const [shareShow, setShareShow] = useState(false);
  const [shareSel, setShareSel] = useState([true, false, false]);

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
    setActiveByDeck({});
    setRoomViewMode("deck");
    setScreen("room");
    if (roomScreenRef.current) roomScreenRef.current.scrollTop = 0;
  };

  // ---------- room board ----------
  const decks = rooms[currentRoom];

  const toggleDeck = (di: number) =>
    setOpenDeckIdx((cur) => (cur === di ? null : di));

  const setActive = (di: number, i: number) =>
    setActiveByDeck((m) => ({ ...m, [di]: i }));

  const addReply = (di: number) => {
    setRooms((prev) => {
      const next: RoomsData = { ...prev, [currentRoom]: prev[currentRoom].map((d) => ({ ...d, cards: [...d.cards] })) };
      next[currentRoom][di].cards.push({
        who: "나",
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
  const showEmoji = (deckEl: HTMLElement) => {
    const vp = viewportRef.current?.getBoundingClientRect();
    const r = deckEl.getBoundingClientRect();
    if (vp) setEmojiBottom(vp.bottom - r.top + 4);
    setEmojiShown(true);
  };
  const pickEmoji = (e: string) => {
    setEmojiShown(false);
    spawnBubble(e);
    toast(e + " 반응을 남겼어요");
  };
  const spawnBubble = (e: string) => {
    const made: Bubble[] = [];
    for (let i = 0; i < 5; i++) {
      made.push({
        id: bubbleId.current++,
        emoji: e,
        left: 40 + Math.random() * 40,
        size: 16 + Math.random() * 12,
        dx: (Math.random() - 0.5) * 60,
        dy: -(200 + Math.random() * 120),
      });
    }
    setBubbles((b) => [...b, ...made]);
    const ids = made.map((m) => m.id);
    setTimeout(() => setBubbles((b) => b.filter((x) => !ids.includes(x.id))), 1500);
  };

  // ---------- upload ----------
  const openUpload = (mode: UploadMode) => {
    setUploadMode(mode);
    setShotTaken(false);
    setShareShow(false);
    setUploadShow(true);
  };
  const closeUpload = () => {
    setUploadShow(false);
    setShareShow(false);
  };
  const shoot = () => {
    setShotTaken(true);
    if (uploadMode === "mission") {
      setTimeout(() => {
        closeUpload();
        toast("미션 완수! 1/4 → 2/4");
      }, 500);
    }
  };
  const toggleShare = (idx: number) =>
    setShareSel((s) => s.map((v, i) => (i === idx ? !v : v)));
  const doShare = () => {
    closeUpload();
    go("home");
    toast("공유했어요 · 홈으로");
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

        <div
          className="viewport"
          ref={viewportRef}
          onClick={(ev) => {
            const t = ev.target as HTMLElement;
            if (emojibarRef.current && !emojibarRef.current.contains(t) && !t.closest(".b-react")) {
              setEmojiShown(false);
            }
          }}
        >
          {/* ===== HOME ===== */}
          <div className={"screen" + (screen === "home" ? " active" : "")} id="s-home">
            <div className="mission">
              <span className="mlabel">오늘의 미션</span>
              <span className="mcount">1/4</span>
              <div className="mtext">
                오늘은 하지예요! 1년 중 해가
                <br />가장 긴 날의 풍경을 담아보세요 ☀️
              </div>
              <button className="mbtn" onClick={() => openUpload("mission")}>
                📷 촬영 후 공유하기
              </button>
            </div>

            <div className="stepbar">
              <div>
                <div className="big">6,200</div>
                <div className="lbl">오늘 내 걸음</div>
              </div>
              <div className="foot">👣</div>
            </div>

            <div className="mark">
              <div className="house">🏠</div>
              <div className="mk">우리</div>
            </div>

            <div className="roomsheet">
              <div className="grip" />
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
                돌아보기
              </span>
            </div>

            {roomViewMode === "deck" && (
              <div className="board">
                {decks.map((deck, di) => {
                  const n = deck.cards.length;
                  const open = openDeckIdx === di;
                  const active = open ? activeByDeck[di] ?? n - 1 : n - 1;
                  return (
                    <div key={di} className={"deckwrap" + (open ? " open" : "")}>
                      <div className="decklabel">
                        <b>{deck.label}</b>
                        {deck.isMission ? "의 미션" : "가 시작"} · {deck.when}
                        <span className="cnt">{n}장</span>
                      </div>

                      <div
                        className={"deck" + (open ? " open" : "")}
                        onClick={() => toggleDeck(di)}
                      >
                        {deck.cards.map((c, i) => {
                          const style: React.CSSProperties = {};
                          if (open) {
                            const rel = i - active;
                            const abs = Math.abs(rel);
                            const ang = rel * 26;
                            const x = rel * 46;
                            const z = -abs * 70;
                            const scale = abs === 0 ? 1.12 : Math.max(0.7, 1 - abs * 0.14);
                            style.transform = `translateX(calc(-50% + ${x}px)) translateZ(${z}px) rotateY(${-ang}deg) scale(${scale})`;
                            style.zIndex = 50 - abs;
                            style.opacity = abs > 2 ? 0 : 1;
                            style.cursor = "pointer";
                          } else {
                            const depth = n - 1 - i;
                            style.transform = `translateX(calc(-50% + ${depth * -4}px)) translateY(${depth * 5}px) scale(${1 - depth * 0.03})`;
                            style.zIndex = 10 + i;
                            style.opacity = depth > 3 ? 0 : 1;
                          }
                          return (
                            <div
                              key={i}
                              className={"card" + (c.mine ? " mine" : "")}
                              style={style}
                              onClick={(e) => {
                                if (open && i !== active) {
                                  e.stopPropagation();
                                  setActive(di, i);
                                }
                              }}
                            >
                              <div className="meta">{c.who}</div>
                              {c.ov && <div className="ov">{c.ov}</div>}
                              <div className="seq">{i + 1}</div>
                              {c.reply && <div className="reporig" />}
                            </div>
                          );
                        })}
                        <div className="hint">
                          {open
                            ? n > 1
                              ? "좌우 카드를 탭해 넘겨보세요"
                              : ""
                            : n > 1
                              ? "탭하면 둘러보기 ›"
                              : "탭해서 보기 ›"}
                        </div>
                      </div>

                      {deck.isMission && (
                        <div className="missionchip">
                          📷 오늘의 풍경 공유 · 답장 없이 반응만
                        </div>
                      )}

                      <div className="deckacts">
                        <button
                          className="b-react"
                          onClick={(e) => {
                            e.stopPropagation();
                            const deckEl = (e.currentTarget.closest(".deckwrap") as HTMLElement)?.querySelector(
                              ".deck",
                            ) as HTMLElement;
                            if (deckEl) showEmoji(deckEl);
                          }}
                        >
                          🙂 반응
                        </button>
                        {!deck.isMission && (
                          <button
                            className="b-reply"
                            onClick={(e) => {
                              e.stopPropagation();
                              addReply(di);
                            }}
                          >
                            📷 답장
                          </button>
                        )}
                        <button
                          className="b-close"
                          onClick={(e) => {
                            e.stopPropagation();
                            setOpenDeckIdx(null);
                          }}
                        >
                          닫기
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {roomViewMode === "review" && (
              <div className="review">
                {(() => {
                  const all: Card[] = [];
                  decks.forEach((d) => d.cards.forEach((c) => all.push(c)));
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
              {uploadMode === "mission" && <div className="ul-prompt">💡 오늘의 미션 촬영</div>}
              <div className="vf">
                <div className="ratio">3:4</div>
                {shotTaken && (
                  <div className="ed-stk" style={{ top: 8, right: 8 }}>
                    오후 3:42
                  </div>
                )}
              </div>
              {!shotTaken && <div className="ul-shutter" onClick={shoot} />}
              {!shotTaken && uploadMode === "new" && (
                <div className="ul-gallery" onClick={() => toast("갤러리 — 업로드(새 글)에서만")}>
                  🖼️
                </div>
              )}
            </div>
            {shotTaken && uploadMode !== "mission" && (
              <div className="ul-tools">
                <div className="tg">
                  <span className="ic">😊</span>
                  <span className="tx">이모지</span>
                </div>
                <div className="tg">
                  <span className="ic">✏️</span>
                  <span className="tx">그림</span>
                </div>
                <div className="tg">
                  <span className="ic">T</span>
                  <span className="tx">텍스트</span>
                </div>
                <div className="tg">
                  <span className="ic">🎤</span>
                  <span className="tx">음성</span>
                </div>
              </div>
            )}
            {shotTaken && (
              <div className="ul-next" onClick={() => setShareShow(true)}>
                →
              </div>
            )}
            {/* share */}
            <div className={"sharesheet" + (shareShow ? " show" : "")}>
              <div className="ss-panel">
                <div className="grip" />
                <h4>어디에 공유할까요?</h4>
                {["🏠 엄마아빠", "👩 언니", "🐣 동생"].map((label, i) => (
                  <div
                    key={i}
                    className={"ss-room" + (shareSel[i] ? " sel" : "")}
                    onClick={() => toggleShare(i)}
                  >
                    {label}{" "}
                    <span className="ck" style={shareSel[i] ? undefined : { color: "var(--g25)" }}>
                      {shareSel[i] ? "✓" : "○"}
                    </span>
                  </div>
                ))}
                <button className="ss-go" onClick={doShare}>
                  공유
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

          {/* reaction emoji bar */}
          <div
            className={"emojibar" + (emojiShown ? " show" : "")}
            ref={emojibarRef}
            style={{ bottom: emojiBottom }}
          >
            {["❤️", "🙂", "👍", "😢", "😮"].map((e) => (
              <span key={e} onClick={() => pickEmoji(e)}>
                {e}
              </span>
            ))}
          </div>

          {/* floating reaction bubbles */}
          {bubbles.map((b) => (
            <div
              key={b.id}
              className="bubble"
              style={
                {
                  left: b.left + "%",
                  bottom: 120,
                  fontSize: b.size,
                  ["--dx" as string]: b.dx + "px",
                  ["--dy" as string]: b.dy + "px",
                } as React.CSSProperties
              }
            >
              {b.emoji}
            </div>
          ))}

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
      </div>

      <div className="hintline">
        포인트: 홈 미션 배너 → 촬영 / 방 들어가 덱 탭하면 펼침 · 답장으로 카드 쌓기 / 걸음 탭에서 맵 위 깃발 눌러 리캡 / 마이 캘린더 날짜 탭
      </div>
    </>
  );
}
