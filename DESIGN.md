# Design Specification — Hunt-Job

Companion to [PRODUCT.md](./PRODUCT.md). This specification defines the visual grammar, component library, interaction states, and design tokens for the Hunt-Job ecosystem.

---

## North Star: The Tactical Command Center

Hunt-Job is an engineering instrument. It is designed for density, speed, and high visual contrast without sensory overload. The interface reports objective facts, displays exact score provenance, and enables instant 1-click actions.

### Core Visual Principles

1. **Information Density with Breathing Room:** Dense tables with clear visual hierarchy, subtle borders, and monospace tabular numbers.
2. **Deterministic Color Semantics:**
   - **Emerald Green (`#10b981`):** Strong match / Score $\ge 4.0$ / Applied success.
   - **Amber Gold (`#f59e0b`):** Moderate match / Score $3.0 - 3.9$ / In-review status.
   - **Rose Crimson (`#ef4444`):** Poor fit / Score $< 3.0$ / Dealbreaker triggered / Discarded.
   - **Cyan Accent (`#06b6d4`):** Active interactive focus, fresh tag indicator, primary buttons.
3. **No Decorative Distractions:** Every pixel either conveys status, metadata, or provides an immediate action.

---

## Design Tokens

### Color Palette (Dark Theme Default)

```css
:root {
  --bg-primary: #0a0f1d;
  --bg-secondary: #111827;
  --bg-tertiary: #1f2937;
  --bg-card: #131d31;
  --bg-card-hover: #1a2742;

  --border-subtle: #1e293b;
  --border-prominent: #334155;

  --text-primary: #f8fafc;
  --text-secondary: #94a3b8;
  --text-muted: #64748b;

  --accent-cyan: #06b6d4;
  --accent-cyan-glow: rgba(6, 182, 212, 0.15);

  --status-green: #10b981;
  --status-green-bg: rgba(16, 185, 129, 0.12);
  --status-amber: #f59e0b;
  --status-amber-bg: rgba(245, 158, 11, 0.12);
  --status-red: #ef4444;
  --status-red-bg: rgba(239, 68, 68, 0.12);

  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  --font-mono: 'JetBrains Mono', 'Fira Code', ui-monospace, monospace;
}
```

---

## Key Components

### 1. Stats & Metrics Strip
- Displays 4 core KPI metrics:
  1. Total Tracked Jobs
  2. Fresh Listings (< 48h)
  3. Evaluated Candidates
  4. Active Applications Pipeline
- Clean numeric cards with subtle glowing top border on hover.

### 2. Pipeline Kanban Board
- Columns: **Scanned** $\to$ **Evaluated** $\to$ **Applied** $\to$ **Interview** $\to$ **Offer** $\to$ **Rejected**.
- Job cards inside columns display:
  - Company logo / initial badge + Company name
  - Role title with truncation protection
  - Location chip (`Remote`, `Bengaluru`, etc.)
  - Match score pill (`4.4` in green)
  - Quick action menu (Move column, View JD, Generate Resume, Auto-fill Apply)

### 3. All Jobs Filterable Table
- Real-time instant search across company, title, tech stack keywords.
- Score threshold filter dropdown (`≥ 4.0`, `≥ 3.0`, `All`).
- Freshness filter (`All time`, `Last 2 days`, `Last week`, `Last 2 weeks`, `Last 4 weeks`).
- Column sort on Company, Title, Score, and Posted Date.

### 4. Job Evaluation Drawer / Modal
- Detailed breakdown of the 10 evaluation dimensions.
- Visual score bars / chips for:
  - Tech Stack Match
  - Salary Expectations
  - Culture & Growth
  - Remote / Work-Life Balance
- Key strengths bullet points + detected mismatches / dealbreaker flags.

---

## Interaction & Motion

- **Transitions:** Quick and sharp (`transition: all 120ms cubic-bezier(0.4, 0, 0.2, 1)`).
- **Hover feedback:** Subtle background lightening and crisp border glow.
- **Table Row Click:** Opens full job detail sliding drawer without interrupting scroll position.
