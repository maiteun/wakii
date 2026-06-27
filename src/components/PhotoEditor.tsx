"use client";

import { useEffect, useRef, useState } from "react";

/* ===================================================================
   PhotoEditor — Instagram-style editing on a freshly captured photo:
   emoji/text/date stickers (drag · resize · delete), freehand drawing,
   and voice recording. Self-contained; the parent only supplies the
   captured image src and a toast() for feedback.
   =================================================================== */

type StickerType = "emoji" | "text" | "datetime";
type Sticker = {
  id: number;
  type: StickerType;
  content: string;
  x: number; // % of stage width  (center)
  y: number; // % of stage height (center)
  scale: number;
};
type Stroke = { color: string; size: number; points: { x: number; y: number }[] };

type Tool = "none" | "emoji" | "draw" | "text" | "voice";

const EMOJIS = ["😀", "😂", "😍", "🥰", "😎", "😭", "👍", "🙏", "🎉", "❤️", "🔥", "✨", "🌟", "🌸", "🐶", "🐱", "🍰", "☕️", "🌈", "⭐️", "🌻", "🍙"];
const PEN_COLORS = ["#FFFFFF", "#1A1A1A", "#FF3B30", "#FFCC00", "#34C759", "#0A84FF", "#FF2D55"];
const PEN_SIZES = [4, 8, 16];

function nowStamp() {
  const d = new Date();
  const date = `${d.getFullYear()}. ${d.getMonth() + 1}. ${d.getDate()}`;
  const h = d.getHours();
  const ampm = h < 12 ? "오전" : "오후";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${date} · ${ampm} ${hh}:${mm}`;
}

export default function PhotoEditor({
  src,
  toast,
}: {
  src: string;
  toast: (m: string) => void;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [stickers, setStickers] = useState<Sticker[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const idRef = useRef(1);

  const [tool, setTool] = useState<Tool>("none");
  const [penColor, setPenColor] = useState(PEN_COLORS[0]);
  const [penSize, setPenSize] = useState(PEN_SIZES[1]);
  const strokesRef = useRef<Stroke[]>([]);
  const drawingRef = useRef<Stroke | null>(null);
  const [strokeCount, setStrokeCount] = useState(0); // re-render after stroke add for undo button state

  const [textDraft, setTextDraft] = useState("");

  // voice
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const [recording, setRecording] = useState(false);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);

  // default date/time sticker on mount
  useEffect(() => {
    setStickers([
      { id: idRef.current++, type: "datetime", content: nowStamp(), x: 50, y: 88, scale: 1 },
    ]);
  }, []);

  // size the drawing canvas to the stage
  useEffect(() => {
    const stage = stageRef.current;
    const canvas = canvasRef.current;
    if (!stage || !canvas) return;
    canvas.width = stage.clientWidth;
    canvas.height = stage.clientHeight;
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- drawing ----
  const redraw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    const all = drawingRef.current ? [...strokesRef.current, drawingRef.current] : strokesRef.current;
    for (const s of all) {
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.size;
      ctx.beginPath();
      s.points.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y)));
      ctx.stroke();
    }
  };
  const canvasPoint = (e: React.PointerEvent) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: ((e.clientX - r.left) / r.width) * c.width, y: ((e.clientY - r.top) / r.height) * c.height };
  };
  const onStagePointerDown = (e: React.PointerEvent) => {
    if (tool === "draw") {
      (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
      drawingRef.current = { color: penColor, size: penSize, points: [canvasPoint(e)] };
      redraw();
    } else if (e.target === stageRef.current || e.target === canvasRef.current) {
      setSelectedId(null); // tap empty area to deselect
    }
  };
  const onStagePointerMove = (e: React.PointerEvent) => {
    if (tool === "draw" && drawingRef.current) {
      drawingRef.current.points.push(canvasPoint(e));
      redraw();
    }
  };
  const onStagePointerUp = () => {
    if (tool === "draw" && drawingRef.current) {
      strokesRef.current.push(drawingRef.current);
      drawingRef.current = null;
      setStrokeCount((c) => c + 1);
    }
  };
  const undo = () => {
    strokesRef.current.pop();
    setStrokeCount((c) => c + 1);
    redraw();
  };
  const clearDraw = () => {
    strokesRef.current = [];
    setStrokeCount((c) => c + 1);
    redraw();
  };

  // ---- stickers ----
  const addSticker = (type: StickerType, content: string) => {
    const s: Sticker = { id: idRef.current++, type, content, x: 50, y: 45, scale: 1 };
    setStickers((arr) => [...arr, s]);
    setSelectedId(s.id);
  };
  const delSticker = (id: number) => {
    setStickers((arr) => arr.filter((s) => s.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  // drag a sticker
  const dragRef = useRef<{ id: number; dx: number; dy: number } | null>(null);
  const onStickerDown = (e: React.PointerEvent, s: Sticker) => {
    if (tool === "draw") return;
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setSelectedId(s.id);
    const rect = stageRef.current!.getBoundingClientRect();
    const cx = rect.left + (s.x / 100) * rect.width;
    const cy = rect.top + (s.y / 100) * rect.height;
    dragRef.current = { id: s.id, dx: e.clientX - cx, dy: e.clientY - cy };
  };
  const onStickerMove = (e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    e.stopPropagation();
    const rect = stageRef.current!.getBoundingClientRect();
    const x = ((e.clientX - d.dx - rect.left) / rect.width) * 100;
    const y = ((e.clientY - d.dy - rect.top) / rect.height) * 100;
    setStickers((arr) =>
      arr.map((s) => (s.id === d.id ? { ...s, x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) } : s)),
    );
  };
  const onStickerUp = () => {
    dragRef.current = null;
  };

  // resize handle
  const sizeRef = useRef<{ id: number; startDist: number; startScale: number } | null>(null);
  const distToCenter = (e: React.PointerEvent, s: Sticker) => {
    const rect = stageRef.current!.getBoundingClientRect();
    const cx = rect.left + (s.x / 100) * rect.width;
    const cy = rect.top + (s.y / 100) * rect.height;
    return Math.hypot(e.clientX - cx, e.clientY - cy);
  };
  const onSizeDown = (e: React.PointerEvent, s: Sticker) => {
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    sizeRef.current = { id: s.id, startDist: distToCenter(e, s) || 1, startScale: s.scale };
  };
  const onSizeMove = (e: React.PointerEvent, s: Sticker) => {
    const z = sizeRef.current;
    if (!z) return;
    e.stopPropagation();
    const scale = Math.max(0.4, Math.min(5, (z.startScale * distToCenter(e, s)) / z.startDist));
    setStickers((arr) => arr.map((x) => (x.id === z.id ? { ...x, scale } : x)));
  };
  const onSizeUp = () => {
    sizeRef.current = null;
  };

  // ---- voice ----
  const toggleVoice = async () => {
    if (recording) {
      recorderRef.current?.stop();
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        toast("음성이 첨부됐어요");
      };
      recorderRef.current = rec;
      rec.start();
      setRecording(true);
      setTool("voice");
    } catch {
      toast("마이크 권한이 필요해요");
    }
  };
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pickTool = (t: Tool) => {
    setSelectedId(null);
    if (t === "voice") {
      toggleVoice();
      return;
    }
    setTool((cur) => (cur === t ? "none" : t));
  };

  return (
    <div className="editor">
      <div
        className="editstage"
        ref={stageRef}
        onPointerDown={onStagePointerDown}
        onPointerMove={onStagePointerMove}
        onPointerUp={onStagePointerUp}
        style={{ touchAction: "none" }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="촬영한 사진" className="editphoto" />
        <canvas ref={canvasRef} className="editcanvas" style={{ pointerEvents: tool === "draw" ? "auto" : "none" }} />

        {stickers.map((s) => (
          <div
            key={s.id}
            className={"sticker s-" + s.type + (selectedId === s.id ? " selected" : "")}
            style={{ left: s.x + "%", top: s.y + "%", transform: `translate(-50%,-50%) scale(${s.scale})` }}
            onPointerDown={(e) => onStickerDown(e, s)}
            onPointerMove={onStickerMove}
            onPointerUp={onStickerUp}
          >
            <span className="stk-body">{s.content}</span>
            {selectedId === s.id && (
              <>
                <span
                  className="stk-del"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    delSticker(s.id);
                  }}
                >
                  ✕
                </span>
                <span
                  className="stk-size"
                  onPointerDown={(e) => onSizeDown(e, s)}
                  onPointerMove={(e) => onSizeMove(e, s)}
                  onPointerUp={onSizeUp}
                >
                  ⤢
                </span>
              </>
            )}
          </div>
        ))}
      </div>

      {/* contextual panels */}
      {tool === "emoji" && (
        <div className="emoji-pick">
          {EMOJIS.map((em) => (
            <span
              key={em}
              onClick={() => {
                addSticker("emoji", em);
                setTool("none");
              }}
            >
              {em}
            </span>
          ))}
        </div>
      )}

      {tool === "draw" && (
        <div className="draw-toolbar">
          <div className="dt-colors">
            {PEN_COLORS.map((c) => (
              <span
                key={c}
                className={"dt-color" + (penColor === c ? " on" : "")}
                style={{ background: c }}
                onClick={() => setPenColor(c)}
              />
            ))}
          </div>
          <div className="dt-sizes">
            {PEN_SIZES.map((sz) => (
              <span
                key={sz}
                className={"dt-size" + (penSize === sz ? " on" : "")}
                onClick={() => setPenSize(sz)}
              >
                <i style={{ width: sz, height: sz }} />
              </span>
            ))}
          </div>
          <button className="dt-btn" disabled={strokeCount === 0 && strokesRef.current.length === 0} onClick={undo}>
            ↩︎ 되돌리기
          </button>
          <button className="dt-btn" onClick={clearDraw}>
            지우기
          </button>
          <button className="dt-btn done" onClick={() => setTool("none")}>
            완료
          </button>
        </div>
      )}

      {tool === "text" && (
        <div className="text-input">
          <input
            autoFocus
            value={textDraft}
            placeholder="텍스트 입력…"
            onChange={(e) => setTextDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && textDraft.trim()) {
                addSticker("text", textDraft.trim());
                setTextDraft("");
                setTool("none");
              }
            }}
          />
          <button
            onClick={() => {
              if (textDraft.trim()) addSticker("text", textDraft.trim());
              setTextDraft("");
              setTool("none");
            }}
          >
            추가
          </button>
        </div>
      )}

      {audioUrl && (
        <div className="voice-bar">
          🎤 음성 첨부됨
          <audio src={audioUrl} controls />
          <button
            onClick={() => {
              setAudioUrl(null);
              toast("음성을 삭제했어요");
            }}
          >
            삭제
          </button>
        </div>
      )}

      {/* tools */}
      <div className="ul-tools">
        <div className={"tg" + (tool === "emoji" ? " on" : "")} onClick={() => pickTool("emoji")}>
          <span className="ic">😊</span>
          <span className="tx">이모지</span>
        </div>
        <div className={"tg" + (tool === "draw" ? " on" : "")} onClick={() => pickTool("draw")}>
          <span className="ic">✏️</span>
          <span className="tx">그림</span>
        </div>
        <div className={"tg" + (tool === "text" ? " on" : "")} onClick={() => pickTool("text")}>
          <span className="ic">T</span>
          <span className="tx">텍스트</span>
        </div>
        <div className={"tg" + (recording ? " rec" : "")} onClick={() => pickTool("voice")}>
          <span className="ic">🎤</span>
          <span className="tx">{recording ? "정지" : "음성"}</span>
        </div>
      </div>
    </div>
  );
}
