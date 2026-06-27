"use client";

import { useEffect, useRef, useState } from "react";

/* ===================================================================
   InstantCapture — quick 3:4 photo reply. Opens the live camera, and on
   shutter composites the chosen emoji big onto the frame and hands the
   data URL back. Falls back to the OS camera / file picker when a live
   stream isn't available.
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

  // draw the (centre-cropped 3:4) source + the emoji, return a data URL
  const compose = (source: CanvasImageSource, sw: number, sh: number): string => {
    const W = 600,
      H = 800;
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const ctx = c.getContext("2d");
    if (!ctx) return "";
    const ratio = 3 / 4;
    let cw = sw,
      ch = sw / ratio;
    if (ch > sh) {
      ch = sh;
      cw = sh * ratio;
    }
    const sx = (sw - cw) / 2,
      sy = (sh - ch) / 2;
    ctx.drawImage(source, sx, sy, cw, ch, 0, 0, W, H);
    ctx.font = "260px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, W / 2, H / 2);
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
        <span className="instant-ttl">{emoji} 즉석 답장</span>
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
          <div className="instant-emoji">{emoji}</div>
          <div className="ratio">3:4</div>
        </div>
        <div className="instant-shutter" onClick={shoot} />
      </div>
      <input ref={fileRef} type="file" accept="image/*" capture="environment" style={{ display: "none" }} onChange={onFile} />
    </div>
  );
}
