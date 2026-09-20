# Hunt-Job — Fable Question Swarm Harness

A token-efficient, deep architectural audit harness reverse-engineered from NxBagger's question swarm protocol. It organizes autonomous agents (Claude Code, Antigravity, or Codex) into focused slices to discover high-leverage architectural flaws, unhandled edge cases, unenforced safety invariants, and missing feedback loops across `hunt-job`.

---

## File Structure

```text
scratch/_lab/fable_qs/
├── _brief.md                     # Master shared brief: Rules, ground truths, method, and Q-schema
├── p_A_scanning.md               # Slice A: ATS Ingestion, Scanner Engine & Portal Health
├── p_B_evaluation_synthesis.md   # Slice B: AI Scoring, 10-Dim Rubric, ATS Resumes & Prep
├── p_C_autofill_browser.md       # Slice C: Auto-Fill Engine, Browser Automation & Form Safety
├── p_D_state_lifecycle.md        # Slice D: SQLite State, Tracking & Feedback Loops
├── p_E_architecture_ops.md       # Slice E: Unattended Watch Daemons, Dashboard & Technical Debt
└── README.md                     # Execution guide
```

---

## How to Run with Claude Code

You can point Claude Code to run each slice independently. For each slice, the agent deep-reads the files, discovers 8–12 hard questions, attempts Pass-2 resolution, and outputs the report.

### Slice A (Scanner Engine & ATS Ingestion)
```bash
claude "Read scratch/_lab/fable_qs/_brief.md and scratch/_lab/fable_qs/p_A_scanning.md. Follow the brief and slice instructions exactly. Write your full report to scratch/_lab/fable_qs/r_A_scanning.md and finish with the exact summary line."
```

### Slice B (AI Evaluation & Synthesis)
```bash
claude "Read scratch/_lab/fable_qs/_brief.md and scratch/_lab/fable_qs/p_B_evaluation_synthesis.md. Follow the brief and slice instructions exactly. Write your full report to scratch/_lab/fable_qs/r_B_evaluation_synthesis.md and finish with the exact summary line."
```

### Slice C (Auto-Fill & Browser Safety)
```bash
claude "Read scratch/_lab/fable_qs/_brief.md and scratch/_lab/fable_qs/p_C_autofill_browser.md. Follow the brief and slice instructions exactly. Write your full report to scratch/_lab/fable_qs/r_C_autofill_browser.md and finish with the exact summary line."
```

### Slice D (SQLite State & Feedback Loops)
```bash
claude "Read scratch/_lab/fable_qs/_brief.md and scratch/_lab/fable_qs/p_D_state_lifecycle.md. Follow the brief and slice instructions exactly. Write your full report to scratch/_lab/fable_qs/r_D_state_lifecycle.md and finish with the exact summary line."
```

### Slice E (Daemons, Dashboard & Tech Debt)
```bash
claude "Read scratch/_lab/fable_qs/_brief.md and scratch/_lab/fable_qs/p_E_architecture_ops.md. Follow the brief and slice instructions exactly. Write your full report to scratch/_lab/fable_qs/r_E_architecture_ops.md and finish with the exact summary line."
```

---

## Pass 3: Synthesis & Roadmap Integration

Once the slice reports (`r_A_*.md` through `r_E_*.md`) are populated:
1. Synthesize surviving `UNANSWERED` and `PARTIAL` questions into `scratch/_lab/fable_qs/pass3_notes.md`.
2. Categorize items into:
   - **SOLVED-P1 / P2 / P3:** Direct code fixes.
   - **BACKLOG:** Non-urgent improvements for `change_bug_tracker/ROADMAP.json`.
   - **FRONTIER MODEL / SENIOR ARCHITECT:** Core architectural decisions requiring deep trade-off resolution.
