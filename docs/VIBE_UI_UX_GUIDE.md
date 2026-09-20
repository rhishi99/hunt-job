# Vibe UI/UX Design & Component Ecosystem Guide

> **A curated, ranked operational directory and playbook for vibe coders and AI agents (Claude Code, Antigravity, Cursor) to build high-conversion, visually stunning, and accessible user interfaces.**

---

## Executive Summary & Workflow

To build modern interfaces that create an immediate "wow" factor without sacrificing performance or accessibility, follow the **6-Stage Vibe UI Funnel**:

```
┌─────────────────────────────────────────────────────────────┐
│ 1. FOUNDATION FIRST                                         │
│    shadcn/ui + DESIGN.md (Color tokens, font stacks, layout) │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. VISUAL POLISH & HERO BLOCKS                              │
│    Magic UI / Aceternity (Bento grids, glowing borders)     │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. SPECIALIZED SECTIONS & CONVERSION                        │
│    Navbar Gallery / Footer Design / CTA Gallery / mapcn     │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. FLUID MOTION & MICRO-INTERACTIONS                        │
│    Motion Primitives / Kinetics / Anime.js / MicroKit       │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 5. ASSETS & AMBIENT EFFECTS                                 │
│    3Dicons / Kitbitz / Circle Loaders / Liquid Glass        │
└──────────────────────────────┬──────────────────────────────┘
                               ▼
┌─────────────────────────────────────────────────────────────┐
│ 6. AI PROMPTS & BRAND HARMONY                               │
│    Scrolltide / VibePrompt / Kage / Refero Styles           │
└─────────────────────────────────────────────────────────────┘
```

---

## Ranked Master Directory (30 Tools & Resources)

| Rank | Resource | Actual URL | Category | How AI Agents (Claude / Antigravity) Use It | MCP / CLI Support |
|:----:|----------|------------|----------|----------------------------------------------|:-----------------:|
| **1** | **shadcn/ui** | [ui.shadcn.com](https://ui.shadcn.com) | Core Foundation | Copy-paste accessible primitives or run CLI; ask AI to extend variants using project tokens | **Official CLI** + registry |
| **2** | **Magic UI** | [magicui.design](https://magicui.design) | Motion / Marketing | 150+ animated React/Tailwind blocks (bento grid, marquee, globe, sparkles, border beam) | **Official MCP** + CLI |
| **3** | **Aceternity UI** | [ui.aceternity.com](https://ui.aceternity.com) | Hero & 3D Blocks | 200+ bold animated components (lamp hero, 3D card, background beams, tracing beam) | Supported via `ui-registry-mcp` |
| **4** | **Motion Primitives** | [motion-primitives.com](https://motion-primitives.com) | Gesture & Interaction | Advanced interactions: fluid carousels, spring modals, expandable cards, morphing cursor | CLI (`npx`) |
| **5** | **UIAble** | [uiable.com](https://uiable.com) | Extended shadcn | Open-source components expanding shadcn ecosystem; copy and generate variants | shadcn-compatible |
| **6** | **Uiverse** | [uiverse.io](https://uiverse.io) | Micro-Widgets | Thousands of community-created CSS/Tailwind buttons, checkboxes, cards, and toggles | Copy-paste snippets |
| **7** | **mapcn** | [github.com/AnmolSaini16/mapcn](https://github.com/AnmolSaini16/mapcn) | Specialized UI (Maps) | Copy-paste React map components built on MapLibre (custom markers, routes, popups) | shadcn-style CLI |
| **8** | **DESIGNmd** | [designmd.ai](https://designmd.ai) | AI Design Systems | Hundreds of design systems formatted as markdown `DESIGN.md` files for agent ingestion | **Skills + MCP Server** |
| **9** | **Refero Styles** | [styles.refero.design](https://styles.refero.design) | Brand & Styling | 2,000+ real product design systems with typography scales, colors, and token files | **Full MCP Server** |
| **10** | **Scrolltide** | [scrolltide.co](https://www.scrolltide.co) | Master Prompts | 600+ structured prompts for 3D, scrollytelling, and animated interactive templates | Prompt Library |
| **11** | **VibePrompt** | [vibeprompts.io](https://vibeprompts.io) | Visual Prompts | Structured prompts tailored for SaaS dashboards, landing pages, and complex admin UIs | Prompt Library |
| **12** | **Kage** | [github.com/MengTo/kage](https://github.com/MengTo/kage) | Cinematic Prompts | UI inspiration mapped directly to `PROMPT.md` for scrolly cinematic landing flows | Prompt Library |
| **13** | **Kinetics** | [kinetics.colorion.co](https://kinetics.colorion.co) | Spring Physics | 150+ spring-physics motion curves with React/CSS code and prompt formulas | Code + Prompts |
| **14** | **Component Gallery** | [component.gallery](https://component.gallery) | Design Pattern Benchmarks | 2,600+ real examples showing how top design systems (Linear, Stripe, Apple) implement elements | Benchmark Reference |
| **15** | **Minimal Gallery** | [minimal.gallery](https://minimal.gallery) | Inspiration | Curated high-end minimal websites; provide screenshot/URL to AI to extract layout rhythm | Inspiration Gallery |
| **16** | **Navbar Gallery** | [navbar.gallery](https://www.navbar.gallery) | Navigation Inspiration | Curated gallery of responsive headers, floating pills, mega-menus, and blur docks | Inspiration Gallery |
| **17** | **Footer Design** | [footer.design](https://www.footer.design) | Footer Architecture | Curated directory of well-architected footers, compliance badges, and sitemaps | Inspiration Gallery |
| **18** | **CTA Gallery** | [cta.gallery](https://cta.gallery) | Conversion Optimization | Conversion-optimized call-to-action blocks, modal triggers, and form checkouts | Inspiration Gallery |
| **19** | **404s** | Curated 404 collections | Error States | Creative 404 pages with games, easter eggs, and user-retaining navigation | Inspiration Gallery |
| **20** | **AppShot Gallery** | [appshot.gallery](https://appshot.gallery) | Mobile UI | Real-world iOS & Android app screenshots for mobile web and responsive adaptations | Inspiration Gallery |
| **21** | **Liquid Glass** | Refraction Glass Shaders | Ambient Effects | Dynamic glass refraction, caustic overlays, and frosted acrylic backdrops | CSS / Shaders |
| **22** | **MicroKit UI** | Micro-Interactions | Tactile Feedback | Micro-interactions for button clicks, switches, hover states, and input focus rings | CSS / Tailwind |
| **23** | **CSS Text Effects** | Text Effect Collections | Typography Effects | Animated text effects (glowing text, gradient fills, typewriter, wavy headline reveals) | Pure CSS / Tailwind |
| **24** | **Circle Loaders** | SVG Loader Collections | Feedback Indicators | 24 modern SVG circular loaders and spinner rings for seamless async states | Inline SVG / CSS |
| **25** | **Gradient Buttons** | Gradient Collections | Action Conversion | Copy-paste CSS gradient buttons with animated shimmer and radiant glow borders | CSS / Tailwind |
| **26** | **Kitbitz** | Illustration Library | Empty States & Onboarding | 2,000+ free hand-drawn vector illustrations for empty states, success screens, and banners | SVG / PNG Assets |
| **27** | **3Dicons** | [3dicons.co](https://3dicons.co) | Spatial UI Accents | High-res open-source 3D icons for bento grid cards, landing headers, and stats tiles | PNG / GLTF Assets |
| **28** | **Anime.js** | [animejs.com](https://animejs.com) | DOM Animation Engine | Lightweight JavaScript animation engine for sequenced timeline choreographies | NPM Package |
| **29** | **OpenMotion** | [openmotion.design](https://openmotion.design) | Motion Demos | AI tool to create and edit interactive product demos and animated workflows | Tool + Code Export |
| **30** | **ui-registry-mcp** | UI Registry MCP Server | Component Aggregator | Bridges multiple component registries (shadcn, Aceternity, etc.) directly into AI agents | **MCP Server** |

---

## Detailed Category Breakdown & Agent Recipes

### 1. Foundation: Architecture & Design Tokens

Start every project by placing a `DESIGN.md` in the project root and configuring standard tokens.

#### Recommended Setup:
```bash
# Initialize shadcn/ui in React + Vite / Next.js
npx shadcn@latest init

# Add accessible primitives
npx shadcn@latest add button dialog dropdown-menu tooltip sheet
```

#### Token Setup (`DESIGN.md` Reference):
```css
:root {
  /* Surface colors */
  --bg-primary: #0a0f1d;
  --bg-secondary: #111827;
  --bg-card: #131d31;
  --bg-card-hover: #1a2742;

  /* Borders */
  --border-subtle: #1e293b;
  --border-prominent: #334155;

  /* Accents & Status */
  --accent-cyan: #06b6d4;
  --accent-cyan-glow: rgba(6, 182, 212, 0.15);
  --status-emerald: #10b981;
  --status-amber: #f59e0b;
  --status-rose: #ef4444;

  /* Typography */
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', monospace;
}
```

---

### 2. High-Impact Motion Blocks (Magic UI & Aceternity)

#### Magic UI Components
Install and add components directly via CLI:
```bash
# Add animated bento grid
npx magicui-cli@latest add bento-grid

# Add marquee ticker
npx magicui-cli@latest add marquee

# Add animated border beam
npx magicui-cli@latest add border-beam

# Add particle globe
npx magicui-cli@latest add globe
```

#### Agent Prompt Recipe:
> *"Create a 3-column Bento Grid for our dashboard using Magic UI components. Align the card backgrounds to `--bg-card` (#131d31) and border to `--border-subtle` (#1e293b). Add a subtle `BorderBeam` effect around the active subscription card with cyan accent glow."*

---

### 3. Specialized Layouts & Conversion Modules

| Section | Recommended Resource | Key Implementation Principle |
|---------|----------------------|------------------------------|
| **Navigation** | [Navbar Gallery](https://navbar.gallery) | Floating pill bar with `backdrop-filter: blur(12px)`, sticky positioning, and keyboard navigation. |
| **Footer** | [Footer Design](https://footer.design) | Symmetrical 4-column layout, status badge ("All systems operational"), copyright, and newsletter capture. |
| **Conversion CTA** | [CTA Gallery](https://cta.gallery) | High contrast, guarantee micro-copy, social proof avatars, and single primary action. |
| **Interactive Maps** | [mapcn](https://github.com/AnmolSaini16/mapcn) | Vector map tiles with custom interactive SVG markers and popup tooltips. |
| **Error Handling** | 404 Collections | Helpful search bar, list of popular links, and a direct "Return to Dashboard" action button. |

---

### 4. Tactile Motion & Micro-Interactions (Emil Kowalski Philosophy)

Modern polish comes from invisible physical realism:

1. **Avoid `transition: all`:** Always specify animateable properties (`transform`, `opacity`, `background-color`).
2. **Spring Physics over Linear:** Use `cubic-bezier(0.16, 1, 0.3, 1)` or spring constants for responsive snaps.
3. **Active State Response:** Every clickable element must scale down subtly on click (`transform: scale(0.97)`).
4. **Natural Entry Transitions:** Scale from `0.95` with opacity `0` to `1.0` with opacity `1`. Never pop from `scale(0)`.

```css
/* Tactile button micro-interaction */
.btn-vibe {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.625rem 1.25rem;
  font-weight: 500;
  font-size: 0.875rem;
  border-radius: 0.5rem;
  background: var(--accent-cyan);
  color: #0a0f1d;
  transition: transform 150ms cubic-bezier(0.16, 1, 0.3, 1),
              box-shadow 150ms cubic-bezier(0.16, 1, 0.3, 1),
              opacity 150ms ease-out;
}

.btn-vibe:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 20px var(--accent-cyan-glow);
}

.btn-vibe:active {
  transform: scale(0.97);
}

.btn-vibe:focus-visible {
  outline: 2px solid var(--accent-cyan);
  outline-offset: 2px;
}
```

---

### 5. AI MCP Server Configurations

Add these server configurations to your agent's MCP configuration (`mcp_config.json` or IDE MCP settings) to provide automated component inspection and token generation:

```json
{
  "mcpServers": {
    "magicui": {
      "command": "npx",
      "args": ["-y", "@magicui/mcp-server"]
    },
    "refero": {
      "command": "npx",
      "args": ["-y", "refero-mcp-server"]
    },
    "designmd": {
      "command": "npx",
      "args": ["-y", "designmd-mcp@latest"]
    },
    "ui-registry": {
      "command": "npx",
      "args": ["-y", "ui-registry-mcp@latest"]
    }
  }
}
```

---

## Agent Usage Quick Reference

| When you want to... | Use this tool/command |
|---------------------|-----------------------|
| Scaffold base UI | `npx shadcn@latest add ...` + check `DESIGN.md` |
| Add a dazzling landing hero | Aceternity UI `background-beams` or Magic UI `globe` |
| Build modern feature grid | Magic UI `bento-grid` + 3Dicons |
| Review interactive feel | Kinetics spring curves + Emil Kowalski tactile review table |
| Build navigation header | Reference [Navbar Gallery](https://navbar.gallery) |
| Boost form conversions | Reference [CTA Gallery](https://cta.gallery) |
| Add empty state illustrations | Kitbitz vector graphics |
| Clean up loading jank | Circle Loaders SVG + skeleton geometry matching |
