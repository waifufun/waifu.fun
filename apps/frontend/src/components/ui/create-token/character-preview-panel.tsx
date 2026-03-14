"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  ChevronDown,
  Edit3,
  User,
  Hash,
  Activity,
  Loader2,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/create-token/slider";
import type { AgentCharacter } from "./conversation-builder";
import { usePrompt } from "@/components/hooks/providers/usePromptContext";
import { LaunchButton } from "./shared-form-section";
import { Controller } from "react-hook-form";
import useBalance from "@/hooks/use-balance";
import useAddress from "@/hooks/use-address";

// ---------------------------------------------------------------------------
// Style constants (shared with project)
// ---------------------------------------------------------------------------
const formElementBaseClass =
  "bg-[#0e0e12] border border-[rgba(255,255,255,0.08)] placeholder-[#52525b] text-sm focus:border-[#00ff87] focus:ring-1 focus:ring-[#00ff87]/30 text-[#e4e4e7] rounded-sm";
const formLabelBaseClass =
  "text-[10px] font-mono uppercase tracking-[0.18em] text-[#52525b]";

const sliderThumbClass =
  "block h-5 w-5 rounded-sm bg-[#00ff87] border-2 border-[#08080a] ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#00ff87]/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
const sliderTrackClass =
  "relative h-2 w-full grow overflow-hidden rounded-sm bg-[rgba(17,17,20,0.7)] border border-[rgba(255,255,255,0.08)]";
const sliderRangeClass = "absolute h-full bg-[#00ff87]";

// ---------------------------------------------------------------------------
// Agent card preview (top section)
// ---------------------------------------------------------------------------
function AgentCardPreview({
  character,
  imageUrl,
  isGeneratingImage,
}: {
  character: AgentCharacter;
  imageUrl: string | undefined;
  isGeneratingImage: boolean;
}) {
  const samplePost = useMemo(() => {
    if (!character.name) return "your agent is taking shape...";
    const adj = character.adjectives?.[0] || "new";
    return `gm. ${character.name} here. ${adj} energy only. deployed on waifu.fun.`;
  }, [character.name, character.adjectives]);

  return (
    <div className="relative bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm overflow-hidden">
      {/* Corner brackets */}
      <div className="absolute top-0 left-0 w-3 h-3 border-l border-t border-[#00ff87]/25 z-10" />
      <div className="absolute top-0 right-0 w-3 h-3 border-r border-t border-[#00ff87]/25 z-10" />
      <div className="absolute bottom-0 left-0 w-3 h-3 border-l border-b border-[#00ff87]/25 z-10" />
      <div className="absolute bottom-0 right-0 w-3 h-3 border-r border-b border-[#00ff87]/25 z-10" />

      {/* Avatar section */}
      <div className="relative w-full aspect-square max-h-[200px] bg-[#08080a] overflow-hidden">
        <AnimatePresence mode="wait">
          {isGeneratingImage ? (
            <motion.div
              key="generating"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col items-center justify-center gap-2"
            >
              <Loader2 className="w-6 h-6 text-[#00ff87] animate-spin" />
              <span className="text-[10px] font-mono text-[#00ff87] uppercase tracking-widest">
                generating
              </span>
            </motion.div>
          ) : imageUrl ? (
            <motion.img
              key={imageUrl}
              src={imageUrl}
              alt={character.name || "Agent"}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ type: "spring", stiffness: 100, damping: 20 }}
              className="w-full h-full object-cover"
            />
          ) : (
            <motion.div
              key="empty"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="absolute inset-0 flex items-center justify-center"
            >
              <User className="w-12 h-12 text-[#27272a]" />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Info section */}
      <div className="p-4 space-y-3">
        {/* Name + Ticker */}
        <div>
          <motion.h3
            layout
            className="text-[#e4e4e7] font-bold text-lg truncate"
          >
            {character.name || "Agent Name"}
          </motion.h3>
          <motion.p layout className="text-[#00ff87] font-mono text-sm">
            {character.ticker ? `$${character.ticker}` : "$TICKER"}
          </motion.p>
        </div>

        {/* Description */}
        {character.description && (
          <p className="text-xs text-[#71717a] leading-relaxed line-clamp-2">
            {character.description}
          </p>
        )}

        {/* Sample post */}
        <div className="bg-[#08080a] border border-[rgba(255,255,255,0.04)] rounded-sm p-3">
          <div className="flex items-start gap-2">
            <div className="w-5 h-5 rounded-full bg-[#111114] flex-shrink-0 overflow-hidden flex items-center justify-center">
              {imageUrl ? (
                <img src={imageUrl} alt="" className="w-full h-full object-cover" />
              ) : (
                <User className="w-2.5 h-2.5 text-[#52525b]" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] text-[#52525b] mb-0.5">
                {character.name || "Agent"} &middot; just now
              </p>
              <p className="text-xs text-[#71717a] leading-relaxed">
                {samplePost}
              </p>
            </div>
          </div>
        </div>

        {/* Traits */}
        {character.adjectives && character.adjectives.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {character.adjectives.slice(0, 4).map((adj) => (
              <span
                key={adj}
                className="text-[9px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-sm bg-[rgba(0,255,135,0.06)] text-[#00ff87]/70 border border-[#00ff87]/10"
              >
                {adj}
              </span>
            ))}
          </div>
        )}

        {/* Status */}
        <div className="flex items-center justify-between pt-2 border-t border-[rgba(255,255,255,0.04)]">
          <span className="text-[10px] text-[#52525b] font-mono uppercase tracking-wider flex items-center gap-1">
            <Activity className="w-3 h-3" />
            Status
          </span>
          <span className="text-[10px] font-mono text-[#00ff87]">
            {character.name && character.description ? "ready" : "building"}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Economics section (collapsed by default)
// ---------------------------------------------------------------------------
function EconomicsSection() {
  const [isOpen, setIsOpen] = useState(false);
  const {
    control,
    registerForm,
    formState: { errors },
    setValue,
  } = usePrompt();
  const address = useAddress();
  const balanceQuery = useBalance({ chain: "evm", address });
  const balance = balanceQuery?.data || 0;

  const setMaxAmount = () => {
    if (balance) {
      setValue("buyAmount", Math.min(balance * 0.97, 28), {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  };

  return (
    <div className="bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm overflow-hidden">
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 text-left group"
      >
        <span className="text-xs font-mono uppercase tracking-wider text-[#71717a] group-hover:text-[#a1a1aa] transition-colors">
          economics
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ type: "spring", stiffness: 200, damping: 25 }}
        >
          <ChevronDown className="w-4 h-4 text-[#52525b]" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 200, damping: 25 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 space-y-4 border-t border-[rgba(255,255,255,0.04)]">
              {/* Pre-buy */}
              <div className="pt-3">
                <div className="flex items-center justify-between mb-1">
                  <Label htmlFor="conv-buyAmount" className={formLabelBaseClass}>
                    Pre-buy (BNB)
                  </Label>
                </div>
                <div className="relative">
                  <Input
                    type="number"
                    id="conv-buyAmount"
                    step="any"
                    className={cn(formElementBaseClass, "h-9 pr-14 text-xs")}
                    {...registerForm("buyAmount", {
                      valueAsNumber: true,
                      min: { value: 0, message: "cannot be negative" },
                      max: {
                        value: Math.min(balance, 28),
                        message: "exceeds balance or 28 BNB max",
                      },
                    })}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[#00ff87] font-bold text-xs">
                    BNB
                  </span>
                </div>
                {errors.buyAmount && (
                  <p className="text-red-500 text-[10px] mt-1">
                    {errors.buyAmount.message}
                  </p>
                )}
                <div className="flex justify-between items-center mt-1">
                  <div className="flex items-center gap-1">
                    <Wallet className="w-3 h-3 text-[#52525b]" />
                    <span className="text-[10px] text-[#52525b]">
                      {balance.toFixed(4)} BNB
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={setMaxAmount}
                    className="text-[10px] text-[#00ff87] hover:text-[#e4e4e7] transition-colors"
                  >
                    max
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inline name/ticker editor (shown when clicking edit on the card)
// ---------------------------------------------------------------------------
function InlineFieldEditor({
  character,
  onUpdate,
}: {
  character: AgentCharacter;
  onUpdate: (delta: Partial<AgentCharacter>) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);

  if (!isEditing) {
    return (
      <button
        type="button"
        onClick={() => setIsEditing(true)}
        className="w-full flex items-center gap-2 px-4 py-2.5 bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm text-left group hover:border-[rgba(255,255,255,0.12)] transition-colors"
      >
        <Edit3 className="w-3 h-3 text-[#52525b] group-hover:text-[#71717a] transition-colors" />
        <span className="text-xs text-[#52525b] group-hover:text-[#71717a] transition-colors">
          edit name, ticker, or description
        </span>
      </button>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 200, damping: 20 }}
      className="bg-[#111114] border border-[rgba(255,255,255,0.06)] rounded-sm p-4 space-y-3"
    >
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label htmlFor="inline-name" className={formLabelBaseClass}>
            Name
          </Label>
          <Input
            id="inline-name"
            type="text"
            value={character.name}
            onChange={(e) => onUpdate({ name: e.target.value })}
            className={cn(formElementBaseClass, "mt-1 h-8 text-xs")}
            maxLength={20}
          />
        </div>
        <div>
          <Label htmlFor="inline-ticker" className={formLabelBaseClass}>
            Ticker
          </Label>
          <div className="relative">
            <Input
              id="inline-ticker"
              type="text"
              value={character.ticker}
              onChange={(e) =>
                onUpdate({ ticker: e.target.value.toUpperCase() })
              }
              className={cn(formElementBaseClass, "mt-1 h-8 text-xs pl-5")}
              maxLength={5}
            />
            <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[#00ff87] font-bold text-xs mt-0.5">
              $
            </span>
          </div>
        </div>
      </div>
      <div>
        <Label htmlFor="inline-desc" className={formLabelBaseClass}>
          Description
        </Label>
        <textarea
          id="inline-desc"
          value={character.description}
          onChange={(e) => onUpdate({ description: e.target.value })}
          className={cn(
            formElementBaseClass,
            "mt-1 w-full px-3 py-2 text-xs resize-none min-h-[60px]"
          )}
          maxLength={200}
        />
      </div>
      <button
        type="button"
        onClick={() => setIsEditing(false)}
        className="text-[10px] text-[#00ff87] hover:text-[#e4e4e7] transition-colors font-mono uppercase tracking-wider"
      >
        done
      </button>
    </motion.div>
  );
}

// ---------------------------------------------------------------------------
// Main preview panel
// ---------------------------------------------------------------------------
interface CharacterPreviewPanelProps {
  character: AgentCharacter;
  imageUrl: string | undefined;
  isGeneratingImage: boolean;
  onCharacterUpdate: (delta: Partial<AgentCharacter>) => void;
  onRegenerateImage: () => void;
  showLaunchButton: boolean;
  className?: string;
}

export function CharacterPreviewPanel({
  character,
  imageUrl,
  isGeneratingImage,
  onCharacterUpdate,
  onRegenerateImage,
  showLaunchButton,
  className,
}: CharacterPreviewPanelProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-3 overflow-y-auto overflow-x-hidden px-1 pb-4",
        "scrollbar-thin scrollbar-thumb-[rgba(255,255,255,0.06)] scrollbar-track-transparent",
        className
      )}
    >
      {/* Agent card */}
      <AgentCardPreview
        character={character}
        imageUrl={imageUrl}
        isGeneratingImage={isGeneratingImage}
      />

      {/* Regenerate image button */}
      {(imageUrl || character.description) && (
        <button
          type="button"
          onClick={onRegenerateImage}
          disabled={isGeneratingImage}
          className={cn(
            "flex items-center justify-center gap-2 px-4 py-2 rounded-sm text-xs font-mono uppercase tracking-wider transition-all",
            isGeneratingImage
              ? "bg-[#111114] text-[#3f3f46] cursor-not-allowed"
              : "bg-[#111114] border border-[rgba(255,255,255,0.06)] text-[#71717a] hover:text-[#a1a1aa] hover:border-[rgba(255,255,255,0.12)]"
          )}
        >
          <RefreshCw
            className={cn(
              "w-3 h-3",
              isGeneratingImage && "animate-spin"
            )}
          />
          {isGeneratingImage ? "generating..." : "regenerate image"}
        </button>
      )}

      {/* Inline editor */}
      <InlineFieldEditor
        character={character}
        onUpdate={onCharacterUpdate}
      />

      {/* Economics */}
      <EconomicsSection />

      {/* Launch */}
      {showLaunchButton && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 120, damping: 20 }}
        >
          <LaunchButton />
        </motion.div>
      )}
    </div>
  );
}
