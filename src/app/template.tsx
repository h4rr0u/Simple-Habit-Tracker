"use client";

import { motion, useReducedMotion } from "framer-motion";

import { PAGE_TRANSITION } from "@/lib/motion";

/**
 * Route-level entrance: Next.js remounts a template on every navigation, so
 * each page fades in with a small rise. The layout (sidebar, providers) stays
 * mounted outside it. Motion is skipped entirely for reduced-motion users.
 */
export default function Template({ children }: { children: React.ReactNode }) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion ? { duration: 0 } : PAGE_TRANSITION}
    >
      {children}
    </motion.div>
  );
}
