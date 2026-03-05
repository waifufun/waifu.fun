"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { cn } from "@/lib/utils";

interface StatItem {
  label: string;
  value: number;
  prefix?: string;
  suffix?: string;
  /** Format large numbers as K/M/B */
  compact?: boolean;
}

interface StatsDisplayProps {
  stats: StatItem[];
  className?: string;
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function AnimatedNumber({
  value,
  prefix = "",
  suffix = "",
  compact = false,
  inView,
}: StatItem & { inView: boolean }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    if (!inView) return;

    let raf: number;
    const duration = 1600; // ms
    const start = performance.now();
    const from = 0;

    const step = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.floor(from + (value - from) * eased));
      if (progress < 1) raf = requestAnimationFrame(step);
    };

    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, inView]);

  const formatted = compact ? formatCompact(display) : display.toLocaleString();

  return (
    <span className="font-mono text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white tabular-nums">
      {prefix}
      {formatted}
      {suffix}
    </span>
  );
}

export function StatsDisplay({ stats, className }: StatsDisplayProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  const handleIntersection = useCallback(
    (entries: IntersectionObserverEntry[]) => {
      if (entries[0]?.isIntersecting) setInView(true);
    },
    []
  );

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(handleIntersection, {
      threshold: 0.2,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersection]);

  return (
    <div
      ref={ref}
      className={cn(
        "grid grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8",
        className
      )}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="flex flex-col items-center gap-1 text-center"
        >
          <AnimatedNumber {...stat} inView={inView} />
          <span className="text-xs sm:text-sm uppercase tracking-widest text-zinc-500 font-medium">
            {stat.label}
          </span>
        </div>
      ))}
    </div>
  );
}
