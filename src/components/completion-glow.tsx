"use client";

import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "@/lib/utils";

/**
 * One-shot success glow played when a habit flips from "not done" to "done".
 *
 * The colour comes from the semantic `--success` token (never a hardcoded
 * emerald), so it stays a "done" signal in every accent theme.
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
        boxShadow: [
          "0 0 0 2px color-mix(in oklch, var(--success) 55%, transparent)",
          "0 0 24px color-mix(in oklch, var(--success) 35%, transparent)",
        ].join(", "),
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
