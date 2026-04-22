# Mojito V1 Architecture

This document describes a practical architecture for turning the current prototype into a live, multi-user web app.

## Product framing

Mojito is a personal net-worth planning app that should let a user:

1. store current assets and liabilities
2. define income and expense rules
3. project future cash flow and net worth
4. review historical balances and forecasted outcomes

That means the real system has to do three things well:

- persist sensitive financial data safely
- calculate forecasts predictably and repeatably
- stay flexible as the model becomes more detailed

## Recommended stack

For a realistic V1, use:

- `Next.js`: frontend and app server
- `TypeScript`: shared types between UI and domain logic
- `Postgres`: primary database
- `Prisma` or `Drizzle`: database access and migrations
- `Auth.js`, `Clerk`, or `Supabase Auth`: authentication
- `Vercel`: web hosting
- `Supabase` or `Neon`: managed Postgres

This is a strong default because it is simple enough for V1, but production-ready.

## System layout

Think of Mojito as 4 layers.

### 1. Presentation layer

The frontend should handle:

- account balance entry
- income and expense editing
- forecast settings
- charts and dashboard views

This layer should not contain forecast formulas directly. It should call application/domain functions and render results.

### 2. Application layer

This layer coordinates app use cases:

- save account balances
- save income and expense assumptions
- run a forecast
- fetch dashboard data

Good shape:

- `app/` or `src/app/`: routes and pages
- `src/server/`: server-side actions or API handlers
- `src/use-cases/`: application workflows

### 3. Domain layer

This is the most important layer for Mojito.

It should own:

- net worth calculations
- monthly cash flow rules
- debt payoff logic
- investment growth logic
- forecast timeline generation

Good shape:

- `src/domain/forecast/`
- `src/domain/accounts/`
- `src/domain/income/`
- `src/domain/expenses/`

The forecast engine should be pure and testable: inputs in, outputs out.

### 4. Data layer

This layer should store:

- users
- financial accounts
- liabilities
- recurring rules
- forecast assumptions
- historical balance snapshots

Postgres is the right long-term home for this.

## Core domain model

A clean V1 model might look like this.

### Users

- `users`
  - `id`
  - `email`
  - `created_at`
  - `timezone`

### Accounts

- `accounts`
  - `id`
  - `user_id`
  - `name`
  - `category`
  - `institution_name`
  - `is_active`
  - `created_at`

`category` can start with:

- `checking`
- `savings`
- `investment`
- `retirement`
- `credit_card`
- `car_loan`
- `mortgage`
- `other_loan`

### Account balances

- `account_balances`
  - `id`
  - `account_id`
  - `effective_month`
  - `balance`
  - `source`
  - `created_at`

This gives you historical tracking instead of overwriting one current number forever.

### Income sources

- `income_sources`
  - `id`
  - `user_id`
  - `name`
  - `amount_monthly`
  - `growth_rate_annual`
  - `start_month`
  - `end_month`
  - `income_type`

Possible `income_type` values:

- `salary`
- `bonus`
- `side_income`
- `rental_income`
- `other`

### Fixed expenses

- `fixed_expenses`
  - `id`
  - `user_id`
  - `name`
  - `category`
  - `amount_monthly`
  - `growth_rate_annual`
  - `start_month`
  - `end_month`

### Variable expense plans

- `variable_expense_plans`
  - `id`
  - `user_id`
  - `name`
  - `base_year`

- `variable_expense_plan_items`
  - `id`
  - `plan_id`
  - `month_number`
  - `amount`

This lets a user define a 12-month spending plan that repeats forward with growth assumptions.

### Forecast assumptions

- `forecast_profiles`
  - `id`
  - `user_id`
  - `name`
  - `forecast_months`
  - `investment_return_annual`
  - `income_growth_annual`
  - `expense_growth_annual`
  - `monthly_debt_payment`
  - `created_at`

Even if the UI is single-profile today, this table keeps you future-compatible.

### Forecast runs

- `forecast_runs`
  - `id`
  - `user_id`
  - `forecast_profile_id`
  - `created_at`
  - `summary_json`

- `forecast_run_points`
  - `id`
  - `forecast_run_id`
  - `month_index`
  - `projected_cash`
  - `projected_investments`
  - `projected_retirement`
  - `projected_debt`
  - `projected_net_worth`

For V1, you can compute forecasts on demand and skip persistence if speed is fine. If not, store runs.

## Forecast engine design

The engine should accept one normalized input object, something like:

```ts
type ForecastInput = {
  accounts: AccountSnapshot[];
  incomeSources: IncomeSource[];
  fixedExpenses: FixedExpense[];
  variableExpensePlan: VariableExpensePlan;
  assumptions: ForecastAssumptions;
  startMonth: string;
};
```

And return:

```ts
type ForecastOutput = {
  summary: {
    startingNetWorth: number;
    endingNetWorth: number;
    debtFreeMonth: number | null;
  };
  points: ForecastPoint[];
};
```

Important rule: keep this engine independent from React, routing, and database code.

## Security and privacy

Because this is financial data, plan for this early.

Minimum expectations:

- authenticated access for every user
- row-level ownership checks on all data
- HTTPS everywhere
- encrypted secrets
- audit logging for important updates later

Also:

- do not store bank credentials yourself
- if bank sync is added later, use a provider like `Plaid`

## API shape

If using Next.js, a good initial shape is:

- `GET /api/dashboard`
- `GET /api/accounts`
- `POST /api/accounts`
- `PATCH /api/accounts/:id`
- `DELETE /api/accounts/:id`
- `GET /api/income-sources`
- `POST /api/income-sources`
- `GET /api/expenses`
- `POST /api/expenses`
- `POST /api/forecast/run`

If you prefer server actions, the same use cases still apply.

## Suggested repo structure

```text
src/
  app/
    (dashboard pages and routes)
  components/
    charts/
    forms/
    layout/
  domain/
    accounts/
    expenses/
    forecast/
    income/
  server/
    db/
    auth/
    repositories/
  use-cases/
    accounts/
    forecast/
    income/
    expenses/
  lib/
    formatting/
    dates/
prisma/
  schema.prisma
```

## Delivery plan

Here is the most practical build order.

### Phase 1: Foundation

- create Next.js app with TypeScript
- set up Postgres
- add auth
- create initial schema and migrations
- move current forecast code into `src/domain/forecast`

### Phase 2: Core data entry

- build account CRUD
- build income CRUD
- build expense CRUD
- persist data per user

### Phase 3: Forecasting

- connect normalized database data to the forecast engine
- render dashboard chart and summary cards
- support 2-year and custom forecast windows

### Phase 4: Quality and trust

- add tests for forecast logic
- add validation for user inputs
- add loading/error states
- add audit-friendly event logging

### Phase 5: Nice-to-have growth

- CSV import
- Plaid integration
- multiple forecast profiles
- what-if comparisons
- home value and real estate support

## Technical principles

These are the principles worth protecting as Mojito grows.

### Keep input data normalized

Do not bury everything in one giant JSON blob forever. JSON can be useful at the edges, but the core financial model should be queryable.

### Keep forecasts deterministic

The same input should always produce the same output.

### Separate balances from projections

Historical balances are facts. Forecast points are computed outputs. Do not mix them in one table.

### Make assumptions explicit

Investment return, income growth, and expense growth should always be visible and versionable.

## My recommendation

If we were starting the real build now, I would choose:

- `Next.js`
- `TypeScript`
- `Postgres`
- `Prisma`
- `Clerk` or `Auth.js`
- `Vercel`
- `Supabase` or `Neon`

That is the cleanest path from this prototype to a real product.

## Immediate next step

The best next move is to turn this document into:

1. a real Postgres schema
2. a migration plan from the current JSON prototype
3. a Next.js app scaffold for Mojito V1
