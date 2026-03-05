"use client";

import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { SkillBadge, type SkillCategory } from "./skill-badge";

export interface AgentSkill {
  label: string;
  category: SkillCategory;
  isNew?: boolean;
}

export interface AgentCardProps {
  /** Unique agent id or slug used for routing */
  id: string;
  /** Display name */
  name: string;
  /** Avatar image URL */
  avatar: string;
  /** Short personality tagline */
  tagline?: string;
  /** P&L in USD (positive = profit, negative = loss) */
  pnl?: number;
  /** P&L as percentage */
  pnlPercent?: number;
  /** Active skills */
  skills?: AgentSkill[];
  /** Handler / creator display name */
  handler?: string;
  /** Optional classname override */
  className?: string;
}

function formatPnl(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toFixed(2);
}

export function AgentCard({
  id,
  name,
  avatar,
  tagline,
  pnl,
  pnlPercent,
  skills = [],
  handler,
  className,
}: AgentCardProps) {
  const isProfitable = (pnl ?? 0) >= 0;

  return (
    <Link
      href={`/agent/${id}`}
      className={cn("group block", className)}
    >
      <div
        className={cn(
          "relative flex flex-col gap-4 rounded-xl border border-white/[0.06] bg-[#111111] p-4",
          "transition-all duration-300 ease-out",
          "hover:-translate-y-1 hover:border-[#E8762D]/30 hover:shadow-[0_8px_30px_rgba(255,45,120,0.12)]"
        )}
      >
        {/* Top row: Avatar + Name + P&L */}
        <div className="flex items-start gap-3">
          {/* Avatar with pink glow ring */}
          <div className="relative shrink-0">
            <div className="absolute -inset-[2px] rounded-full bg-gradient-to-br from-[#E8762D] to-[#E8762D]/40 opacity-60 blur-[1px] group-hover:opacity-100 transition-opacity" />
            <div className="relative size-12 rounded-full overflow-hidden ring-2 ring-[#E8762D]/50 group-hover:ring-[#E8762D] transition-all">
              <Image
                src={avatar}
                alt={name}
                fill
                className="object-cover"
                unoptimized
              />
            </div>
          </div>

          {/* Name + Tagline */}
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white truncate group-hover:text-[#E8762D] transition-colors">
              {name}
            </h3>
            {tagline && (
              <p className="text-xs text-zinc-500 truncate mt-0.5">{tagline}</p>
            )}
          </div>

          {/* P&L */}
          {pnl !== undefined && (
            <div className="shrink-0 text-right">
              <span
                className={cn(
                  "text-sm font-mono font-semibold",
                  isProfitable ? "text-emerald-400" : "text-red-400"
                )}
              >
                {isProfitable ? "+" : ""}${formatPnl(pnl)}
              </span>
              {pnlPercent !== undefined && (
                <p
                  className={cn(
                    "text-[11px] font-mono",
                    isProfitable ? "text-emerald-400/70" : "text-red-400/70"
                  )}
                >
                  {isProfitable ? "+" : ""}
                  {pnlPercent.toFixed(1)}%
                </p>
              )}
            </div>
          )}
        </div>

        {/* Skills row */}
        {skills.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {skills.map((skill) => (
              <SkillBadge
                key={skill.label}
                label={skill.label}
                category={skill.category}
                {...(skill.isNew !== undefined ? { isNew: skill.isNew } : {})}
              />
            ))}
          </div>
        )}

        {/* Handler */}
        {handler && (
          <div className="flex items-center gap-1 pt-1 border-t border-white/[0.04]">
            <span className="text-[10px] text-zinc-600 uppercase tracking-wider">
              Handler
            </span>
            <span className="text-[11px] text-zinc-500 truncate">{handler}</span>
          </div>
        )}
      </div>
    </Link>
  );
}
