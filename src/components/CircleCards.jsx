"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import "./CircleCards.css";

// 완주 리캡용 3D 원형 카드 캐러셀.
// - 카드들이 원 둘레에 배치돼 Y축 기준으로 아주 천천히 자동 회전한다.
// - 좌우로 드래그(스와이프)하거나 스크롤(휠)하면 손으로도 돌릴 수 있다(잠시 뒤 자동회전 재개).
// - 카드를 탭하면 회전이 멈추고, 그 카드가 정면으로 와서 크게 보인다.
// - 배경(스크림)이나 카드를 다시 탭하면 다시 천천히 돌기 시작한다.
//
// 참고: https://web-motion-catalog.com/samples/circlecards/ (원주 축소 + 느린 자동회전
// + 수동 드래그/스크롤 + 탭하면 멈춤/포커스로 변형)

const wrapSigned = (deg) => {
  const a = (((deg + 180) % 360) + 360) % 360;
  return a - 180;
};

/**
 * @param {{ images?: {src: string, alt?: string, name?: string, avatar?: string, emojis?: string[]}[], center?: string, centerSize?: number, maxCards?: number, cardWidth?: number, cardHeight?: number, perspective?: number, speed?: number }} props
 */
export default function CircleCards({
  images = /** @type {{src: string, alt?: string, name?: string, avatar?: string, emojis?: string[]}[]} */ ([]),
  center = "", // 링 한가운데(회전 축)에 고정으로 뜨는 완주 랜드마크 이미지
  centerSize = 260,
  maxCards = 12,
  cardWidth = 108,
  cardHeight = 144,
  perspective = 720,
  speed = 5, // deg/sec — 아주 천천히 (한 바퀴 ≈ 72초)
}) {
  const pool = useMemo(() => images.filter((i) => i && i.src).slice(0, maxCards), [images, maxCards]);
  const count = pool.length;
  const step = count > 0 ? 360 / count : 0;

  // 원주 반지름: 카드가 서로 겹치지 않을 만큼만. (원본 450px → 크게 축소)
  const radius = useMemo(() => {
    if (count <= 1) return 0;
    const noOverlap = cardWidth / (2 * Math.sin(Math.PI / count)) * 1.12;
    return Math.max(132, Math.round(noOverlap));
  }, [count, cardWidth]);

  const ringRef = useRef(null);
  const baseRef = useRef(0); // 누적 회전각(연속값)
  const pausedRef = useRef(false); // 자동회전 일시정지(포커스/드래그 중)
  const rafRef = useRef(0);
  const lastTsRef = useRef(0);

  // 수동 드래그/스크롤
  const draggingRef = useRef(false);
  const movedRef = useRef(false);
  const startXRef = useRef(0);
  const startBaseRef = useRef(0);
  const resumeTimerRef = useRef(0);
  const activeIndexRef = useRef(null);

  const [activeIndex, setActiveIndex] = useState(null);
  useEffect(() => {
    activeIndexRef.current = activeIndex;
  }, [activeIndex]);

  const applyRing = useCallback((deg) => {
    const el = ringRef.current;
    if (el) el.style.transform = `translateZ(${-radius}px) rotateY(${deg}deg)`;
  }, [radius]);

  // 자동 회전 루프
  useEffect(() => {
    if (count === 0) return;
    lastTsRef.current = 0;
    const stepFrame = (ts) => {
      if (!lastTsRef.current) lastTsRef.current = ts;
      const dt = ts - lastTsRef.current;
      lastTsRef.current = ts;
      if (!pausedRef.current) {
        const el = ringRef.current;
        if (el && el.style.transition && el.style.transition !== "none") el.style.transition = "none";
        baseRef.current += (speed * dt) / 1000;
        applyRing(baseRef.current);
      }
      rafRef.current = requestAnimationFrame(stepFrame);
    };
    rafRef.current = requestAnimationFrame(stepFrame);
    return () => cancelAnimationFrame(rafRef.current);
  }, [count, speed, applyRing]);

  useEffect(() => {
    applyRing(baseRef.current);
  }, [applyRing]);

  const focusCard = useCallback(
    (i) => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      pausedRef.current = true;
      const cardAngle = i * step;
      // 정면(net 0)으로 오도록: base + cardAngle ≡ 0 → base = -cardAngle. 현재 위치에서 최단 경로로.
      const target = baseRef.current + wrapSigned(-cardAngle - baseRef.current);
      const el = ringRef.current;
      if (el) {
        el.style.transition = "transform 0.8s cubic-bezier(0.25,1,0.5,1)";
        applyRing(target);
      }
      baseRef.current = target;
      setActiveIndex(i);
    },
    [step, applyRing],
  );

  const resume = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    setActiveIndex(null);
    pausedRef.current = false;
    lastTsRef.current = 0;
    const el = ringRef.current;
    if (el) el.style.transition = "none";
  }, []);

  // ── 수동 드래그/스크롤로도 돌릴 수 있게 (자동회전과 병행) ──────────────
  const beginManual = useCallback(() => {
    pausedRef.current = true;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    const el = ringRef.current;
    if (el) el.style.transition = "none";
  }, []);

  const endManual = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    // 손을 뗀 뒤 잠시 있다가 자동회전 재개 (포커스 중이면 재개 안 함)
    resumeTimerRef.current = window.setTimeout(() => {
      if (activeIndexRef.current === null) {
        lastTsRef.current = 0;
        pausedRef.current = false;
      }
    }, 1600);
  }, []);

  const onPointerMove = useCallback(
    (e) => {
      if (!draggingRef.current) return;
      const dx = e.clientX - startXRef.current;
      if (Math.abs(dx) > 4) movedRef.current = true;
      baseRef.current = startBaseRef.current + dx * 0.45; // 0.45deg/px
      applyRing(baseRef.current);
    },
    [applyRing],
  );

  const onPointerUp = useCallback(() => {
    if (!draggingRef.current) return;
    draggingRef.current = false;
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
    endManual();
  }, [onPointerMove, endManual]);

  const onPointerDown = useCallback(
    (e) => {
      if (activeIndexRef.current !== null) return; // 포커스 중엔 드래그 안 함
      draggingRef.current = true;
      movedRef.current = false;
      startXRef.current = e.clientX;
      startBaseRef.current = baseRef.current;
      beginManual();
      window.addEventListener("pointermove", onPointerMove);
      window.addEventListener("pointerup", onPointerUp);
    },
    [beginManual, onPointerMove, onPointerUp],
  );

  const onWheel = useCallback(
    (e) => {
      if (activeIndexRef.current !== null) return;
      beginManual();
      baseRef.current += (e.deltaY + e.deltaX) * 0.15;
      applyRing(baseRef.current);
      endManual();
    },
    [applyRing, beginManual, endManual],
  );

  useEffect(
    () => () => {
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    },
    [onPointerMove, onPointerUp],
  );

  if (count === 0) return null;

  return (
    <div
      className={"cc-root" + (activeIndex !== null ? " cc-focused" : "")}
      style={{ perspective: `${perspective}px` }}
      onPointerDown={onPointerDown}
      onWheel={onWheel}
    >
      {activeIndex !== null && <div className="cc-scrim" onClick={resume} />}
      <div className="cc-stage">
        {center && (
          <div
            className={"cc-center" + (activeIndex !== null ? " cc-center--dim" : "")}
            style={{
              width: `${centerSize}px`,
              height: `${centerSize}px`,
              marginLeft: `${-centerSize / 2}px`,
              marginTop: `${-centerSize / 2}px`,
              transform: `translateZ(${-radius}px)`,
            }}
          >
            <img src={center} alt="" draggable={false} />
          </div>
        )}
        <div ref={ringRef} className="cc-ring">
          {pool.map((img, i) => {
            const angle = i * step;
            const isActive = i === activeIndex;
            return (
              <div
                key={img.src + i}
                className={"cc-card" + (isActive ? " cc-active" : "")}
                style={{
                  width: `${cardWidth}px`,
                  height: `${cardHeight}px`,
                  marginLeft: `${-cardWidth / 2}px`,
                  marginTop: `${-cardHeight / 2}px`,
                  transform: `rotateY(${angle}deg) translateZ(${radius}px)`,
                }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (movedRef.current) {
                    movedRef.current = false;
                    return; // 드래그였으면 포커스하지 않음
                  }
                  if (isActive) resume();
                  else focusCard(i);
                }}
              >
                {img.name && (
                  <div className="cc-tag">
                    <span className="cc-ava">
                      {img.avatar ? <img src={img.avatar} alt="" draggable={false} /> : img.name.slice(0, 1)}
                    </span>
                    <span className="cc-name">{img.name}</span>
                  </div>
                )}
                <div className="cc-face cc-front">
                  <img src={img.src} alt={img.alt || ""} draggable={false} />
                </div>
                <div className="cc-face cc-back">
                  <img src={img.src} alt="" draggable={false} />
                </div>
                {/* 돌아가는 와중에도 보이는 반응 이모지 (카드 아래) */}
                {img.emojis && img.emojis.length > 0 && (
                  <div className="cc-react">
                    {img.emojis.slice(0, 6).map((e, k) => (
                      <span key={k}>{e}</span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* 포커스한 카드의 반응 — 크게 (탭했을 때) */}
      {activeIndex !== null && pool[activeIndex]?.emojis?.length > 0 && (
        <div className="cc-focus-react">
          {pool[activeIndex].emojis.map((e, k) => (
            <span key={k}>{e}</span>
          ))}
        </div>
      )}
    </div>
  );
}
