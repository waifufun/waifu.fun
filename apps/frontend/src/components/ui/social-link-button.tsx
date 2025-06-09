import { Button } from "@/components/ui/button"
import type React from "react"

interface SocialLinkButtonProps {
  href: string
  "aria-label": string
  children: React.ReactNode
}

export function SocialLinkButton({ href, "aria-label": ariaLabel, children }: SocialLinkButtonProps) {
  return (
    <Button
      variant="outline"
      size="icon"
      className="h-7 w-7 p-1 border-2 border-[#03FF24]/50 text-[#03FF24]/80 hover:text-[#03FF24] hover:bg-[#03FF24]/10 hover:border-[#03FF24] rounded-none shadow-[2px_2px_0px_rgba(3,255,36,0.2)]"
      asChild
    >
      <a href={href} target="_blank" rel="noopener noreferrer" aria-label={ariaLabel}>
        {children}
      </a>
    </Button>
  )
}
