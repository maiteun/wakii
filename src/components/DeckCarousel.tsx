"use client";

import { useCallback, useEffect, useRef } from "react";
import "./DeckCarousel.css";

// 인덱스당 이동량(카드 너비 대비 %). 양옆 카드가 ~1/3 보이도록 튜닝.
const STEP_PCT = 88;
const SIDE_SCALE = 0.72;
// 한 장 넘기는 데 필요한 드래그 거리(카드 너비 대비). 작을수록 살짝만 밀어도 넘어감.
const DRAG_UNIT = 0.45;

type Item = { image: string; text?: string };

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

  const clamp = (v: number) => Math.max(0, Math.min(items.length - 1, v));

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

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (Math.abs(dx) > 4) movedRef.current = true;
    rootRef.current?.classList.add("dragging");
    const pos = clamp(active - dx / d.pxPerDelta);
    posRef.current = pos;
    rootRef.current?.style.setProperty("--pos", String(pos));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, items.length]);

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
            <img src={it.image} alt={it.text || ""} draggable={false} />
          </div>
        );
      })}
    </div>
  );
}
