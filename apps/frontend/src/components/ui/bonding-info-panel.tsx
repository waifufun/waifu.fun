"use client"

import { Label } from "@/components/ui/label"
import Image from "next/image"
import { Globe, Send, MessageCircle, Info, Copy, ExternalLink, Twitter } from "lucide-react"
import { cn } from "@/lib/utils"
import { useAnimation } from "@/providers/animation-provider"
import { SocialLinkButton } from "@/components/ui/social-link-button"

export const AnimatedPixelProgressBar = ({
  progress = 0,
  heightClass = "h-3",
  barColorClass = "bg-[#03FF24]", // Default to green
  blockAnimationClass = "flashy-bonding-block", // Default to green animation
  borderColorClass = "border-[#03FF24]/30", // Default to green
}: {
  progress?: number
  heightClass?: string
  barColorClass?: string
  blockAnimationClass?: string
  borderColorClass?: string
}) => {
  const { animationLevel } = useAnimation()
  const totalBlocks = 20
  const filledBlocks = Math.max(0, Math.min(totalBlocks, Math.round((progress / 100) * totalBlocks)))

  const areBlockAnimationsActive = animationLevel >= 1

  return (
    <div
      className={cn(
        "grid grid-cols-[repeat(20,minmax(0,1fr))] gap-px w-full border bg-black/50 p-0.5 rounded-none shadow-inner", // Corrected grid-cols-20
        borderColorClass,
        heightClass,
      )}
    >
      {Array.from({ length: totalBlocks }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "h-full relative overflow-hidden",
            i < filledBlocks
              ? areBlockAnimationsActive
                ? blockAnimationClass // Use prop for animation class
                : barColorClass // Use prop for bar color
              : "bg-gray-700/50",
          )}
          style={areBlockAnimationsActive ? { animationDelay: `${i * 0.07}s` } : {}}
        />
      ))}
    </div>
  )
}

interface BondingInfoPanelProps {
  tokenName: string
  tokenTicker: string
  description: string
  avatarUrl?: string
  socials: { website?: string; x?: string; telegram?: string; discord?: string }
  pairAddressShort: string
  tokenAddressShort: string
  bondingCurveProgress: number
  solInBondingCurve: number
}

export function BondingInfoPanel({
  tokenName,
  tokenTicker,
  description,
  avatarUrl,
  socials,
  pairAddressShort,
  tokenAddressShort,
  bondingCurveProgress,
  solInBondingCurve,
}: BondingInfoPanelProps) {
  const { animationLevel } = useAnimation()
  const arePanelAnimationsActive = animationLevel === 2
  const areSubtleAnimationsActive = animationLevel >= 1

  return (
    <div
      className={cn(
        "bg-black/30 p-4 rounded-none space-y-4 border-2 border-[#03FF24]/40",
        arePanelAnimationsActive && "animate-green-glow-pulse",
      )}
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-bold text-gray-200 uppercase tracking-wider">
            Bonding Curve Progress: <span className="text-[#03FF24]">{bondingCurveProgress}%</span>
          </h3>
          <Info size={14} className="text-[#03FF24]/70 cursor-pointer hover:text-[#03FF24]" />
        </div>
        <AnimatedPixelProgressBar progress={bondingCurveProgress} heightClass="h-4" />
        <p className="text-xs text-gray-400 mt-1">
          There is <span className="text-[#03FF24] font-semibold">{solInBondingCurve} SOL</span> in the bonding curve.
        </p>
      </div>

      <div className={cn("border-t-2 border-[#03FF24]/30 pt-3 space-y-2")}>
        <div className="flex items-start gap-3">
          <Image
            src={avatarUrl || "/placeholder.svg?width=60&height=60&query=pixel+art+token+icon+neon"}
            alt={`${tokenName} Avatar`}
            width={50}
            height={50}
            className="border-2 border-[#03FF24]/50 rounded-none shadow-[2px_2px_0px_rgba(3,255,36,0.25)] pixelated-image-render mt-1 flex-shrink-0"
          />
          <div>
            <h4
              className={cn(
                "text-base font-bold text-[#03FF24] uppercase",
                areSubtleAnimationsActive && "animate-text-flicker",
              )}
            >
              {tokenName} <span className="text-sm text-gray-300 font-mono">{tokenTicker}</span>
            </h4>
            <p className="text-xs text-gray-400 leading-relaxed">{description}</p>
          </div>
        </div>
        <div className="flex gap-2 pt-1">
          {socials.website && (
            <SocialLinkButton href={socials.website} aria-label="Website">
              <Globe size={14} />
            </SocialLinkButton>
          )}
          {socials.x && (
            <SocialLinkButton href={socials.x} aria-label="X/Twitter">
              <Twitter size={14} />
            </SocialLinkButton>
          )}
          {socials.telegram && (
            <SocialLinkButton href={socials.telegram} aria-label="Telegram">
              <Send size={14} style={{ transform: "rotate(45deg) translateY(-1px) translateX(1px)" }} />
            </SocialLinkButton>
          )}
          {socials.discord && (
            <SocialLinkButton href={socials.discord} aria-label="Discord">
              <MessageCircle size={14} />
            </SocialLinkButton>
          )}
        </div>
      </div>

      <div className={cn("border-t-2 border-[#03FF24]/30 pt-3 space-y-1 text-xs")}>
        <Label className="text-gray-400 uppercase tracking-wider">Pair:</Label>
        <div className="flex items-center justify-between bg-black/40 p-1.5 border border-[#03FF24]/30 rounded-none shadow-[1px_1px_0px_rgba(3,255,36,0.2)]">
          <span className="text-gray-300 font-mono truncate" title={pairAddressShort}>
            {pairAddressShort}
          </span>
          <div className="flex gap-1 flex-shrink-0">
            <Copy
              size={12}
              className="text-[#03FF24]/70 hover:text-[#03FF24] cursor-pointer"
              onClick={() => navigator.clipboard.writeText(pairAddressShort)}
            />
            <ExternalLink size={12} className="text-[#03FF24]/70 hover:text-[#03FF24] cursor-pointer" />
          </div>
        </div>
        <Label className="text-gray-400 uppercase tracking-wider pt-1 block">Token:</Label>
        <div className="flex items-center justify-between bg-black/40 p-1.5 border border-[#03FF24]/30 rounded-none shadow-[1px_1px_0px_rgba(3,255,36,0.2)]">
          <span className="text-gray-300 font-mono truncate" title={tokenAddressShort}>
            {tokenAddressShort}
          </span>
          <div className="flex gap-1 flex-shrink-0">
            <Copy
              size={12}
              className="text-[#03FF24]/70 hover:text-[#03FF24] cursor-pointer"
              onClick={() => navigator.clipboard.writeText(tokenAddressShort)}
            />
            <ExternalLink size={12} className="text-[#03FF24]/70 hover:text-[#03FF24] cursor-pointer" />
          </div>
        </div>
      </div>
    </div>
  )
}
