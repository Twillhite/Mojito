const fs = require("node:fs/promises");
const path = require("node:path");
const crypto = require("node:crypto");

const dataDir = path.join(__dirname, "..", "data");
const databasePath = path.join(dataDir, "db.json");
const sampleDatabasePath = path.join(dataDir, "db.example.json");

const defaultDatabase = {
  scenarios: [
    {
      id: "base-scenario",
      name: "Base Case",
      isDefault: true,
      forecastMonths: 180,
      startingCash: 18000,
      startingInvestments: 62000,
      startingRetirement: 30000,
      startingDebt: 26500,
      accountBalances: {
        checking: [{ name: "Main Checking", balance: 9000 }],
        savings: [{ name: "Emergency Fund", balance: 9000 }],
        investments: [{ name: "Brokerage", balance: 62000 }],
        retirement: [{ name: "401(k)", balance: 30000 }],
      },
      liabilityBalances: {
        creditCards: [{ name: "Primary Card", balance: 3500 }],
        carLoans: [{ name: "SUV Loan", balance: 12000 }],
        mortgages: [{ name: "Home Mortgage", balance: 0 }],
        otherLoans: [{ name: "Other Loan 1", balance: 11000 }],
      },
      incomeSources: [
        {
          name: "Salary",
          amount: 3400,
          frequency: "bi-weekly",
          startDate: "2026-03-06",
        },
      ],
      oneTimeIncome: [
        {
          name: "Tax refund",
          amount: 1200,
          date: "2026-05-01",
        },
      ],
      billSources: [
        {
          name: "Housing",
          amount: 2100,
          frequency: "monthly",
          startDate: "2026-03-01",
        },
        {
          name: "Utilities",
          amount: 260,
          frequency: "monthly",
          startDate: "2026-03-01",
        },
        {
          name: "Insurance",
          amount: 280,
          frequency: "monthly",
          startDate: "2026-03-01",
        },
        {
          name: "Subscriptions",
          amount: 110,
          frequency: "monthly",
          startDate: "2026-03-01",
        },
      ],
      oneTimeBills: [
        {
          name: "Annual registration",
          amount: 420,
          date: "2026-07-12",
        },
      ],
      monthlyIncome: 6800,
      monthlyDebtPayment: 600,
      investmentReturn: 6.5,
      incomeGrowth: 3,
      expenseGrowth: 2.5,
      cashReserveTarget: 15000,
      fixedExpenses: {
        housing: 2100,
        utilities: 260,
        insurance: 280,
        subscriptions: 110,
      },
      variableExpensePlan: [
        { month: "2026-04", amount: 1280 },
        { month: "2026-05", amount: 1325 },
        { month: "2026-06", amount: 1450 },
        { month: "2026-07", amount: 1540 },
        { month: "2026-08", amount: 1490 },
        { month: "2026-09", amount: 1360 },
        { month: "2026-10", amount: 1410 },
        { month: "2026-11", amount: 1525 },
        { month: "2026-12", amount: 1780 },
        { month: "2027-01", amount: 1340 },
        { month: "2027-02", amount: 1295 },
        { month: "2027-03", amount: 1380 },
      ],
      historicalSnapshots: [
        { month: "2025-10", cash: 14200, investments: 51100, retirement: 27000, debt: 32200 },
        { month: "2025-11", cash: 15650, investments: 52640, retirement: 28000, debt: 31480 },
        { month: "2025-12", cash: 17100, investments: 54510, retirement: 29000, debt: 30720 },
        { month: "2026-01", cash: 16940, investments: 56280, retirement: 30000, debt: 29940 },
        { month: "2026-02", cash: 17680, investments: 58120, retirement: 31000, debt: 29180 },
        { month: "2026-03", cash: 18000, investments: 62000, retirement: 30000, debt: 26500 },
      ],
    },
  ],
};

async function seedData() {
  await fs.mkdir(dataDir, { recursive: true });
  try {
    await fs.access(databasePath);
  } catch {
    await initializeDatabase();
  }
}

async function readDatabase() {
  const raw = await fs.readFile(databasePath, "utf8");
  return migrateDatabase(JSON.parse(raw));
}

async function writeDatabase(database) {
  await fs.writeFile(databasePath, JSON.stringify(database, null, 2));
}

async function initializeDatabase() {
  try {
    const raw = await fs.readFile(sampleDatabasePath, "utf8");
    const database = migrateDatabase(JSON.parse(raw));
    await writeDatabase(database);
  } catch {
    await writeDatabase(defaultDatabase);
  }
}

async function listScenarios() {
  const database = await readDatabase();
  return database.scenarios;
}

async function getPlan() {
  const scenarios = await listScenarios();
  return scenarios.find((scenario) => scenario.isDefault) || scenarios[0];
}

async function saveScenario(input) {
  const database = await readDatabase();
  const scenario = normalizeScenario(input);
  const existingIndex = database.scenarios.findIndex((item) => item.id === scenario.id);

  if (existingIndex >= 0) {
    database.scenarios[existingIndex] = {
      ...database.scenarios[existingIndex],
      ...scenario,
    };
  } else {
    database.scenarios.push(scenario);
  }

  if (scenario.isDefault) {
    database.scenarios = database.scenarios.map((item) => ({
      ...item,
      isDefault: item.id === scenario.id,
    }));
  }

  await writeDatabase(database);
  return database.scenarios.find((item) => item.id === scenario.id);
}

async function savePlan(input) {
  const currentPlan = await getPlan();
  return saveScenario({
    ...currentPlan,
    ...input,
    id: currentPlan.id,
    name: currentPlan.name,
    isDefault: true,
  });
}

async function importSnapshotsFromCsv(csv) {
  const rows = csv
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (rows.length < 2) {
    return { count: 0, warnings: ["CSV must include a header and at least one data row."] };
  }

  const [header, ...body] = rows;
  const columns = header.split(",").map((column) => column.trim().toLowerCase());
  const monthIndex = columns.indexOf("month");
  const cashIndex = columns.indexOf("cash");
  const investmentsIndex = columns.indexOf("investments");
  const retirementIndex = columns.indexOf("retirement");
  const debtIndex = columns.indexOf("debt");

  if ([monthIndex, cashIndex, investmentsIndex, debtIndex].some((index) => index < 0)) {
    return {
      count: 0,
      warnings: ["Expected headers: month,cash,investments,debt. Optional: retirement"],
    };
  }

  const snapshots = body.map((row) => {
    const values = row.split(",").map((value) => value.trim());
    return {
      month: values[monthIndex],
      cash: Number(values[cashIndex]),
      investments: Number(values[investmentsIndex]),
      retirement: retirementIndex >= 0 ? Number(values[retirementIndex]) : 0,
      debt: Number(values[debtIndex]),
    };
  });

  const database = await readDatabase();
  const activeScenario =
    database.scenarios.find((scenario) => scenario.isDefault) || database.scenarios[0];
  activeScenario.historicalSnapshots = snapshots;

  if (snapshots.length > 0) {
    const latest = snapshots[snapshots.length - 1];
    activeScenario.startingCash = latest.cash;
    activeScenario.startingInvestments = latest.investments;
    activeScenario.startingRetirement = latest.retirement;
    activeScenario.startingDebt = latest.debt;
  }

  await writeDatabase(database);
  return { count: snapshots.length, warnings: [] };
}

function normalizeScenario(input) {
  return {
    id: input.id || slugify(input.name || "Scenario"),
    name: input.name || "Scenario",
    isDefault: Boolean(input.isDefault),
    forecastMonths: Number(input.forecastMonths),
    startingCash: Number(input.startingCash),
    startingInvestments: Number(input.startingInvestments),
    startingRetirement: Number(input.startingRetirement || 0),
    startingDebt: Number(input.startingDebt),
    accountBalances: normalizeAccountBalances(input.accountBalances, input),
    liabilityBalances: normalizeLiabilityBalances(input.liabilityBalances, input),
    incomeSources: normalizeIncomeSources(input.incomeSources, input),
    oneTimeIncome: normalizeOneTimeEntries(input.oneTimeIncome, "One-time income"),
    billSources: normalizeBillSources(input.billSources, input),
    oneTimeBills: normalizeOneTimeEntries(input.oneTimeBills, "One-time bill"),
    monthlyIncome: Number(input.monthlyIncome),
    monthlyDebtPayment: Number(input.monthlyDebtPayment),
    investmentReturn: Number(input.investmentReturn),
    incomeGrowth: Number(input.incomeGrowth),
    expenseGrowth: Number(input.expenseGrowth),
    cashReserveTarget: Number(input.cashReserveTarget),
    fixedExpenses: normalizeFixedExpenses(input.fixedExpenses),
    variableExpensePlan: normalizeVariableExpensePlan(input.variableExpensePlan),
    historicalSnapshots: Array.isArray(input.historicalSnapshots) ? input.historicalSnapshots : [],
  };
}

function migrateDatabase(database) {
  return {
    ...database,
    scenarios: (database.scenarios || []).map(migrateScenario),
  };
}

function migrateScenario(scenario) {
  const fixedExpenses = scenario.fixedExpenses || {};
  const legacyMonthlyExpenses = Number(scenario.monthlyExpenses || 0);
  const normalizedFixedExpenses =
    Object.keys(fixedExpenses).length > 0
      ? normalizeFixedExpenses(fixedExpenses)
      : {
          housing: Math.round(legacyMonthlyExpenses * 0.52),
          utilities: Math.round(legacyMonthlyExpenses * 0.08),
          insurance: Math.round(legacyMonthlyExpenses * 0.07),
          subscriptions: Math.round(legacyMonthlyExpenses * 0.03),
        };
  const normalizedVariableExpensePlan =
    Array.isArray(scenario.variableExpensePlan) && scenario.variableExpensePlan.length > 0
      ? normalizeVariableExpensePlan(scenario.variableExpensePlan)
      : buildDefaultVariablePlan(legacyMonthlyExpenses);

  return {
    ...scenario,
    accountBalances: normalizeAccountBalances(scenario.accountBalances, scenario),
    liabilityBalances: normalizeLiabilityBalances(scenario.liabilityBalances, scenario),
    incomeSources: normalizeIncomeSources(scenario.incomeSources, scenario),
    oneTimeIncome: normalizeOneTimeEntries(scenario.oneTimeIncome, "One-time income"),
    billSources: normalizeBillSources(scenario.billSources, scenario),
    oneTimeBills: normalizeOneTimeEntries(scenario.oneTimeBills, "One-time bill"),
    startingRetirement: Number(scenario.startingRetirement || 0),
    fixedExpenses: normalizedFixedExpenses,
    variableExpensePlan: normalizedVariableExpensePlan,
    historicalSnapshots: Array.isArray(scenario.historicalSnapshots)
      ? scenario.historicalSnapshots.map((snapshot) => ({
          ...snapshot,
          retirement: Number(snapshot.retirement || 0),
        }))
      : [],
  };
}

function normalizeIncomeSources(input, fallbackScenario = {}) {
  const source =
    Array.isArray(input) && input.length > 0
      ? input
      : fallbackScenario.monthlyIncome
        ? [{
            name: "Salary",
            amount: Number(fallbackScenario.monthlyIncome),
            frequency: "monthly",
            startDate: `${(fallbackScenario.historicalSnapshots?.at(-1)?.month || "2026-03")}-01`,
          }]
        : [];

  const normalized = source.map((income, index) => ({
    name: income?.name || `Income ${index + 1}`,
    amount: Number(income?.amount || 0),
    frequency: normalizeIncomeFrequency(income?.frequency),
    startDate: normalizeIncomeStartDate(income?.startDate, fallbackScenario),
  }));

  return normalized.length > 0
    ? normalized
    : [
        {
          name: "Salary",
          amount: 0,
          frequency: "monthly",
          startDate: normalizeIncomeStartDate("", fallbackScenario),
        },
      ];
}

function normalizeIncomeFrequency(value) {
  return ["bi-weekly", "twice-monthly", "monthly"].includes(value)
    ? value
    : "monthly";
}

function normalizeIncomeStartDate(value, fallbackScenario = {}) {
  if (value) {
    return value;
  }

  const fallbackMonth = fallbackScenario.historicalSnapshots?.at(-1)?.month || "2026-03";
  return `${fallbackMonth}-01`;
}

function normalizeBillSources(input, fallbackScenario = {}) {
  const fallbackMonth = normalizeIncomeStartDate("", fallbackScenario);
  const fixedExpenses = fallbackScenario.fixedExpenses || {};
  const variablePlan = Array.isArray(fallbackScenario.variableExpensePlan)
    ? fallbackScenario.variableExpensePlan
    : [];
  const averageVariable =
    variablePlan.length > 0
      ? Math.round(
          variablePlan.reduce((sum, entry) => sum + Number(entry?.amount || 0), 0) / variablePlan.length,
        )
      : 0;

  const legacyFallback = [
    fixedExpenses.housing ? { name: "Housing", amount: Number(fixedExpenses.housing), frequency: "monthly", startDate: fallbackMonth } : null,
    fixedExpenses.utilities ? { name: "Utilities", amount: Number(fixedExpenses.utilities), frequency: "monthly", startDate: fallbackMonth } : null,
    fixedExpenses.insurance ? { name: "Insurance", amount: Number(fixedExpenses.insurance), frequency: "monthly", startDate: fallbackMonth } : null,
    fixedExpenses.subscriptions ? { name: "Subscriptions", amount: Number(fixedExpenses.subscriptions), frequency: "monthly", startDate: fallbackMonth } : null,
    averageVariable ? { name: "Flexible Spending", amount: averageVariable, frequency: "monthly", startDate: fallbackMonth } : null,
  ].filter(Boolean);

  const source =
    Array.isArray(input) && input.length > 0
      ? input
      : legacyFallback.length > 0
        ? legacyFallback
        : [];

  const normalized = source.map((bill, index) => ({
    name: bill?.name || `Bill ${index + 1}`,
    amount: Number(bill?.amount || 0),
    frequency: normalizeIncomeFrequency(bill?.frequency),
    startDate: normalizeIncomeStartDate(bill?.startDate, fallbackScenario),
  }));

  return normalized.length > 0
    ? normalized
    : [
        {
          name: "Bill 1",
          amount: 0,
          frequency: "monthly",
          startDate: fallbackMonth,
        },
      ];
}

function normalizeOneTimeEntries(input, fallbackLabel) {
  const normalized = (Array.isArray(input) ? input : [])
    .map((entry, index) => ({
      name: entry?.name || `${fallbackLabel} ${index + 1}`,
      amount: Number(entry?.amount || 0),
      date: normalizeOneTimeBillDate(entry?.date),
    }))
    .filter((entry) => entry.name || entry.amount !== 0 || entry.date);

  return normalized;
}

function normalizeOneTimeBillDate(value) {
  if (value) {
    return value;
  }

  return "2026-04-01";
}

function normalizeLiabilityBalances(input, fallbackScenario = {}) {
  return {
    creditCards: normalizeAccountCategory(input?.creditCards, [], "Credit Card"),
    carLoans: normalizeAccountCategory(input?.carLoans, [], "Car Loan"),
    mortgages: normalizeAccountCategory(input?.mortgages, [], "Mortgage"),
    otherLoans: normalizeAccountCategory(
      input?.otherLoans,
      fallbackScenario.startingDebt ? [{ name: "Other Loan 1", balance: Number(fallbackScenario.startingDebt) }] : [],
      "Other Loan",
    ),
  };
}

function normalizeAccountBalances(input, fallbackScenario = {}) {
  return {
    checking: normalizeAccountCategory(
      input?.checking,
      fallbackScenario.startingCash ? [{ name: "Main Checking", balance: Number(fallbackScenario.startingCash) }] : [],
      "Checking",
    ),
    savings: normalizeAccountCategory(input?.savings, [], "Savings"),
    investments: normalizeAccountCategory(
      input?.investments,
      fallbackScenario.startingInvestments
        ? [{ name: "Brokerage", balance: Number(fallbackScenario.startingInvestments) }]
        : [],
      "Investment",
    ),
    retirement: normalizeAccountCategory(
      input?.retirement,
      fallbackScenario.startingRetirement
        ? [{ name: "401(k)", balance: Number(fallbackScenario.startingRetirement) }]
        : [],
      "Retirement",
    ),
  };
}

function normalizeAccountCategory(input, fallbackAccounts, fallbackLabel) {
  const source = Array.isArray(input) && input.length > 0 ? input : fallbackAccounts;
  const normalized = source.map((account, index) => ({
    name: account?.name || `${fallbackLabel} ${index + 1}`,
    balance: Number(account?.balance || 0),
  }));
  return normalized.length > 0 ? normalized : [{ name: `${fallbackLabel} 1`, balance: 0 }];
}

function normalizeFixedExpenses(input) {
  return {
    housing: Number(input?.housing || 0),
    utilities: Number(input?.utilities || 0),
    insurance: Number(input?.insurance || 0),
    subscriptions: Number(input?.subscriptions || 0),
  };
}

function normalizeVariableExpensePlan(input) {
  return (Array.isArray(input) ? input : []).slice(0, 12).map((entry, index) => ({
    month: entry?.month || `Month ${index + 1}`,
    amount: Number(entry?.amount || 0),
  }));
}

function buildDefaultVariablePlan(legacyMonthlyExpenses) {
  const fixedPortion = Math.round(legacyMonthlyExpenses * 0.7);
  const variableBase = Math.max(legacyMonthlyExpenses - fixedPortion, 0);
  const templateMonths = [
    "2026-04",
    "2026-05",
    "2026-06",
    "2026-07",
    "2026-08",
    "2026-09",
    "2026-10",
    "2026-11",
    "2026-12",
    "2027-01",
    "2027-02",
    "2027-03",
  ];
  const seasonalMultipliers = [0.95, 1, 1.08, 1.12, 1.05, 0.97, 1, 1.06, 1.22, 0.98, 0.94, 1.02];

  return templateMonths.map((month, index) => ({
    month,
    amount: Math.round(variableBase * seasonalMultipliers[index]),
  }));
}

function slugify(text) {
  return String(text)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "") || crypto.randomUUID();
}

module.exports = {
  seedData,
  getPlan,
  savePlan,
  importSnapshotsFromCsv,
};
