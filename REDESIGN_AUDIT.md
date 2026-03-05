# waifu.fun Redesign Audit

## Goal
Sophisticated Framer/Webflow aesthetic + bold milady/schizo internet culture. Glitchy, cyberpunk, NOT cheap flashy neon.

## Current Issues (Based on Redesign Skill Framework)

### Typography ❌
- Using generic gradient text (`from-violet-400 via-pink-400 to-cyan-400`) - too clean, AI-generated looking
- Headlines lack character - need more experimental type treatment
- Missing variable font animations or glitch effects
- All sentence case - needs more chaos/variety

### Color & Surfaces ❌
- Generic "AI gradient" aesthetic (violet/pink/cyan) - the exact pattern the skill warns against
- Colors too saturated and clean - need desaturation
- Missing noise/grain overlays - feels too digital
- Floating orbs are too perfect - need distortion
- Background too flat - needs texture and depth
- Shadows are generic - no tinted shadows matching background hue

### Layout ✓ (mostly good)
- Asymmetric layout is good
- Proper use of min-h-screen
- Good whitespace
- **Issue**: Too symmetrical/centered overall

### Motion & Interactivity ⚠️
- Using framer-motion but effects are too smooth/corporate
- Missing glitch animations
- No spring physics - using linear easing
- Need more experimental scroll effects

### Content ⚠️
- Copy is good but could be more raw/direct
- Stats feel fake (127 agents, $2.4M volume) - make them feel real or remove

### Missing Elements
- No grain/noise texture overlay
- No glitch text effects
- No experimental typography
- No chaotic/broken grid moments
- No CRT/scan line effects for cyberpunk vibe

## Upgrade Plan

### Phase 1: Surface Treatment (Immediate Impact)
1. **Add grain overlay** - fixed noise texture across entire site
2. **Desaturate colors** - tone down violet/pink/cyan to 60-70% saturation
3. **Add tinted shadows** - shadows should carry background hue
4. **Background texture** - add subtle scanlines or mesh gradient
5. **Replace perfect gradients** with distorted/broken versions

### Phase 2: Typography Chaos
1. **Glitch text effect** on headline - subtle data corruption aesthetic
2. **Variable font weight animation** on hover/scroll
3. **Mix case styles** - some ALL CAPS, some lowercase, intentional chaos
4. **Outlined-to-fill transition** on key words
5. **Add monospace font for technical elements** (already using JetBrains Mono - expand usage)

### Phase 3: Experimental Motion
1. **Replace smooth float with jittery motion** - broken physics
2. **Add scroll-driven distortion** - elements warp on scroll
3. **Glitch on hover** - micro-distortions on interactive elements
4. **Staggered entry with spring physics** - not linear easing
5. **CRT flicker effect** on certain elements

### Phase 4: Layout Breaks
1. **Break symmetry deliberately** - offset elements with calculated chaos
2. **Overlapping layers** - z-index chaos that still reads
3. **Broken grid** - elements bleeding off-screen
4. **Asymmetric card layouts** - no more equal columns

## Design Principles

### DO:
✓ Sophisticated typography hierarchy
✓ Intentional chaos (not random mess)
✓ Desaturated cyberpunk colors
✓ Grain, noise, texture overlays
✓ Glitch effects used sparingly
✓ Spring physics for motion
✓ Tinted shadows
✓ Broken grid with purpose

### DON'T:
✗ Cheap flashy neon (#ff00ff, #00ffff pure saturation)
✗ Generic AI gradients (purple/blue/pink)
✗ Perfect symmetry
✗ Smooth corporate motion
✗ Flat digital surfaces
✗ Generic hover states
✗ Clean geometric shapes everywhere

## Color Palette (Revised)

### Base
- Background: `#0a0a0a` (near black, slightly warm)
- Card: `#141414` (elevated surface)
- Text primary: `#e8e8e8` (off-white)
- Text secondary: `#8a8a8a` (desaturated gray)

### Accents (Desaturated)
- Violet (primary): `hsl(270, 50%, 55%)` - NOT pure violet
- Pink (secondary): `hsl(330, 45%, 60%)` - NOT hot pink
- Cyan (tertiary): `hsl(180, 40%, 65%)` - NOT electric cyan
- Green (success): `hsl(150, 35%, 55%)` - muted

### Effects
- Glow: Use at 20-30% opacity max
- Shadows: Tinted with violet hue `rgba(139, 0, 255, 0.1)`
- Grain: 5-10% opacity
