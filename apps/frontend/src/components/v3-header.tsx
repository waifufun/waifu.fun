"use client"

import React, { useState, useEffect, useRef, useCallback } from "react" // Imported React for React.memo
import Link from "next/link"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import {
  Twitter,
  Send,
  CreditCard,
  PlusSquare,
  Zap,
  Search,
  ZapOff,
  Sparkles,
  Menu,
  X,
  Copy,
  ExternalLinkIcon,
  Diamond,
  Circle,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { useAnimation, type AnimationLevel } from "@/providers/animation-provider"
import { cn } from "@/lib/utils"
import { motion, AnimatePresence } from "framer-motion"
import { usePathname } from "next/navigation"
import ConnectWallet from "./connect-wallet"

interface FunHeaderProps {
  logoUrl?: string
}

const logoDimensions: Record<string, { width: number; height: number }> = {
  "/logo-autofun.png": { width: 150, height: 40 },
  "/logo-coin-machine.png": { width: 160, height: 40 },
  default: { width: 140, height: 35 },
}

interface SearchResult {
  id: string
  imageUrl: string
  name: string
  ticker: string
  address: string
  mcap: string
  slug: string
}

const mockSearchResults: SearchResult[] = [
  {
    id: "1",
    imageUrl: "/search-result-token-1.png",
    name: "$FFROST",
    ticker: "$TEST",
    address: "pifhdfg...s14qafFUN",
    mcap: "$1.35M",
    slug: "autotesttoken",
  },
  {
    id: "2",
    imageUrl: "/search-result-token-1.png",
    name: "$NEONPULSE",
    ticker: "$PULSE",
    address: "9WzDXwB...YtAWWM",
    mcap: "$10.0M",
    slug: "neon-pulse",
  },
  {
    id: "3",
    imageUrl: "/search-result-token-1.png",
    name: "$GRIDGLIDER",
    ticker: "$GLIDE",
    address: "4vJ9JU1...LbKLKi",
    mcap: "$4.2M",
    slug: "grid-glider",
  },
  {
    id: "4",
    imageUrl: "/search-result-token-1.png",
    name: "$BYTEBURST",
    ticker: "$BYTE",
    address: "DRiP2Pn...NEGLLsWMF",
    mcap: "$2.1M",
    slug: "byte-burst",
  },
]

const SearchResultItemComponent: React.FC<{ item: SearchResult; onSelect: () => void }> = ({ item, onSelect }) => {
  const { animationLevel } = useAnimation()
  return (
    <Link href={`/token/${String(item.slug)}`} passHref legacyBehavior>
      <a
        onClick={onSelect}
        className={cn(
          "block p-3 hover:bg-[#03FF24]/10 transition-colors duration-150",
          "border-t-2 border-blue-500/70 first:border-t-0",
          "border-b border-dotted border-gray-700/50 last:border-b-0",
        )}
      >
        <div className="flex items-center gap-3">
          <Image
            src={String(item.imageUrl || "/placeholder.svg?width=40&height=40&query=token+search+icon")}
            alt={String(item.name || "Search result token")}
            width={40}
            height={40}
            className="rounded-none border border-[#03FF24]/30 pixelated-image-render flex-shrink-0"
          />
          <div className="flex-grow min-w-0">
            <div className="flex items-baseline">
              <span className="font-bold text-sm text-gray-100 truncate group-hover:text-[#03FF24]">
                {String(item.name)}
              </span>
              <span className="ml-1.5 text-xs text-gray-400">{String(item.ticker)}</span>
            </div>
            <div className="flex items-center text-xs text-gray-500 mt-0.5">
              <Copy size={10} className="mr-1 text-gray-600" />
              <span className="truncate font-mono">{String(item.address)}</span>
            </div>
          </div>
          <div className="text-right flex-shrink-0 ml-2">
            <div className="text-xs text-gray-400">Mcap</div>
            <div className={cn("font-bold text-sm text-[#03FF24]", animationLevel >= 1 && "animate-value-pulse")}>
              {String(item.mcap)}
            </div>
          </div>
          <ExternalLinkIcon size={16} className="text-gray-500 hover:text-[#03FF24] ml-2 flex-shrink-0" />
        </div>
      </a>
    </Link>
  )
}
const SearchResultItem = React.memo(SearchResultItemComponent)

const USERNAME_FOR_PROFILE = "funtester22" // Hardcoded username for profile link

export function FunHeader({ logoUrl = "/logo_wide.svg" }: FunHeaderProps) {
  const { animationLevel, toggleAnimationLevel } = useAnimation()
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const pathname = usePathname()

  const [searchQuery, setSearchQuery] = useState("")
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [isSearchFocused, setIsSearchFocused] = useState(false)
  const searchContainerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setIsMobileMenuOpen(false)
    setSearchQuery("")
    setIsSearchFocused(false)
  }, [pathname])

  useEffect(() => {
    if (searchQuery.length > 0) {
      const lowerSearchQuery = searchQuery.toLowerCase()
      const filteredResults = mockSearchResults.filter(
        (token) =>
          String(token.name).toLowerCase().includes(lowerSearchQuery) ||
          String(token.ticker).toLowerCase().includes(lowerSearchQuery) ||
          String(token.address).toLowerCase().includes(lowerSearchQuery),
      )
      setSearchResults(filteredResults.slice(0, 4))
    } else {
      setSearchResults([])
    }
  }, [searchQuery])

  const handleClickOutsideSearch = useCallback(
    (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false)
      }
    },
    [searchContainerRef],
  )

  useEffect(() => {
    document.addEventListener("mousedown", handleClickOutsideSearch)
    return () => {
      document.removeEventListener("mousedown", handleClickOutsideSearch)
    }
  }, [handleClickOutsideSearch])

  const showSearchResults = isSearchFocused && searchQuery.length > 0 && searchResults.length > 0

  const getAnimationButtonIcon = (level: AnimationLevel) => {
    switch (level) {
      case 2:
        return <Zap className="h-5 w-5 text-green-400" />
      case 1:
        return <Sparkles className="h-5 w-5 text-orange-400" />
      case 0:
        return <ZapOff className="h-5 w-5 text-red-500" />
      default:
        return <Zap className="h-5 w-5 text-green-400" />
    }
  }

  const getAnimationButtonTitle = (level: AnimationLevel) => {
    switch (level) {
      case 2:
        return "Animations: All On (Click to set to Subtle)"
      case 1:
        return "Animations: Subtle (Click to set to Off)"
      case 0:
        return "Animations: Off (Click to set to All On)"
      default:
        return "Toggle Animations"
    }
  }

  const currentLogoUrl = logoUrl || "logo_wide.svg"
  const { width, height } = logoDimensions[currentLogoUrl] || logoDimensions.default

  const heightClass = `h-${Math.round(height / 4)}`
  const smHeightClass = `sm:h-${Math.round(height / 4)}`

  const mobileMenuButtonClasses = cn(
    "w-full flex items-center justify-start px-4 py-3 text-sm text-gray-200 hover:bg-[#03FF24]/25 hover:text-white active:bg-[#03FF24]/35 active:text-white rounded-none transition-colors",
    animationLevel > 0 && "animate-button-pop-hover",
  )

  const mobileMenuLinkClasses = cn(mobileMenuButtonClasses, "font-medium uppercase tracking-wider")

  const mobileMenuStatItemClasses = cn(
    "flex items-center justify-center gap-2 px-4 py-2 text-sm text-gray-200 hover:bg-[#03FF24]/20 rounded-none transition-colors w-full",
  )

  const pointsSectionBaseClasses = "flex items-center gap-0.5 cursor-pointer hover:opacity-80 transition-opacity"
  const pointsLink = `/profile/${String(USERNAME_FOR_PROFILE)}`

  // Hardcoded points values for display
  const solBalance = 1.83
  const diamondPoints = 250
  const circlePoints = 1200

  return (
    <header className="sticky top-0 z-50 bg-black/90 backdrop-blur-sm shadow-2xl shadow-[#03FF24]/10 border-b-2 border-[#03FF24]/40">
      <div className="container mx-auto px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <Link href="/" className="flex items-center group flex-shrink-0">
            <Image
              src={String(currentLogoUrl) || "logo_wide.svg"}
              alt="Site Logo"
              width={width}
              height={height}
              priority // Prioritize loading the main logo
              className={cn(
                heightClass,
                smHeightClass,
                "w-auto",
                "transition-all",
                "pixelated-image-render",
                animationLevel > 0 && "group-hover:brightness-125",
              )}
            />
          </Link>

          <div className="flex-1 flex justify-center px-1 sm:px-2 md:px-4 relative" ref={searchContainerRef}>
            <Input
              type="search"
              icon={<Search className="h-4 w-4 text-gray-500 group-focus-within:text-[#03FF24] transition-colors" />}
              placeholder="Explore"
              className="bg-black border-2 border-[#03FF24]/50 placeholder-gray-600 text-xs h-9 w-full max-w-[150px] xs:max-w-[180px] sm:max-w-xs md:max-w-sm lg:max-w-md focus:border-[#03FF24] focus:ring-1 focus:ring-[#03FF24] text-gray-200 rounded-none shadow-[3px_3px_0px_rgba(3,255,36,0.25)] focus:shadow-[3px_3px_0px_rgba(3,255,36,0.5)] uppercase tracking-wider transition-all duration-300"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={() => setIsSearchFocused(true)}
            />
            <AnimatePresence>
              {showSearchResults && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: animationLevel > 0 ? 0.2 : 0 }}
                  className="absolute top-full mt-1.5 w-full max-w-[150px] xs:max-w-[180px] sm:max-w-xs md:max-w-sm lg:max-w-md bg-black border-2 border-[#03FF24]/60 rounded-none shadow-[4px_4px_0px_rgba(3,255,36,0.4)] z-50 overflow-hidden"
                >
                  {searchResults.map((item) => (
                    <SearchResultItem key={item.id} item={item} onSelect={() => setIsSearchFocused(false)} />
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            {/* Desktop Navigation Items (visible on md and up, points specific to lg and up) */}
            <div className="hidden md:flex items-center gap-1 sm:gap-2 md:gap-3">
              <Button
                variant="ghost"
                size="icon"
                onClick={toggleAnimationLevel}
                title={getAnimationButtonTitle(animationLevel)}
                className={cn(
                  "text-gray-400 hover:bg-gray-700/50 rounded-none",
                  animationLevel > 0 && "animate-button-pop-hover",
                  "pixelated-icon-button",
                )}
              >
                {getAnimationButtonIcon(animationLevel)}
              </Button>
              <Link href="#" passHref>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "text-gray-400 hover:text-[#03FF24] rounded-none pixelated-icon-button",
                    animationLevel > 0 && "animate-button-pop-hover",
                  )}
                >
                  <Twitter className="h-5 w-5" />
                </Button>
              </Link>
              <Link href="#" passHref>
                <Button
                  variant="ghost"
                  size="icon"
                  className={cn(
                    "text-gray-400 hover:text-[#03FF24] rounded-none pixelated-icon-button",
                    animationLevel > 0 && "animate-button-pop-hover",
                  )}
                >
                  <Send className="h-5 w-5" />
                </Button>
              </Link>
              {/* Desktop Points Display (visible on lg and up) */}
              <div className="hidden lg:flex h-6 w-px bg-[#03FF24]/30"></div>
              <div className="hidden lg:flex items-center gap-2 text-sm text-gray-400">
                <Link href={pointsLink} passHref>
                  <span className={pointsSectionBaseClasses} title={`SOL Balance: ${solBalance}`}>
                    {solBalance.toFixed(2)}
                    <span
                      className={cn("text-[#03FF24] font-semibold", animationLevel >= 1 && "animate-subtle-flicker")}
                    >
                      SOL
                    </span>
                  </span>
                </Link>
                <span className="text-[#03FF24]/50 mx-1">|</span>
                <Link href={pointsLink} passHref legacyBehavior>
                  <a className={pointsSectionBaseClasses} title={`Permanent Points: ${diamondPoints}`}>
                    <Diamond size={16} className="text-yellow-400" />
                    <span className="font-semibold text-yellow-400">{diamondPoints}</span>
                  </a>
                </Link>
                <span className="text-[#03FF24]/50 mx-1">|</span>
                <Link href={pointsLink} passHref legacyBehavior>
                  <a className={pointsSectionBaseClasses} title={`Weekly Points: ${circlePoints}`}>
                    <Circle size={16} className="text-gray-400 fill-current" />
                    <span className="font-semibold text-gray-300">{circlePoints}</span>
                  </a>
                </Link>
              </div>
              <Link href="/create" passHref legacyBehavior>
                <Button
                  as="a"
                  className={cn(
                    "bg-[#03FF24] hover:bg-[#02e020] text-black font-bold text-xs h-9 px-3 rounded-none shadow-[4px_4px_0px_#01a718] hover:shadow-[2px_2px_0px_#01a718] active:shadow-none hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0 active:translate-y-0 pixelated-icon-button",
                    animationLevel > 0 && "animate-button-pop-hover",
                  )}
                >
                  <PlusSquare className="mr-1.5 h-4 w-4" />
                  CREATE TOKEN
                </Button>
              </Link>
              <ConnectWallet/>
            </div>

            {/* Hamburger Menu Button (visible on <lg screens) */}
            <div className="lg:hidden">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="text-gray-300 hover:text-[#03FF24] active:text-[#03FF24] rounded-none p-1.5"
                aria-label={isMobileMenuOpen ? "Close menu" : "Open menu"}
              >
                {isMobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Navigation Panel */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <motion.div
            initial={{ opacity: 0, scaleY: 0 }}
            animate={{ opacity: 1, scaleY: 1 }}
            exit={{ opacity: 0, scaleY: 0 }}
            style={{ transformOrigin: "top" }}
            transition={{ duration: animationLevel > 0 ? 0.3 : 0, ease: "easeInOut" }}
            className="lg:hidden absolute top-full left-0 right-0 bg-black/95 border-t-2 border-[#03FF24]/50 shadow-lg overflow-hidden"
          >
            <nav className="flex flex-col py-2">
              <Button
                onClick={() => {
                  toggleAnimationLevel()
                }}
                className={mobileMenuButtonClasses}
                title={getAnimationButtonTitle(animationLevel)}
              >
                {getAnimationButtonIcon(animationLevel)}
                <span className="ml-3">{getAnimationButtonTitle(animationLevel)}</span>
              </Button>
              <Link href="#" passHref legacyBehavior>
                <a className={mobileMenuLinkClasses} onClick={() => setIsMobileMenuOpen(false)}>
                  <Twitter className="mr-3 h-5 w-5" /> Twitter
                </a>
              </Link>
              <Link href="#" passHref legacyBehavior>
                <a className={mobileMenuLinkClasses} onClick={() => setIsMobileMenuOpen(false)}>
                  <Send className="mr-3 h-5 w-5" /> Telegram
                </a>
              </Link>
              <Link href="/create" passHref legacyBehavior>
                <a className={mobileMenuLinkClasses} onClick={() => setIsMobileMenuOpen(false)}>
                  <PlusSquare className="mr-3 h-5 w-5" /> Create Token
                </a>
              </Link>

              {/* Stats Section in Mobile Menu */}
              <div className="my-2 border-t border-[#03FF24]/20 mx-4"></div>
              <div className="flex flex-col items-center gap-1 px-2 py-1">
                <Link href={pointsLink} passHref legacyBehavior>
                  <a
                    className={mobileMenuStatItemClasses}
                    onClick={() => setIsMobileMenuOpen(false)}
                    title={`SOL Balance: ${solBalance}`}
                  >
                    {solBalance.toFixed(2)}
                    <span
                      className={cn(
                        "text-[#03FF24] font-semibold ml-1",
                        animationLevel >= 1 && "animate-subtle-flicker",
                      )}
                    >
                      SOL
                    </span>
                  </a>
                </Link>
                <Link href={pointsLink} passHref legacyBehavior>
                  <a
                    className={mobileMenuStatItemClasses}
                    onClick={() => setIsMobileMenuOpen(false)}
                    title={`Permanent Points: ${diamondPoints}`}
                  >
                    <Diamond size={16} className="text-yellow-400" />
                    <span className="font-semibold text-yellow-400 ml-1">{diamondPoints}</span>
                  </a>
                </Link>
                <Link href={pointsLink} passHref legacyBehavior>
                  <a
                    className={mobileMenuStatItemClasses}
                    onClick={() => setIsMobileMenuOpen(false)}
                    title={`Weekly Points: ${circlePoints}`}
                  >
                    <Circle size={16} className="text-gray-400 fill-current" />
                    <span className="font-semibold text-gray-300 ml-1">{circlePoints}</span>
                  </a>
                </Link>
              </div>
              <div className="my-2 border-t border-[#03FF24]/20 mx-4"></div>

              <ConnectWallet/>
            </nav>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
