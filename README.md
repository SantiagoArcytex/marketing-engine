# Marketing Intelligence Engine

A desktop **Marketing Intelligence Engine** built with Tauri: a local intelligence platform for marketing research (ads, patterns, email verification, strategy). All operations run on your machine for privacy and cost savings.

## Features

- **Ad Explorer** — Search and view scraped ads; filter by hook, emotion, offer; pattern stats and D3 charts.
- **Funnel Analyzer** — Placeholder for reconstructing competitor funnels (ad → landing → offer → CTA).
- **Email Intelligence** — Single and bulk email verification (syntax, DNS/MX, disposable detection); results in SQLite.
- **Strategy Orchestrator** — Data-driven strategy report from ads, patterns, and verified emails (MCP-style tooling).
- **Copywriting Generator** — Template-based ad copy variants from hooks and offers.
- **Competitor Radar** — Placeholder for tracking companies and change alerts.

## Prerequisites

- **Node.js** (v18+)
- **Rust** (stable, 1.76+; 1.85+ recommended for latest deps)
- **npm** or yarn

Install Rust: [rustup](https://rustup.rs/)

## Setup

```bash
# Install frontend dependencies
npm install

# Development (Rust backend + Vite frontend)
npm run tauri dev
```

## Build (release)

```bash
npm run tauri build
```

Outputs platform installers under `src-tauri/target/release/bundle/` (e.g. `.dmg`, `.exe`, `.AppImage`).

## Project structure

- **Frontend** (root): React + Vite + TypeScript, Tailwind CSS, MUI, D3, ag-grid. Entry: `src/App.tsx`, `index.html`.
- **Backend** (`src-tauri/`): Rust app. Commands in `lib.rs`; modules: `db`, `scrape`, `analysis`, `email_verify`, `strategy_agent`.
- **Data**: SQLite DB in app data dir (`engine.db`). Tables: `ads`, `verified_emails`.

## Usage

1. **Ad Explorer** — Enter a keyword and click “Scrape ads” (demo data for now). Click “Analyze patterns” to fill hook/emotion/offer. Use filters and charts.
2. **Email Intelligence** — Enter an email and “Verify”, or a file path (one email per line) for bulk. View results in the table.
3. **Strategy Orchestrator** — Enter a focus query and “Run agent” to get a markdown report (optimal strategy + takeaways).
4. **Copywriting Generator** — Enter hook/offer and “Generate variants” for template copy.

## Testing

```bash
# Rust unit/integration tests
cd src-tauri && cargo test
```

## Architecture (high level)

- **IPC**: Frontend calls Rust via Tauri `invoke('command_name', { ... })`.
- **Storage**: SQLite (rusqlite) for ads and verified emails; DB path from Tauri app data dir.
- **Scraping**: reqwest (HTTP), scraper (HTML), headless_chrome (optional). Demo flow in Phase 2.
- **Email verification**: regex (syntax), trust-dns-resolver (MX), static disposable list.
- **Strategy agent**: In-process “tools” (query ads, pattern stats, verified emails) → markdown report.

## License

Use and modify as needed for your project.
