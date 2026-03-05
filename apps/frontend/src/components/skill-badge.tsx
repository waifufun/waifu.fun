"use client";

import { cn } from "@/lib/utils";
import {
  TrendingUp,
  Palette,
  Wrench,
  MessageSquare,
  Brain,
  Sparkles,
  type LucideIcon,
} from "lucide-react";

export type SkillCategory = "trading" | "creative" | "utility" | "social" | "ai";

interface SkillBadgeProps {
  label: string;
  category?: SkillCategory;
  isNew?: boolean;
  className?: string;
}

const categoryConfig: Record<
  SkillCategory,
  { icon: LucideIcon; bg: string; text: string; border: string }
> = {
  trading: {
    icon: TrendingUp,
    bg: "bg-blue-500/10",
    text: "text-blue-400",
    border: "border-blue-500/20",
  },
  creative: {
    icon: Palette,
    bg: "bg-purple-500/10",
    text: "text-purple-400",
    border: "border-purple-500/20",
  },
  utility: {
    icon: Wrench,
    bg: "bg-zinc-500/10",
    text: "text-zinc-400",
    border: "border-zinc-500/20",
  },
  social: {
    icon: MessageSquare,
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    border: "border-emerald-500/20",
  },
  ai: {
    icon: Brain,
    bg: "bg-pink-500/10",
    text: "text-pink-400",
    border: "border-pink-500/20",
  },
};

export function SkillBadge({
  label,
  category = "utility",
  isNew = false,
  className,
}: SkillBadgeProps) {
  const config = categoryConfig[category];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors",
        config.bg,
        config.text,
        config.border,
        className
      )}
    >
      <Icon className="size-3 shrink-0" />
      <span>{label}</span>
      {isNew && (
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[#FF2D78] opacity-75" />
          <span className="relative inline-flex size-1.5 rounded-full bg-[#FF2D78]" />
        </span>
      )}
    </span>
  );
}
