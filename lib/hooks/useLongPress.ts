"use client";
import { useRef } from "react";

interface LongPressOptions {
  onLongPress: () => void;
  onClick?: () => void;
  /** Hold duration before onLongPress fires. */
  delay?: number;
  /** Pointer movement past this many px cancels the hold (treated as a scroll/drag, not a press). */
  moveTolerance?: number;
}

/**
 * Pointer handlers for "long-press this row for a shortcut, tap it for the
 * normal action." A completed long-press suppresses the click event a
 * pointerup naturally leaves behind, so onClick never double-fires.
 *
 *   const lp = useLongPress({ onLongPress: () => brewAgain(c), onClick: () => onPick(c) });
 *   <button {...lp}>...</button>
 */
export function useLongPress({ onLongPress, onClick, delay = 550, moveTolerance = 10 }: LongPressOptions) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firedLongPress = useRef(false);
  const origin = useRef<{ x: number; y: number } | null>(null);

  const clear = () => {
    if (timer.current) { clearTimeout(timer.current); timer.current = null; }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    firedLongPress.current = false;
    origin.current = { x: e.clientX, y: e.clientY };
    clear();
    timer.current = setTimeout(() => {
      firedLongPress.current = true;
      navigator.vibrate?.(10);
      onLongPress();
    }, delay);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!origin.current) return;
    const dx = e.clientX - origin.current.x;
    const dy = e.clientY - origin.current.y;
    if (Math.hypot(dx, dy) > moveTolerance) clear();
  };

  const onClickHandler = () => {
    // A long-press still leaves a trailing click on release — swallow that one.
    if (firedLongPress.current) { firedLongPress.current = false; return; }
    onClick?.();
  };

  return {
    onPointerDown,
    onPointerMove,
    onPointerUp: clear,
    onPointerLeave: clear,
    onPointerCancel: clear,
    onClick: onClickHandler,
  };
}
