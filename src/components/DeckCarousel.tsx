"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import "./DeckCarousel.css";

// 인덱스당 이동량(카드 너비 대비 %). 양옆 카드가 ~1/3 보이도록 튜닝.
const STEP_PCT = 88;
const SIDE_SCALE = 0.72;
// 한 장 넘기는 데 필요한 드래그 거리(카드 너비 대비). 작을수록 살짝만 밀어도 넘어감.
const DRAG_UNIT = 0.45;
// 답장 인셋 크기(카드 너비 대비 %) — 기존 40%의 0.7배
const INSET_PCT = 28;
const INSET_MAX = 100 - INSET_PCT; // 위치 clamp 상한

type Item = { image: string; text?: string; reply?: string };

export default function DeckCarousel({
  items,
  active,
  onActive,
}: {
  items: Item[];
  active: number;
  onActive: (i: number) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const posRef = useRef(active); // 현재 위치(드래그 중엔 소수)
  const dragRef = useRef<{ startX: number; pxPerDelta: number } | null>(null);
  const movedRef = useRef(false); // 드래그 여부(클릭이 pointerup 뒤에 오므로 별도 유지)

  // 답장 인셋의 카드별 위치(%) — 기본은 좌하단
  const [insetPos, setInsetPos] = useState<Record<number, { lx: number; ty: number }>>({});
  const insetDrag = useRef<
    | { i: number; startX: number; startY: number; startLx: number; startTy: number; cardW: number; cardH: number }
    | null
  >(null);

  const clamp = (v: number) => Math.max(0, Math.min(items.length - 1, v));
  const clampPct = (v: number) => Math.max(0, Math.min(INSET_MAX, v));
  const posOf = (i: number) => insetPos[i] || { lx: 3, ty: INSET_MAX - 3 };

  // active(부모 상태)가 바뀌면 위치 동기화
  useEffect(() => {
    posRef.current = active;
    rootRef.current?.style.setProperty("--pos", String(active));
  }, [active]);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (items.length <= 1) return;
      const card = rootRef.current?.querySelector<HTMLElement>(".dcz-card");
      const cardW = card?.offsetWidth || (rootRef.current?.clientWidth || 300) * 0.5;
      dragRef.current = { startX: e.clientX, pxPerDelta: DRAG_UNIT * cardW };
      movedRef.current = false;
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [items.length],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const dx = e.clientX - d.startX;
      if (Math.abs(dx) > 4) movedRef.current = true;
      rootRef.current?.classList.add("dragging");
      const pos = clamp(active - dx / d.pxPerDelta);
      posRef.current = pos;
      rootRef.current?.style.setProperty("--pos", String(pos));
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [active, items.length],
  );

  const endDrag = useCallback(() => {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    rootRef.current?.classList.remove("dragging");
    const target = clamp(Math.round(posRef.current));
    posRef.current = target;
    rootRef.current?.style.setProperty("--pos", String(target));
    if (target !== active) onActive(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, items.length, onActive]);

  // ── 답장 인셋 드래그(카드 안에서 자유 이동). 캐러셀 스와이프와 분리(stopPropagation) ──
  const onInsetDown = (e: React.PointerEvent, i: number) => {
    e.stopPropagation();
    const card = (e.currentTarget as HTMLElement).closest<HTMLElement>(".dcz-card");
    const cardW = card?.offsetWidth || 1;
    const cardH = card?.offsetHeight || 1;
    const p = posOf(i);
    insetDrag.current = { i, startX: e.clientX, startY: e.clientY, startLx: p.lx, startTy: p.ty, cardW, cardH };
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onInsetMove = (e: React.PointerEvent) => {
    const d = insetDrag.current;
    if (!d) return;
    e.stopPropagation();
    const lx = clampPct(d.startLx + ((e.clientX - d.startX) / d.cardW) * 100);
    const ty = clampPct(d.startTy + ((e.clientY - d.startY) / d.cardH) * 100);
    setInsetPos((m) => ({ ...m, [d.i]: { lx, ty } }));
  };
  const onInsetUp = (e: React.PointerEvent) => {
    if (!insetDrag.current) return;
    e.stopPropagation();
    insetDrag.current = null;
  };

  return (
    <div
      ref={rootRef}
      className="dcz"
      style={{ ["--pos" as string]: active }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    >
      {items.map((it, i) => {
        const delta = i - active;
        const ad = Math.abs(delta);
        const scale = i === active ? 1 : SIDE_SCALE;
        const opacity = ad >= 2 ? 0 : 1;
        const p = posOf(i);
        return (
          <div
            key={i}
            className="dcz-card"
            style={{
              ["--i" as string]: i,
              transform: `translate(calc(-50% + (var(--i) - var(--pos)) * ${STEP_PCT}%), -50%) scale(${scale})`,
              zIndex: 100 - ad,
              opacity,
              pointerEvents: ad >= 2 ? "none" : "auto",
            }}
            onClick={() => {
              // 옆 카드를 탭하면 그 카드로 이동(드래그였으면 무시)
              if (movedRef.current) {
                movedRef.current = false;
                return;
              }
              if (i !== active) onActive(i);
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="dcz-photo" src={it.image} alt={it.text || ""} draggable={false} />
            {it.reply && (
              <div
                className="dcz-inset"
                style={{ left: p.lx + "%", top: p.ty + "%", pointerEvents: i === active ? "auto" : "none" }}
                onPointerDown={(e) => onInsetDown(e, i)}
                onPointerMove={onInsetMove}
                onPointerUp={onInsetUp}
                onPointerCancel={onInsetUp}
                onClick={(e) => e.stopPropagation()}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={it.reply} alt="" draggable={false} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
