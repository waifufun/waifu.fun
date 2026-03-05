# waifu.fun Design System — Cyberpunk v3

## Philosophy
Sophisticated Framer/Webflow polish meets cyberpunk internet culture.
Not cheap neon. Not safe corporate. Intentional chaos with restraint.

## Color Palette

### Backgrounds
- `--bg-primary: #08080a` — near-black with slight blue tint
- `--bg-card: #111114` — elevated surface
- `--bg-card-hover: #18181c` — card hover state
- `--bg-input: #0e0e12` — input fields
- `--bg-elevated: #1a1a1f` — modals, popovers

### Text
- `--text-primary: #e4e4e7` — main text (not pure white)
- `--text-secondary: #71717a` — secondary/muted
- `--text-tertiary: #52525b` — least emphasis
- `--text-link: #a78bfa` — links (violet-400)

### Accent Colors (Desaturated, Sophisticated)
- `--accent-violet: #8b5cf6` — primary accent (violet-500)
- `--accent-pink: #c084fc` — secondary accent (purple-400, not hot pink)
- `--accent-cyan: #67e8f9` — tertiary, used sparingly (cyan-300)
- `--accent-green: #4ade80` — success/positive (green-400)
- `--accent-red: #f87171` — error/negative (red-400)

### Borders & Surfaces
- `--border-subtle: rgba(255, 255, 255, 0.06)` — default borders
- `--border-hover: rgba(255, 255, 255, 0.12)` — hover state
- `--border-active: rgba(139, 92, 246, 0.3)` — active/focused (violet tint)
- `--glass-bg: rgba(17, 17, 20, 0.8)` — glassmorphism background
- `--glass-border: rgba(255, 255, 255, 0.08)` — glass borders

### Shadows (Tinted)
- `--shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.3)`
- `--shadow-md: 0 4px 12px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255,255,255,0.03)`
- `--shadow-glow: 0 0 20px rgba(139, 92, 246, 0.15)` — violet glow
- `--shadow-glow-cyan: 0 0 20px rgba(103, 232, 249, 0.1)` — cyan glow

## Typography
- **Display**: Space Grotesk, tight tracking (-0.03em), heavy weight
- **Body**: Space Grotesk, normal tracking, light/regular weight
- **Mono**: JetBrains Mono or DM Mono for data, stats, code
- **Scale**: Use `clamp()` for responsive sizing

### Hierarchy
- Hero headline: clamp(3rem, 8vw, 6rem), font-bold, tracking-tight
- Section headline: 2rem-2.5rem, font-semibold
- Card title: 1rem, font-medium
- Body: 0.875rem-1rem, font-light/normal
- Label/mono: 0.75rem, uppercase, tracking-wider

## Effects & Textures

### Grain Overlay
Fixed full-screen SVG noise at 6-8% opacity, mix-blend-overlay.
Adds analog texture to break digital flatness.

### CRT Scan Lines
Repeating 2px horizontal lines at 2-3% opacity.
One animated scan line sweeping vertically at very low opacity (3-5%).

### Glitch Effects
- Text glitch: clip-path slicing with translate offset, fires randomly every 5-8s
- RGB split: duplicate text offset by 2-3px in cyan and pink at 30-50% opacity
- Should feel like data corruption, not a rave

### Glow Effects
- Subtle text-shadow glow on accent text: 8-12px blur at 20-30% opacity
- Card border glow on hover: box-shadow with violet tint
- Never more than 30% opacity on any glow effect

### Motion
- Spring physics: damping 20-25, stiffness 150-200
- Staggered entry: 0.05-0.1s delay between items
- Hover: scale(1.02) + translateY(-2px) with spring
- Active/press: scale(0.98) for physical feedback
- NO linear easing, NO 1s+ durations on interactions

## Component Patterns

### Cards (Token Cards)
- Dark bg (#111114), subtle border (rgba(255,255,255,0.06))
- On hover: border brightens, slight glow, subtle lift
- Progress ring: violet gradient instead of green
- Image at top, data at bottom with monospace numbers
- Corner badge for ticker/name

### Buttons
- Primary: solid bg, no gradient, violet-500 bg with white text
- Secondary: transparent with border, border-subtle
- Both: spring hover animation, press feedback
- Icon buttons: ghost style, no background

### Navigation
- Glass background with blur, very dark
- Logo: "waifu.fun" in brand font, violet accent possible
- Compact, no wasted space
- Search: dark input with subtle border, CMD+K shortcut

### Footer
- Minimal, dark, monospace aesthetic
- Social links as subtle icons
- Legal links in tertiary text color
- No glass card — just clean dark section

## Scrollbar
- Thin (4-6px), violet thumb on transparent track
- Rounded pill shape

## DO NOT
- Use pure #000000 or #ffffff
- Use saturated neon (#ff00ff, #00ffff, #ff0000)
- Use gradients on buttons
- Use glass/white backgrounds on dark theme
- Use blue (#2563eb) — that's the old brand
- Use green (#03FF23) — that's the old brand
- Use `bg-white/X` classes — we're dark mode
- Use generic AI gradient (purple → blue → pink smooth gradient)
- Use emojis in UI copy
