"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";

export type PhotoEditorHandle = { getComposite: () => Promise<string> };

/* ===================================================================
   PhotoEditor — Instagram-style editing on a freshly captured photo:
   emoji/text/date stickers (drag · resize · delete), freehand drawing,
   and voice recording. Self-contained; the parent only supplies the
   captured image src and a toast() for feedback.
   =================================================================== */

// "pill" types (time/weather/voice) render as a white rounded chip; emoji/text
// render as their raw content.
type StickerType = "emoji" | "text" | "time" | "weather" | "voice";
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
// fallback shown until the live weather (Open-Meteo) resolves
const MOCK_WEATHER = "🌤️ 서울";

function nowTime() {
  const d = new Date();
  const h = d.getHours();
  const ampm = h < 12 ? "오전" : "오후";
  let hh = h % 12;
  if (hh === 0) hh = 12;
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${ampm} ${hh}:${mm}`;
}

function fmtDur(sec: number) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

const PhotoEditor = forwardRef<
  PhotoEditorHandle,
  { src: string; toast: (m: string) => void; weather: string; initialEmoji?: string }
>(function PhotoEditor({ src, toast, weather, initialEmoji }, ref) {
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
  const [recSec, setRecSec] = useState(0);
  const recTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // default stickers on mount: time (top-left) + weather (top-right) pills,
  // plus the chosen reaction emoji (centre) when replying.
  useEffect(() => {
    const init: Sticker[] = [
      { id: idRef.current++, type: "time", content: nowTime(), x: 21, y: 9, scale: 1 },
      { id: idRef.current++, type: "weather", content: weather || MOCK_WEATHER, x: 79, y: 9, scale: 1 },
    ];
    if (initialEmoji) init.push({ id: idRef.current++, type: "emoji", content: initialEmoji, x: 50, y: 50, scale: 2 });
    setStickers(init);
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  const recSecRef = useRef(0);
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (ev) => ev.data.size && chunksRef.current.push(ev.data);
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: "audio/webm" });
        setAudioUrl(URL.createObjectURL(blob));
        stream.getTracks().forEach((t) => t.stop());
        if (recTimer.current) clearInterval(recTimer.current);
        const dur = recSecRef.current;
        setRecording(false);
        // drop a "▶ m:ss" voice pill on the photo (bottom-left, like the spec)
        setStickers((arr) => [
          ...arr.filter((s) => s.type !== "voice"),
          { id: idRef.current++, type: "voice", content: `▶ ${fmtDur(dur)}`, x: 22, y: 90, scale: 1 },
        ]);
        toast("음성이 첨부됐어요");
      };
      recorderRef.current = rec;
      rec.start();
      setRecSec(0);
      recSecRef.current = 0;
      if (recTimer.current) clearInterval(recTimer.current);
      recTimer.current = setInterval(() => {
        recSecRef.current += 1;
        setRecSec(recSecRef.current);
      }, 1000);
      setRecording(true);
      setTool("voice");
    } catch {
      toast("마이크 권한이 필요해요");
    }
  };
  const stopRecording = () => recorderRef.current?.stop();
  const reRecord = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setStickers((arr) => arr.filter((s) => s.type !== "voice"));
    startRecording();
  };
  const deleteVoice = () => {
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioUrl(null);
    setStickers((arr) => arr.filter((s) => s.type !== "voice"));
    toast("음성을 삭제했어요");
  };
  useEffect(() => {
    return () => {
      if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
      if (recTimer.current) clearInterval(recTimer.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // expose a flattened composite (photo + drawing + stickers) to the parent
  useImperativeHandle(
    ref,
    () => ({
      getComposite: async () => {
        const COMPW = 600,
          COMPH = 800;
        const out = document.createElement("canvas");
        out.width = COMPW;
        out.height = COMPH;
        const ctx = out.getContext("2d");
        if (!ctx) return src;
        const img = await new Promise<HTMLImageElement | null>((res) => {
          const im = new Image();
          im.onload = () => res(im);
          im.onerror = () => res(null);
          im.src = src;
        });
        if (img) {
          const ir = img.naturalWidth / img.naturalHeight,
            tr = COMPW / COMPH;
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
          ctx.drawImage(img, sx, sy, sw, sh, 0, 0, COMPW, COMPH);
        } else {
          ctx.fillStyle = "#3a3a3a";
          ctx.fillRect(0, 0, COMPW, COMPH);
        }
        // drawing strokes (canvas px -> composite px)
        const cv = canvasRef.current;
        if (cv && cv.width) {
          const fx = COMPW / cv.width,
            fy = COMPH / cv.height;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          for (const s of strokesRef.current) {
            ctx.strokeStyle = s.color;
            ctx.lineWidth = s.size * fx;
            ctx.beginPath();
            s.points.forEach((p, i) => (i ? ctx.lineTo(p.x * fx, p.y * fy) : ctx.moveTo(p.x * fx, p.y * fy)));
            ctx.stroke();
          }
        }
        // stickers
        const stageW = stageRef.current?.clientWidth || 300;
        const f = COMPW / stageW;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        for (const s of stickers) {
          const cx = (s.x / 100) * COMPW,
            cy = (s.y / 100) * COMPH;
          if (s.type === "emoji") {
            ctx.font = `${40 * s.scale * f}px sans-serif`;
            ctx.fillStyle = "#fff";
            ctx.fillText(s.content, cx, cy);
          } else if (s.type === "text") {
            ctx.font = `800 ${22 * s.scale * f}px sans-serif`;
            ctx.fillStyle = "#fff";
            ctx.shadowColor = "rgba(0,0,0,.55)";
            ctx.shadowBlur = 6 * f;
            ctx.fillText(s.content, cx, cy);
            ctx.shadowBlur = 0;
          } else {
            // pill (time / weather / voice): glass chip, white text (홈 글래스 느낌)
            const fs = 15 * s.scale * f;
            ctx.font = `700 ${fs}px sans-serif`;
            const padX = 13 * s.scale * f,
              padY = 7 * s.scale * f;
            const tw = ctx.measureText(s.content).width;
            const pw = tw + padX * 2,
              ph = fs + padY * 2,
              r = ph / 2;
            // 반투명 글래스 칩 + 흰 테두리 (캔버스라 실제 블러는 불가 → 반투명으로 근사)
            ctx.fillStyle = "rgba(255,255,255,.18)";
            roundRect(ctx, cx - pw / 2, cy - ph / 2, pw, ph, r);
            ctx.fill();
            ctx.lineWidth = 1.5 * f;
            ctx.strokeStyle = "rgba(255,255,255,.45)";
            roundRect(ctx, cx - pw / 2, cy - ph / 2, pw, ph, r);
            ctx.stroke();
            ctx.fillStyle = "#fff";
            ctx.shadowColor = "rgba(0,0,0,.45)";
            ctx.shadowBlur = 4 * f;
            ctx.fillText(s.content, cx, cy + 1);
            ctx.shadowBlur = 0;
          }
        }
        return out.toDataURL("image/jpeg", 0.9);
      },
    }),
    [stickers, src],
  );

  const pickTool = (t: Tool) => {
    setSelectedId(null);
    if (t === "voice") {
      if (recording) stopRecording();
      else if (audioUrl) setTool((cur) => (cur === "voice" ? "none" : "voice"));
      else startRecording();
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

      {recording && (
        <div className="voice-bar">
          <span className="rec-dot" /> 녹음 중 {fmtDur(recSec)}
          <button className="vb-stop" onClick={stopRecording}>
            ■ 멈춤
          </button>
        </div>
      )}
      {!recording && audioUrl && (
        <div className="voice-bar">
          <audio src={audioUrl} controls />
          <button onClick={reRecord}>↻ 다시 녹음</button>
          <button onClick={deleteVoice}>삭제</button>
        </div>
      )}

      {/* tools */}
      <div className="ul-tools">
        {/* eslint-disable @next/next/no-img-element */}
        <div className={"tg" + (tool === "emoji" ? " on" : "")} onClick={() => pickTool("emoji")}>
          <img className="ic" src="/assets/icons/heart.png" alt="" />
          <span className="tx">이모지</span>
        </div>
        <div className={"tg" + (tool === "draw" ? " on" : "")} onClick={() => pickTool("draw")}>
          <img className="ic" src="/assets/icons/write.png" alt="" />
          <span className="tx">그림</span>
        </div>
        <div className={"tg" + (tool === "text" ? " on" : "")} onClick={() => pickTool("text")}>
          <img className="ic" src="/assets/icons/text.png" alt="" />
          <span className="tx">텍스트</span>
        </div>
        <div
          className={"tg" + (recording ? " rec" : "") + (tool === "voice" ? " on" : "")}
          onClick={() => pickTool("voice")}
        >
          <img className="ic" src="/assets/icons/voice.png" alt="" />
          <span className="tx">{recording ? "멈춤" : audioUrl ? "음성✓" : "음성"}</span>
        </div>
        {/* eslint-enable @next/next/no-img-element */}
      </div>
    </div>
  );
});

export default PhotoEditor;
