"use client"

import Image from "next/image"
import Link from "next/link"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Timer, Spade, Club, Heart, DiamondIcon, Star, Hourglass, Zap, Archive, MousePointerClick } from "lucide-react"
import { motion, AnimatePresence, type Variants } from "framer-motion"
import { cn } from "@/lib/utils"
import { AnimatedPixelProgressBar } from "./bonding-info-panel"
import React, { useMemo } from "react"
import { useAnimation, type AnimationLevel } from "@/providers/animation-provider"

/**
 * Props for the TokenCard component.
 * Displays a token with its details in a card format.
 */
export interface TokenCardProps {
  /** Unique identifier for the token. */
  id: string
  /** Name of the token. */
  name: string
  /** Ticker symbol for the token (e.g., $PULSE). */
  ticker: string
  /** URL for the token's image. */
  imageUrl: string
  /** Market capitalization of the token. */
  marketCap: string
  /** Trading volume of the token. */
  volume: string // This prop exists in the previous definition but wasn't used in the card display. Consider adding it or removing if not needed.
  /** Age of the token (e.g., "1h", "7hrs"). */
  age: string
  /** Whether the token is featured. */
  isFeatured?: boolean
  /** Whether the token is in a "bonding soon" state. */
  isBondingSoon?: boolean
  /** Whether the token is newly listed. */
  isNew?: boolean
  /** Whether the token is a "quick hit" (special highlight). */
  isQuickHit?: boolean
  /** Current progress of the token's bonding curve or other goal (0-100). */
  progress?: number
  /** Card suit associated with the token, for VIP table styling. */
  suit?: "spade" | "club" | "heart" | "diamond"
  /** Custom text to display for bonding status (e.g., "IMPORT"). */
  bondingStatusText?: string
  /** Index of the card, used for priority loading or animation delays. */
  index?: number
  /** Whether the card is currently in a "spinning" state (for VIP table reel effect). */
  isSpinning?: boolean
  /** Duration of the spin animation in milliseconds. */
  spinDuration?: number
  /** Array of all VIP tokens, used for the spinning reel effect to pick random images/text. */
  allVipTokensForSpin?: Omit<
    TokenCardProps,
    "isSpinning" | "spinDuration" | "allVipTokensForSpin" | "isQuickHit" | "bondingStatusText" | "volume"
  >[]
}

const CARD_HEADER_HEIGHT_CLASS = "h-[200px]"
const CARD_FOOTER_HEIGHT_CLASS = "h-[72px]"
const TOTAL_CARD_HEIGHT_CLASS = "h-[400px]"

const SuitIcon: React.FC<{ suit?: TokenCardProps["suit"]; animationLevel: AnimationLevel }> = ({
  suit,
  animationLevel,
}) => {
  if (!suit) return null
  const iconColor = "text-[#03FF24]/90 group-hover:text-[#03FF24]"
  const iconFilter = "filter group-hover:drop-shadow-[0_0_2px_#03FF24]"
  const commonClasses = cn(
    `h-3.5 w-3.5 ${iconColor} ${iconFilter} transition-colors pixelated-icon`,
    animationLevel >= 1 && "animate-icon-float",
  )
  const icons = {
    spade: <Spade className={commonClasses} />,
    club: <Club className={commonClasses} />,
    heart: <Heart className={commonClasses} />,
    diamond: <DiamondIcon className={commonClasses} />,
  }
  return <span className="mr-1.5 mt-0.5">{icons[suit]}</span>
}

const SpinningReelContent: React.FC<{
  duration: number
  allVipTokens: Omit<
    TokenCardProps,
    "isSpinning" | "spinDuration" | "allVipTokensForSpin" | "isQuickHit" | "bondingStatusText"
  >[]
  animationLevel: AnimationLevel
}> = ({ duration, allVipTokens, animationLevel }) => {
  const reelTexts = useMemo(() => ["?????", "$$$$$", "LUCKY", "WINNER", "JACKPOT", "TOKEN!"], [])

  const imageReelStrip = useMemo(() => {
    if (!allVipTokens || allVipTokens.length === 0) return ["/placeholder-yzflt.png"]
    const stripLength = Math.max(5, allVipTokens.length)
    return Array.from({ length: stripLength }).map((_, i) => {
      return allVipTokens[i % allVipTokens.length].imageUrl
    })
  }, [allVipTokens])

  const reelAnimationProps =
    animationLevel >= 1
      ? {
          animate: { y: ["0%", `-${(imageReelStrip.length - 1) * 100}%`] },
          transition: {
            duration: Math.max(0.1, (duration / 1000) * (imageReelStrip.length / 5)),
            repeat: Number.POSITIVE_INFINITY,
            ease: "linear" as const,
          },
        }
      : {
          animate: { y: "0%" },
          transition: { duration: 0, repeat: 0 },
        }

  return (
    <>
      <CardHeader className={cn("p-0 relative overflow-hidden bg-black z-10 w-full", CARD_HEADER_HEIGHT_CLASS)}>
        <motion.div className="h-full w-full" {...reelAnimationProps}>
          {imageReelStrip.map((src, i) => (
            <Image
              key={i}
              src={src || `/placeholder.svg?width=400&height=200&query=spinning+reel+item`}
              alt={`Spinning reel image ${i + 1}`}
              width={400}
              height={200}
              className="w-full h-full object-cover pixelated-image-render opacity-70 blur-[1px]"
              priority={i < 2}
            />
          ))}
        </motion.div>
        <div className="absolute inset-0 bg-black/60 flex items-center justify-center pointer-events-none">
          <Zap
            className={cn(
              "h-10 w-10 sm:h-12 sm:w-12 text-[#03FF24] opacity-70",
              animationLevel === 2 && "animate-ping-slow",
            )}
          />
        </div>
      </CardHeader>
      <CardContent className="p-3 flex-grow relative z-10 bg-black flex flex-col justify-center">
        <h3
          className={cn(
            "font-bold truncate transition-colors flex items-center text-gray-50 uppercase text-center mx-auto text-lg",
          )}
        >
          {reelTexts[Math.floor(Math.random() * reelTexts.length)]}
        </h3>
        <p
          className={cn(
            "text-xs text-[#03FF24]/70 font-mono transition-colors ml-0.5 filter uppercase text-center mx-auto",
          )}
        >
          {reelTexts[Math.floor(Math.random() * reelTexts.length)].split("").reverse().join("")}
        </p>
        <div className="mt-3 space-y-1.5 text-xs text-gray-300 uppercase">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">MCAP:</span>
            <span className={cn("font-semibold text-sm text-[#03FF24] filter")}>
              {reelTexts[Math.floor(Math.random() * reelTexts.length)]}
            </span>
          </div>
        </div>
      </CardContent>
      <CardFooter className={cn("p-3 bg-black relative z-10 flex flex-col justify-between", CARD_FOOTER_HEIGHT_CLASS)}>
        <div /> {/* Spacer */}
        <div className="flex justify-start items-center w-full text-[11px] text-gray-400">
          <Timer className="h-3 w-3 text-[#03FF24]/80 pixelated-icon" />
          <span>SPINNING...</span>
        </div>
      </CardFooter>
    </>
  )
}

const TokenCardComponent: React.FC<TokenCardProps> = ({
  id,
  name,
  ticker,
  imageUrl,
  marketCap,
  volume, // If you add 'volume' to props, destructure it here
  age,
  isFeatured,
  isBondingSoon,
  isNew,
  isQuickHit,
  progress,
  suit,
  bondingStatusText,
  index = 0,
  isSpinning = false,
  spinDuration = 2500,
  allVipTokensForSpin = [],
}) => {
  const { animationLevel } = useAnimation()

  const imageQueryWidth = 400
  const imageQueryHeight = 200

  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")

  const linkMotionProps =
    animationLevel >= 1
      ? { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.3 } }
      : { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 1 }, transition: { duration: 0 } }

  const contentSwitchVariants: Variants = {
    initial: animationLevel >= 1 ? { opacity: 0 } : { opacity: 1 },
    animate: animationLevel >= 1 ? { opacity: 1 } : { opacity: 1 },
    exit: animationLevel >= 1 ? { opacity: 0 } : { opacity: 1 },
  }
  const contentSwitchTransition = animationLevel >= 1 ? { duration: 0.4, ease: "easeInOut" as const } : { duration: 0 }

  const shouldGlow = animationLevel >= 1 && (isQuickHit || isFeatured || suit || bondingStatusText === "IMPORT")

  const cardStaticContent = (
    <>
      <CardHeader className={cn("p-0 relative bg-black z-10", CARD_HEADER_HEIGHT_CLASS)}>
        {/* Container for top-left Age badge */}
        <div className="absolute top-2 left-2 z-10 flex flex-col items-start">
          <div className="flex items-center gap-1 bg-black/75 text-gray-200 text-[10px] px-1.5 py-0.5 rounded-none border border-[#03FF24]/50 shadow-[1px_1px_0px_rgba(3,255,36,0.2)]">
            <Timer className="h-2.5 w-2.5 text-[#03FF24] pixelated-icon" />
            <span>{age.toUpperCase()}</span>
          </div>
        </div>

        {/* Top-right badges container */}
        <div className="absolute top-2 right-2 flex flex-col gap-1.5 items-end z-10">
          {isQuickHit && (
            <Badge
              className={cn(
                "bg-yellow-400 text-black",
                "font-bold uppercase tracking-wider text-xs",
                "py-1 px-2.5",
                "rounded-none",
                "shadow-[2px_2px_0px_rgba(0,0,0,0.7)]",
                animationLevel >= 1 && "animate-badge-glint",
              )}
              style={{ color: "#000000" }}
            >
              <MousePointerClick className="h-3 w-3 mr-1 pixelated-icon" />
              Quick Hit!
            </Badge>
          )}
          {bondingStatusText === "IMPORT" && !isQuickHit && (
            <Badge
              className={cn(
                "bg-sky-500/90 text-black font-bold border border-black py-0.5 px-2 text-xs rounded-none shadow-[3px_3px_0px_#01579b]",
                animationLevel >= 1 && "animate-badge-glint",
                animationLevel >= 1 && "[animation-delay:0.1s]",
              )}
              style={{ color: "#000000" }}
            >
              <Archive className="h-3 w-3 mr-1 fill-current pixelated-icon" /> IMPORTED
            </Badge>
          )}
          {isBondingSoon &&
            !isQuickHit &&
            bondingStatusText !== "IMPORT" && ( // This block will likely not render for VIP table cards
              <Badge
                className={cn(
                  "bg-[#03FF24] text-black font-black border-2 border-black py-1 px-2.5 text-xs rounded-none shadow-[3px_3px_0px_#018814]",
                  animationLevel >= 1 && "animate-badge-glint",
                )}
                style={{ color: "#000000" }}
              >
                <Hourglass className={cn("h-3 w-3 mr-1 pixelated-icon", animationLevel >= 1 && "animate-spin-slow")} />{" "}
                BONDING SOON
              </Badge>
            )}
          {isFeatured && !isBondingSoon && !isQuickHit && bondingStatusText !== "IMPORT" && (
            <Badge
              className={cn(
                "bg-[#03FF24] text-black font-bold border border-black py-1 px-2.5 text-xs rounded-none shadow-[3px_3px_0px_#01a718]",
                animationLevel >= 1 && "animate-badge-glint",
                animationLevel >= 1 && "[animation-delay:0.2s]",
              )}
              style={{ color: "#000000" }}
            >
              <Star className="h-3 w-3 mr-1 fill-current pixelated-icon" /> FEATURED
            </Badge>
          )}
          {isNew && !isQuickHit && bondingStatusText !== "IMPORT" && !isFeatured && !isBondingSoon && (
            <Badge className="bg-black/80 text-[#03FF24] border border-[#03FF24]/50 font-semibold py-0.5 px-1.5 text-[10px] rounded-none shadow-[2px_2px_0px_rgba(3,255,36,0.3)]">
              NEW
            </Badge>
          )}
        </div>

        <Image
          src={imageUrl || `/placeholder.svg?width=${imageQueryWidth}&height=${imageQueryHeight}&query=fallback+image`}
          alt={name}
          width={imageQueryWidth}
          height={imageQueryHeight}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 25vw"
          className={cn(
            "w-full h-full object-cover",
            "group-hover:brightness-[1.3] transition-all duration-300 ease-out rounded-none pixelated-image-render",
            animationLevel >= 1 && "group-hover:animate-image-pop",
          )}
          priority={index < 4}
        />
      </CardHeader>
      <CardContent className="p-3 flex-grow relative z-10 bg-black flex flex-col justify-center">
        <h3
          className={cn(
            "font-bold truncate transition-colors flex items-center text-gray-50 uppercase",
            isFeatured || isBondingSoon || isQuickHit || bondingStatusText === "IMPORT" ? "text-lg" : "text-base",
            isBondingSoon || isQuickHit || bondingStatusText === "IMPORT"
              ? (isQuickHit ? "text-yellow-400" : bondingStatusText === "IMPORT" ? "text-sky-400" : "text-[#03FF24]") +
                  " filter drop-shadow-[1px_1px_0px_black]"
              : "group-hover:text-[#03FF24]",
          )}
        >
          <SuitIcon suit={suit} animationLevel={animationLevel} />
          {name}
        </h3>
        <p
          className={cn(
            "text-xs font-mono group-hover:text-[#03FF24]/90 transition-colors ml-0.5 filter group-hover:drop-shadow-[1px_1px_0px_rgba(0,0,0,0.5)] uppercase",
            isQuickHit
              ? "text-yellow-400/80 group-hover:text-yellow-400"
              : bondingStatusText === "IMPORT"
                ? "text-sky-400/80 group-hover:text-sky-400"
                : "text-[#03FF24]/70",
          )}
        >
          {ticker}
        </p>
        <div className="mt-3 space-y-1.5 text-xs text-gray-300 uppercase">
          <div className="flex justify-between items-center">
            <span className="text-gray-400">MCAP:</span>
            <span
              className={cn(
                "font-semibold text-sm filter drop-shadow-[1px_1px_0px_black]",
                isQuickHit ? "text-yellow-400" : bondingStatusText === "IMPORT" ? "text-sky-400" : "text-[#03FF24]",
              )}
            >
              {marketCap}
            </span>
          </div>
        </div>
      </CardContent>
      <CardFooter className={cn("p-3 bg-black relative z-10 flex flex-col justify-between", CARD_FOOTER_HEIGHT_CLASS)}>
        {progress !== undefined && bondingStatusText !== "IMPORT" ? (
          <div className="w-full text-center space-y-1.5">
            <AnimatedPixelProgressBar
              progress={progress}
              heightClass="h-4"
              barColorClass={isQuickHit ? "bg-yellow-400" : "bg-[#03FF24]"}
              blockAnimationClass={isQuickHit ? "yellow-flashy-bonding-block" : "flashy-bonding-block"}
              borderColorClass={isQuickHit ? "border-yellow-400/40" : "border-[#03FF24]/30"}
            />
            <p
              className={cn(
                "text-xs font-mono uppercase tracking-wider filter drop-shadow-[1px_1px_0px_black]",
                isQuickHit ? "text-yellow-400/90" : "text-[#03FF24]/80",
              )}
            >
              {progress}% FILLED
            </p>
          </div>
        ) : (
          <div className="h-[calc(1rem+0.375rem*2)]" /> /* Placeholder for progress bar height */
        )}
      </CardFooter>
    </>
  )

  return (
    <Link href={`/token/${slug}`} passHref legacyBehavior>
      <motion.a
        className={cn("group block", TOTAL_CARD_HEIGHT_CLASS)}
        style={{ textDecoration: "none" }}
        {...linkMotionProps}
      >
        <Card
          className={cn(
            "flex flex-col h-full relative transition-all duration-150 ease-out rounded-none shadow-none",
            isQuickHit ? "shadow-token-card-yellow-neon" : "shadow-token-card-neon",
            animationLevel === 2 &&
              !isSpinning &&
              (isFeatured || isBondingSoon || isNew || isQuickHit || bondingStatusText === "IMPORT") &&
              "animate-subtle-card-float",
            shouldGlow
              ? [
                  "glow-border",
                  isQuickHit
                    ? "glow-border-yellow"
                    : bondingStatusText === "IMPORT"
                      ? "glow-border-yellow" // Keep IMPORT yellow for consistency if desired, or change to blue
                      : "glow-border-green",
                ]
              : "border-[10px] border-transparent",
          )}
        >
          <AnimatePresence mode="wait">
            <motion.div
              key={isSpinning && animationLevel >= 1 ? `spinning-${id}` : `static-${id}`}
              variants={contentSwitchVariants}
              initial="initial"
              animate="animate"
              exit="exit"
              transition={contentSwitchTransition}
              className="flex flex-col h-full bg-black overflow-hidden"
            >
              {isSpinning && animationLevel >= 1 && allVipTokensForSpin && allVipTokensForSpin.length > 0 ? (
                <SpinningReelContent
                  duration={spinDuration}
                  allVipTokens={allVipTokensForSpin}
                  animationLevel={animationLevel}
                />
              ) : (
                cardStaticContent
              )}
            </motion.div>
          </AnimatePresence>
        </Card>
      </motion.a>
    </Link>
  )
}
export const TokenCard = React.memo(TokenCardComponent)
