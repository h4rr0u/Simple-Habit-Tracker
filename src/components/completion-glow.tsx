"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * One-shot emerald glow played when a habit flips from "not done" to "done".
 *
 * Mount it inside a `relative` container. It stays out of the way (renders
 * nothing) until the transition happens, so completed habits do not pulse on
 * first paint. Users with `prefers-reduced-motion` never see the effect.
 */

interface CompletionGlowProps {
  /** Current completion state; only a false → true transition animates. */
  active: boolean;
  /** Extra classes for the overlay (usually the container's border radius). */
  className?: string;
}

export function CompletionGlow({ active, className }: CompletionGlowProps) {
  const reduceMotion = useReducedMotion();
  const [celebrating, setCelebrating] = useState(false);
  const wasActive = useRef(active);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (active && !wasActive.current && !reduceMotion) {
      if (mounted.current) {
        setCelebrating(true);
      }
    }
    wasActive.current = active;
  }, [active, reduceMotion]);

  if (!celebrating) return null;

  return (
    <motion.span
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute inset-0 rounded-xl",
        className
      )}
      style={{
        boxShadow:
          "0 0 0 2px rgb(52 211 153 / 0.55), 0 0 24px rgb(52 211 153 / 0.35)",
      }}
      initial={{ opacity: 0, scale: 0.99 }}
      animate={{ opacity: [0, 0.9, 0], scale: [0.99, 1.01, 1.02] }}
      transition={{ duration: 0.8, times: [0, 0.25, 1], ease: "easeOut" }}
      onAnimationComplete={() => {
        if (mounted.current) {
          setCelebrating(false);
        }
      }}
    />
  );
}
