# DevOps × AI Portfolio Pitch — Rhishikesh Patil

**Use:** talking points for recruiter calls, cover letters, LinkedIn "About", and the "tell me about a project" interview question. Positions 15 years of DevOps against the 2026 market, where the differentiator is *building* AI-agent infrastructure, not *using* a chatbot.

---

## 1. One-line positioning

> Staff-level DevOps engineer, 15 years across AWS infra, CI/CD, IaC, containers and large-scale platform migrations — now building the layer underneath AI agents: multi-agent orchestration, LLM routing and failover, MCP servers, sandboxed agent runtimes, and token-cost engineering.

**Short version for a headline:** *DevOps engineer building production AI-agent infrastructure.*

---

## 2. The 2026 edge — why this portfolio reads differently

Most "AI on the resume" in 2026 is *"I use Copilot / ChatGPT."* This portfolio shows the infrastructure work that sits one level down — the part companies now need staffed:

| 2026 hiring signal | Evidence in this portfolio |
|---|---|
| **Agent orchestration** (multi-step, multi-role LLM pipelines) | `recorder-agentic-os` (script→voice→edit→upload→monitor loop), `nanoclaw` (per-agent Docker/micro-VM isolation), `hermes-socio-growth` (find→draft→approve ritual), `ComboCoder` (Planner→Architect→Engineer→Reviewer SOP) |
| **LLM reliability engineering** (routing, failover, rate-limit survival) | `free-claude-code` (Anthropic API → NVIDIA NIM / OpenRouter / LM Studio proxy), `hermes-model-auto-switch` (cron job that keeps a working free-tier model configured as providers throttle/retire, with health checks + atomic config rewrite) |
| **MCP (Model Context Protocol) servers** — the integration standard of 2026 | `agy-headless-bridge` (MCP server published to PyPI + the MCP registry), `TradeAiWay` (TradingView MCP fork) |
| **Agent sandboxing / isolation** — the security story for autonomous agents | `nanoclaw` (each agent in its own Docker sandbox / micro-VM), `clipguard` (user-session agent + SYSTEM service + watchdog, signed policy pull, JSONL audit) |
| **FinOps for AI** — token cost is the new cloud bill | `rtk-windows` (token-reduction CLI wrapper for coding-agent sessions), token-compression baked into `video-with-ai` and `recorder-agentic-os` |
| **AI wired into real delivery pipelines** | `automation_n8n` + `career-ops`/`hunt-job` (LLM job-scoring and resume tailoring inside a scheduled pipeline), `VerdictPro` / `NeuroTempo` (Gemini calls behind a provider-adapter pattern with Terraform-managed infra) |

**Interview line:** *"I didn't just adopt AI tools — I built the plumbing that makes agents run reliably and cheaply in production: model failover, MCP integration, sandboxed execution, and cost controls."*

---

## 3. Flagship projects — sustained work (not weekend hacks)

These have 40+ commits or 60+ files and ongoing maintenance. Lead with these.

### DevOps depth

| Project | DevOps story | Scale signal |
|---|---|---|
| **NxBagger** | Full AWS deploy — EC2 / CloudFront / S3 / SSM / **IAM OIDC** (no static keys), GitHub Actions `security → test → build → deploy`, **cost-scheduled instance** (stop/start on a timer to cut spend) | 453 commits, 1,100+ files |
| **mandi_intelligence** | 6 deploy workflows (infra / backend / frontend / android-build / sync-data / **destroy-resources**), docker-compose, cloud IaC, offline-first sync | 308 commits, 413 files |
| **legendAiTrade** | Dockerfile + prod/infra compose, CI + deploy to **Oracle Cloud ARM**, Celery + Redis + Postgres, Alembic migrations, request-pacing / rate-gatekeeper | 82 commits, 214 files |
| **VerdictPro** | Real Terraform — `infra/` modules with staging/prod `tfvars` + committed `tfplan`, CI + `deploy-staging`, Vercel/Railway targets | 183 commits, 549 files |
| **DevOps-Architect** | 20-chapter DevOps reference site + working example manifests across k8s, Terraform, Ansible, Prometheus, GitOps, SRE, **FinOps** — doubles as a teaching artifact | curriculum repo |

### AI-infrastructure depth

| Project | AI-infra story | Status |
|---|---|---|
| **career-ops** → **hunt-job** | Multi-agent job-search pipeline built *on Claude Code*: 10-dimension LLM job scoring, ATS resume tailoring, interview-prep generation. 8 CI workflows (CodeQL, SBOM, dependency-review, release-please). `hunt-job` is my extended fork — added SQLite job store, direct ATS JSON providers (Greenhouse/Lever/Ashby/SmartRecruiters/Recruitee/Workable), scanner v2, browser auto-fill apply, local dashboard, watch mode | 134 commits upstream; fork active |
| **free-claude-code** | Proxy that lets Claude Code run against NVIDIA NIM / OpenRouter / LM Studio instead of the Anthropic API — FastAPI, httpx, containerised, CI, self-hosted. Model-fallback core + Riva voice + Discord bot | 467-commit fork, extended |
| **recorder-agentic-os** | "One line in → finished edited tutorial video out." Agentic orchestrator: scriptwriter (Gemini 3.1 Pro via `agy`) → local Kokoro TTS → clip capture (OBS) → edit (ffmpeg/OpenCV) → YouTube upload → stats-feedback loop | 176 commits, 795 files |
| **nanoclaw** | Personal Claude assistant that runs **each agent in its own Docker sandbox / micro-VM**; WhatsApp + cron entry points; CI with version-bump + skills-merge; context-budgeting | 323 commits, OSS |
| **hermes-socio-growth** | Daily automation: surface high-signal X posts, AI-draft replies (NVIDIA NIM), push to Telegram for **manual approval** (human-in-the-loop), revise/learn loop; Windows Task Scheduler + Chrome DevTools bridge + health/e2e checks | 50 commits, 512 files |
| **agy-headless-bridge** | Gives the Antigravity CLI a pty so it emits output from non-TTY / CI contexts; ships an **MCP server** (`agy_ask` / `agy_research`) — published to PyPI and the MCP registry; 3 workflows (test, PyPI publish, MCP registry) | published |
| **hermes-model-auto-switch** | Cron job (every 15 min) that keeps a working free-tier coding model configured as providers throttle or retire models — NIM health checks, atomic config rewrite, SWE-score gating, a "what worked" learning DB, CI, Pages docs | published |
| **claude-code-voice / OutLoud** | On-demand + auto TTS speaker plugin for Claude Code / Grok Build (edge-tts), zero extra tokens; published Claude Code plugin with CI and docs | published `rhishi99/OutLoud` |

---

## 4. Side / weekend projects (clearly labeled)

Real, working, but built in a weekend or as an experiment — mention as *breadth* and *curiosity*, not as flagship engineering.

**AI experiments (weekend):**
- **llm-council** — query a "council" of LLMs via OpenRouter, anonymised cross-ranking, a "Chairman" model writes the final answer (Karpathy-style Saturday hack).
- **ComboCoder / FreeAgentDev** — local 4-agent pair programmer (MetaGPT-style SOP) on free LLM APIs with provider fallback.
- **automodel** — multi-provider LLM routing config (Groq / NVIDIA / OpenRouter free tiers), per-role model + rate limits.
- **TradeAiWay** — workspace bundling a TradingView MCP fork + an AI indicator-training experiment.
- **antigravity-rotator** / **antigravity-quota-ext** — utilities for swapping Gemini/Antigravity auth accounts and tracking quota.
- **rtk-windows** — porting a token-optimising CLI wrapper ("Rust Token Killer") to Windows.
- **indie-bedtime-story-app** — React PWA bedtime stories with Azure Cognitive Services narration.
- **video-with-ai** / **productivity** — programmatic video generation (Remotion + Gemini CLI + LTX-Video).
- **ai-interactive-story** — single-file LLM interactive fiction.

**DevOps / infra experiments (weekend):**
- **NeuroTempo** — "Neural Task Flow" productivity app; notable for the DevOps: `infrastructure/` Terraform, GH Actions `ci` + `web-deploy` (Pages) + `deploy-infra` (AWS), Gemini task decomposition.
- **clipguard** — Windows clipboard AI paste-guard; session agent + SYSTEM service + watchdog, signed policy pull, JSONL audit (medium maturity, weekend origin).
- **VerdictPro_claude** — cleaner serverless-first rebuild scaffold of VerdictPro.
- **n8n-vertex-kit** — drop-in kit to run n8n in Docker wired to Google Vertex AI credentials.
- **breeze_api / stock-alert-bot** — market dashboards / Telegram bots on the ICICI Breeze API with GH Actions CI.

**Domain / analysis projects (weekend, non-infra):** `NxBagger` aside, the trading-research repos — `5x-5yr` (multibagger forensic framework), `sipdate_v0.1`, `options-trade`, `dhan_wapasi` (IEPF unclaimed-shares finder), `Alert-Money` (read-only PnL Telegram sentinel), `ITR-Fill` (tax-return automation).

---

## 5. Skill → proof map (for filling application forms)

| Claim | Backed by |
|---|---|
| AWS infra as code, least-privilege | NxBagger (IAM OIDC, SSM), mandi_intelligence, VerdictPro (Terraform tfvars/tfplan) |
| CI/CD pipeline design | NxBagger (`security→test→build→deploy`), career-ops (8 workflows), mandi_intelligence (6), agy-headless-bridge (test→publish→registry) |
| Containers & orchestration | legendAiTrade (compose, Celery workers), nanoclaw (per-agent Docker/micro-VM), free-claude-code |
| Terraform / IaC | VerdictPro, NeuroTempo, VerdictPro_claude, DevOps-Architect examples |
| Cost / FinOps | NxBagger (cost-scheduled instances), rtk-windows + token-compression work, DevOps-Architect FinOps chapter |
| Observability | NxBagger + legendAiTrade (health/e2e checks), New Relic at CDK Global |
| Automation / scheduled jobs | hermes-model-auto-switch (15-min cron), hermes-socio-growth (Task Scheduler), automation_n8n, hunt-job watch mode |
| LLM API integration & reliability | free-claude-code, hermes-model-auto-switch, automodel, VerdictPro provider-adapter |
| Agent orchestration | recorder-agentic-os, nanoclaw, ComboCoder, hermes-socio-growth |
| MCP servers | agy-headless-bridge (published), TradeAiWay |
| Human-in-the-loop / safe autonomy | hermes-socio-growth (approval gate), hunt-job (never auto-submits), clipguard (block/redact) |
| Open-source / publishing | agy-headless-bridge (PyPI + MCP registry), OutLoud (Claude Code plugin), hermes-model-auto-switch, nanoclaw |

---

## 6. Ready-to-use pitch lines

- **Opening:** *"15 years in DevOps — AWS, CI/CD, IaC, containers, and I've led migrations touching 70+ engineers. The last two years I've been building AI-agent infrastructure: the routing, sandboxing, MCP integration and cost controls that make agents production-safe."*
- **On depth vs hype:** *"My AI work isn't prompt-writing. It's a proxy that fails an LLM call over to three backup providers, a cron job that swaps models when a provider retires one, an MCP server on PyPI, and agents that each run in their own micro-VM."*
- **On DevOps fundamentals:** *"NxBagger runs the deploy pattern I'd bring to a team — OIDC instead of static AWS keys, a security gate before build, and instances that stop themselves off-hours to cut the bill."*
- **On leadership:** *"At CDK Global I mentored 70+ engineers on branching strategy and led cross-functional migrations — Puppet→Ansible, Bamboo→GitHub, Ansible Tower→AWX."*
- **On learning velocity:** *"Roughly 30 side projects in the last two years — most are weekends, a dozen are sustained. The pattern is: hit a limit in my own workflow, build the tool, sometimes publish it."*

---

*Generated 2026-09-02 from a survey of 40 repos under `E:\vibe-code-projects\`. Full raw table: `scratchpad/repo-survey.md`.*
