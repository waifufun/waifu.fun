# waifu.fun Brand Assets: Final Package

## Locked Assets

### Icon
- **Source**: `icon_only_02`. Anime girl silhouette, neon green, magenta glitch, floating (no container)
- **Transparent**: `icon/icon_*.png` (1024, 512, 256, 128, 64px)
- **On black**: `icon/icon_on_black_*.png` (for app icon / pfp contexts)

### Lockup: WAIFU.FUN
- **Source**: `waifufun_01`. Icon left, bold text right, chromatic aberration
- **Transparent**: `lockup/lockup_waifufun_*.png` (1920, 1024, 512, 256px)
- **On black**: `lockup/lockup_waifufun_on_black_*.png`

### Lockup: WAIFU
- **Source**: `waifu_03`. Icon left, bold text right, chromatic aberration  
- **Transparent**: `lockup/lockup_waifu_*.png` (1920, 1024, 512, 256px)
- **On black**: `lockup/lockup_waifu_on_black_*.png`

## Colors
| Name | Hex | Usage |
|------|-----|-------|
| Brand Green | `#00FF87` | Icon silhouette, primary accent |
| Black | `#08080A` | Backgrounds |
| White | `#FFFFFF` | Text |
| Magenta | `#FF32B4` | Rim glow, chromatic aberration |
| Cyan | `#00C8FF` | Chromatic aberration |

## Font Style
- Bold condensed sans-serif (AI-generated, matches shaw's lockup style)
- Chromatic aberration: pink/cyan fringing on white text
- For code-rendered text fallback: Orbitron (primary), Audiowide (secondary)

## Usage Guidelines
- **Dark backgrounds only**. These assets are designed for dark mode
- **Icon only** for small contexts (favicon, mobile nav, Discord pfp)
- **WAIFU lockup** for navbar / header
- **WAIFU.FUN lockup** for marketing / landing page / social banners
- Transparent versions for overlay on custom backgrounds
- On-black versions ready for direct use

## File Structure
```
final-package/
├── icon/
│   ├── icon_1024.png (transparent)
│   ├── icon_512.png
│   ├── icon_256.png
│   ├── icon_128.png
│   ├── icon_64.png
│   ├── icon_on_black_1024.png
│   ├── icon_on_black_512.png
│   └── icon_on_black_256.png
├── lockup/
│   ├── lockup_waifufun_1920.png (transparent)
│   ├── lockup_waifufun_1024.png
│   ├── lockup_waifufun_512.png
│   ├── lockup_waifufun_256.png
│   ├── lockup_waifufun_on_black_1920.png
│   ├── lockup_waifufun_on_black_1024.png
│   ├── lockup_waifu_1920.png (transparent)
│   ├── lockup_waifu_1024.png
│   ├── lockup_waifu_512.png
│   ├── lockup_waifu_256.png
│   ├── lockup_waifu_on_black_1920.png
│   └── lockup_waifu_on_black_1024.png
├── previews/
│   ├── icon/ (dark + light bg renders)
│   └── lockup/ (dark + light bg renders)
└── BRAND_ASSETS.md
```
