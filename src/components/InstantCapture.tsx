"use client";

import { useEffect, useRef, useState } from "react";

/* ===================================================================
   InstantCapture — quick, non-editable 3:4 photo reaction. Opens the
   live camera; the shutter composites the chosen emoji onto the frame
   and hands the data URL back (no editor). Falls back to the OS camera
   / file picker when a live stream isn't available.
   =================================================================== */

export default function InstantCapture({
  emoji,
  onSend,
  onClose,
}: {
  emoji: string;
  onSend: (dataUrl: string) => void;
  onClose: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [active, setActive] = useState(false);

  const stop = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" }, audio: false });
        if (cancelled) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = s;
        if (videoRef.current) {
          videoRef.current.srcObject = s;
          await videoRef.current.play().catch(() => {});
        }
        setActive(true);
      } catch {
        setActive(false);
      }
    })();
    return () => {
      cancelled = true;
      stop();
    };
  }, []);

  // centre-crop the source to a SQUARE (shown as a circle); the emoji is
  // added as a top-right badge on the bubble, not baked in.
  const compose = (source: CanvasImageSource, sw: number, sh: number): string => {
    const S = 600;
    const c = document.createElement("canvas");
    c.width = S;
    c.height = S;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    const side = Math.min(sw, sh);
    const sx = (sw - side) / 2,
      sy = (sh - side) / 2;
    ctx.drawImage(source, sx, sy, side, side, 0, 0, S, S);
    return c.toDataURL("image/jpeg", 0.9);
  };

  const shoot = () => {
    const v = videoRef.current;
    if (active && v && v.videoWidth) {
      const url = compose(v, v.videoWidth, v.videoHeight);
      stop();
      onSend(url);
    } else {
      fileRef.current?.click();
    }
  };

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    const img = new Image();
    img.onload = () => onSend(compose(img, img.naturalWidth, img.naturalHeight));
    img.src = URL.createObjectURL(f);
  };

  return (
    <div className="instant">
      <div className="instant-top">
        <span className="instant-x" onClick={onClose}>
          ✕
        </span>
        <span className="instant-ttl">{emoji} 즉석 반응</span>
        <span style={{ width: 18 }} />
      </div>
      <div className="instant-stage">
        <div className="instant-vf">
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
              display: active ? "block" : "none",
            }}
          />
          {emoji && <div className="instant-emoji">{emoji}</div>}
          <div className="ratio">3:4</div>
        </div>
        <div className="instant-shutter" onClick={shoot} />
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onFile} />
    </div>
  );
}
