# Mojito

Mojito is a lightweight full-stack budgeting and net-worth forecasting scaffold.
It uses:

- a Node HTTP server with no external dependencies
- a JSON-backed persistence layer
- a forecasting engine for net worth projection
- a browser UI for planning balances, income, bills, and forecasts

## What it does

The app lets you:

- edit a default plan with balances and monthly assumptions
- save the scenario to local persistent storage
- automatically store a balance snapshot for each day you save changes
- project cash, investments, debt, and net worth forward in time
- visualize the forecast in the browser

## Project structure

- `server.js`: HTTP server, API routes, and static file serving
- `src/forecast.js`: forecasting engine
- `src/store.js`: local JSON persistence and CSV import logic
- `web/index.html`: app shell
- `web/styles.css`: styling
- `web/app.js`: browser-side state management and API calls
- `web/forecast-client.js`: client chart rendering helpers
- `data/db.example.json`: safe sample data for sharing or first-time setup
- `data/db.json`: your local persisted data, created on first run and ignored by Git

Each save also records a daily balance snapshot and updates the current month's historical snapshot, so your timeline can build up real history over time.

## Run locally

```bash
node server.js
```

Then open [http://localhost:3000](http://localhost:3000).

## Share Safely

If you put Mojito on GitHub:

- commit `data/db.example.json`
- do not commit `data/db.json`

On a fresh clone, Mojito will automatically create `data/db.json` from the sample file the first time it starts.

## CSV format

Paste CSV data in this shape:

```csv
month,cash,investments,retirement,debt
2026-01,16940,56280,30000,29940
2026-02,17680,58120,31000,29180
2026-03,18000,62000,30000,26500
```

## Suggested next steps

1. Add account-level modeling instead of aggregate balances.
2. Break income into salary, bonus, side income, and retirement contributions.
3. Replace JSON storage with SQLite or Postgres.
4. Add authentication and per-user workspaces.
5. Add multiple forecast scenarios with side-by-side comparison instead of a single active default.
