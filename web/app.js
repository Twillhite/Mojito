import {
  drawBarChart,
  drawMultiLineChart,
  drawTimelineChart,
  formatCurrency,
} from "/forecast-client.js";

const form = document.getElementById("scenarioForm");
const saveButton = document.getElementById("saveButton");
const metrics = document.getElementById("metrics");
const historyTable = document.getElementById("historyTable");
const chart = document.getElementById("chart");
const homeChart = document.getElementById("homeChart");
const chartKicker = document.getElementById("chartKicker");
const chartTitle = document.getElementById("chartTitle");
const selectedNetWorthDate = document.getElementById("selectedNetWorthDate");
const selectedNetWorthSummary = document.getElementById("selectedNetWorthSummary");
const selectedDateHelper = document.getElementById("selectedDateHelper");
const selectedDateBalances = document.getElementById("selectedDateBalances");
const investmentAccountList = document.getElementById("investmentAccountList");
const cashAccountList = document.getElementById("cashAccountList");
const debtAccountList = document.getElementById("debtAccountList");
const incomeList = document.getElementById("incomeList");
const oneTimeIncomeList = document.getElementById("oneTimeIncomeList");
const incomeTransactionsTable = document.getElementById("incomeTransactionsTable");
const billList = document.getElementById("billList");
const oneTimeBillList = document.getElementById("oneTimeBillList");
const billTransactionsTable = document.getElementById("billTransactionsTable");
const addIncomeButton = document.getElementById("addIncomeButton");
const addOneTimeIncomeButton = document.getElementById("addOneTimeIncomeButton");
const addBillButton = document.getElementById("addBillButton");
const addOneTimeBillButton = document.getElementById("addOneTimeBillButton");
const openAddAccountModalButton = document.getElementById("openAddAccountModal");
const addAccountModal = document.getElementById("addAccountModal");
const newAccountType = document.getElementById("newAccountType");
const confirmAddAccountButton = document.getElementById("confirmAddAccount");
const cancelAddAccountButton = document.getElementById("cancelAddAccount");
const navLinks = Array.from(document.querySelectorAll(".nav-link"));
const contentSections = Array.from(document.querySelectorAll(".content-section"));
const netWorthFilterInputs = Array.from(
  document.querySelectorAll("[data-net-worth-filter]"),
);

const ACCOUNT_TYPE_META = {
  checking: { rootKey: "accountBalances", label: "Checking" },
  savings: { rootKey: "accountBalances", label: "Savings" },
  investments: { rootKey: "accountBalances", label: "Investments" },
  retirement: { rootKey: "accountBalances", label: "Retirement" },
  creditCards: { rootKey: "liabilityBalances", label: "Credit Card" },
  carLoans: { rootKey: "liabilityBalances", label: "Car Loan" },
  mortgages: { rootKey: "liabilityBalances", label: "Mortgage" },
  otherLoans: { rootKey: "liabilityBalances", label: "Other Loan" },
};

let state = {
  plan: null,
  forecast: null,
  activeSection: "home",
  netWorthExplorerPoints: [],
  selectedNetWorthPointId: null,
  hoveredNetWorthPointId: null,
  netWorthGraphFilters: {
    cash: true,
    investments: true,
    retirement: true,
    realEstate: true,
    auto: true,
    debt: true,
  },
};

function monthKeyToDate(monthKey) {
  const [year, month] = String(monthKey).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentDateKey() {
  return new Date().toISOString().slice(0, 10);
}

function dateKeyToUtcDate(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysUtc(date, days) {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days),
  );
}

function addMonthsPreservingDayUtc(date, months) {
  const targetMonth = date.getUTCMonth() + months;
  const year = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const day = Math.min(date.getUTCDate(), daysInMonth(new Date(Date.UTC(year, month, 1))));
  return new Date(Date.UTC(year, month, day));
}

function differenceInDaysUtc(left, right) {
  return Math.round((right - left) / 86400000);
}

function interpolateNumber(left, right, ratio) {
  return left + (right - left) * ratio;
}

function interpolateBalances(left, right, ratio) {
  return {
    cash: interpolateNumber(Number(left.cash || 0), Number(right.cash || 0), ratio),
    investments: interpolateNumber(
      Number(left.investments || 0),
      Number(right.investments || 0),
      ratio,
    ),
    retirement: interpolateNumber(
      Number(left.retirement || 0),
      Number(right.retirement || 0),
      ratio,
    ),
    homeValue: interpolateNumber(
      Number(left.homeValue || 0),
      Number(right.homeValue || 0),
      ratio,
    ),
    autoValue: interpolateNumber(Number(left.autoValue || 0), Number(right.autoValue || 0), ratio),
    debt: interpolateNumber(Number(left.debt || 0), Number(right.debt || 0), ratio),
  };
}

function sumTransactionsByDate(transactions, startDateKey, endDateKey) {
  return (Array.isArray(transactions) ? transactions : []).reduce((map, transaction) => {
    const dateKey = String(transaction?.date || "");
    if (!dateKey || dateKey < startDateKey || dateKey > endDateKey) {
      return map;
    }

    map.set(dateKey, (map.get(dateKey) || 0) + Number(transaction.amount || 0));
    return map;
  }, new Map());
}

function buildDailyCashForecastMap() {
  const startDate = dateKeyToUtcDate(currentDateKey());
  const endDate = addMonthsPreservingDayUtc(
    startDate,
    Math.min(Number(state.plan?.forecastMonths || 0), Math.max((state.forecast?.points?.length || 1) - 1, 0)),
  );
  const startDateKey = isoDate(addDaysUtc(startDate, 1));
  const endDateKey = isoDate(endDate);

  const incomeByDate = sumTransactionsByDate(buildIncomeTransactions(state.plan), startDateKey, endDateKey);
  const billsByDate = sumTransactionsByDate(buildBillTransactions(state.plan), startDateKey, endDateKey);
  let runningCash = Number(state.plan?.startingCash || 0);
  const dailyCash = new Map();

  for (
    let cursor = addDaysUtc(startDate, 1);
    isoDate(cursor) <= endDateKey;
    cursor = addDaysUtc(cursor, 1)
  ) {
    const dateKey = isoDate(cursor);
    runningCash += incomeByDate.get(dateKey) || 0;
    runningCash -= billsByDate.get(dateKey) || 0;
    dailyCash.set(dateKey, runningCash);
  }

  return dailyCash;
}

function filteredNetWorthValue(balances = {}) {
  const filters = state.netWorthGraphFilters;
  return (
    (filters.cash ? Number(balances.cash || 0) : 0) +
    (filters.investments ? Number(balances.investments || 0) : 0) +
    (filters.retirement ? Number(balances.retirement || 0) : 0) +
    (filters.realEstate ? Number(balances.homeValue || 0) : 0) +
    (filters.auto ? Number(balances.autoValue || 0) : 0) -
    (filters.debt ? Number(balances.debt || 0) : 0)
  );
}

function hasVisibleHistoricalNetWorthValue(balances = {}) {
  return filteredNetWorthValue(balances) !== 0;
}

function planningAnchorMonth(scenario = state.plan) {
  const latestHistoricalMonth = scenario?.historicalSnapshots?.at(-1)?.month || "2026-03";
  const current = currentMonthKey();
  return latestHistoricalMonth > current ? latestHistoricalMonth : current;
}

function addMonths(date, months) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
}

function startOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function endOfMonth(date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function daysInMonth(date) {
  return endOfMonth(date).getUTCDate();
}

function dateFromInput(value, fallbackMonth) {
  if (value) {
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }

  const fallback = monthKeyToDate(fallbackMonth);
  return new Date(Date.UTC(fallback.getUTCFullYear(), fallback.getUTCMonth(), 1));
}

function isoDate(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function formatDateLabel(dateKey) {
  const [year, month, day] = String(dateKey).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day || 1));
  return String(dateKey).length > 7
    ? date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        timeZone: "UTC",
      })
    : date.toLocaleDateString("en-US", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      });
}

function normalizeIncomeFrequency(value) {
  return ["bi-weekly", "twice-monthly", "monthly"].includes(value)
    ? value
    : "monthly";
}

function fallbackIncomeStartDate() {
  const fallbackMonth = planningAnchorMonth(state.plan);
  return `${fallbackMonth}-01`;
}

function incomeFrequencyLabel(value) {
  return {
    "bi-weekly": "Bi-weekly",
    "twice-monthly": "Twice a month",
    monthly: "Monthly",
  }[normalizeIncomeFrequency(value)];
}

function fallbackBillStartDate() {
  return fallbackIncomeStartDate();
}

function incomeOccurrencesForMonth(source, targetMonthDate, fallbackMonth) {
  const startDate = dateFromInput(source.startDate, fallbackMonth);
  const monthEnd = endOfMonth(targetMonthDate);

  if (source.frequency === "bi-weekly") {
    const monthStart = startOfMonth(targetMonthDate);
    const diffDays = Math.floor((monthStart - startDate) / 86400000);
    let cycle = Math.max(Math.floor(diffDays / 14), 0);
    let paymentDate = new Date(startDate);
    paymentDate.setUTCDate(startDate.getUTCDate() + cycle * 14);

    while (paymentDate < monthStart) {
      paymentDate = new Date(paymentDate);
      paymentDate.setUTCDate(paymentDate.getUTCDate() + 14);
    }

    let count = 0;
    while (paymentDate <= monthEnd) {
      count += 1;
      paymentDate = new Date(paymentDate);
      paymentDate.setUTCDate(paymentDate.getUTCDate() + 14);
    }
    return count;
  }

  if (source.frequency === "twice-monthly") {
    const fifteenth = new Date(
      Date.UTC(targetMonthDate.getUTCFullYear(), targetMonthDate.getUTCMonth(), 15),
    );
    const lastDay = new Date(
      Date.UTC(
        targetMonthDate.getUTCFullYear(),
        targetMonthDate.getUTCMonth(),
        daysInMonth(targetMonthDate),
      ),
    );

    let count = 0;
    if (fifteenth >= startDate) {
      count += 1;
    }
    if (lastDay >= startDate) {
      count += 1;
    }
    return count;
  }

  const paymentDay = Math.min(startDate.getUTCDate(), daysInMonth(targetMonthDate));
  const paymentDate = new Date(
    Date.UTC(targetMonthDate.getUTCFullYear(), targetMonthDate.getUTCMonth(), paymentDay),
  );
  return paymentDate >= startDate ? 1 : 0;
}

function incomeForMonthFromSources(scenario, monthOffset = 0) {
  return totalTransactionAmountForMonth(buildIncomeTransactions(scenario), scenario, monthOffset);
}

function buildIncomeTransactions(scenario) {
  const sources = normalizeIncomeSources(scenario?.incomeSources || []);
  const fallbackMonth = planningAnchorMonth(scenario);
  const anchorMonth = monthKeyToDate(fallbackMonth);
  const forecastMonths = Number(scenario?.forecastMonths || 0);
  const incomeGrowth = Number(scenario?.incomeGrowth || 0);
  const transactions = [];

  sources.forEach((source) => {
    const sourceIndex = sources.indexOf(source);
    const startDate = dateFromInput(source.startDate, fallbackMonth);

    for (let monthOffset = 0; monthOffset <= forecastMonths; monthOffset += 1) {
      const targetMonthDate = addMonths(anchorMonth, monthOffset);
      const monthStart = startOfMonth(targetMonthDate);
      const monthEnd = endOfMonth(targetMonthDate);
      const grownAmount =
        Number(source.amount || 0) * Math.pow(1 + incomeGrowth / 100, monthOffset / 12);

      if (source.frequency === "bi-weekly") {
        const diffDays = Math.floor((monthStart - startDate) / 86400000);
        let cycle = Math.max(Math.floor(diffDays / 14), 0);
        let paymentDate = new Date(startDate);
        paymentDate.setUTCDate(startDate.getUTCDate() + cycle * 14);

        while (paymentDate < monthStart) {
          paymentDate = new Date(paymentDate);
          paymentDate.setUTCDate(paymentDate.getUTCDate() + 14);
        }

        while (paymentDate <= monthEnd) {
          transactions.push({
            id: `income:recurring:${sourceIndex}:${isoDate(paymentDate)}`,
            kind: "recurring",
            date: isoDate(paymentDate),
            source: source.name,
            frequency: source.frequency,
            amount: grownAmount,
          });
          paymentDate = new Date(paymentDate);
          paymentDate.setUTCDate(paymentDate.getUTCDate() + 14);
        }
        continue;
      }

      if (source.frequency === "twice-monthly") {
        const fifteenth = new Date(
          Date.UTC(targetMonthDate.getUTCFullYear(), targetMonthDate.getUTCMonth(), 15),
        );
        const lastDay = new Date(
          Date.UTC(
            targetMonthDate.getUTCFullYear(),
            targetMonthDate.getUTCMonth(),
            daysInMonth(targetMonthDate),
          ),
        );

        [fifteenth, lastDay].forEach((paymentDate) => {
          if (paymentDate >= startDate) {
            transactions.push({
              id: `income:recurring:${sourceIndex}:${isoDate(paymentDate)}`,
              kind: "recurring",
              date: isoDate(paymentDate),
              source: source.name,
              frequency: source.frequency,
              amount: grownAmount,
            });
          }
        });
        continue;
      }

      const paymentDay = Math.min(startDate.getUTCDate(), daysInMonth(targetMonthDate));
      const paymentDate = new Date(
        Date.UTC(targetMonthDate.getUTCFullYear(), targetMonthDate.getUTCMonth(), paymentDay),
      );

      if (paymentDate >= startDate) {
        transactions.push({
          id: `income:recurring:${sourceIndex}:${isoDate(paymentDate)}`,
          kind: "recurring",
          date: isoDate(paymentDate),
          source: source.name,
          frequency: source.frequency,
          amount: grownAmount,
        });
      }
    }
  });

  return applyTransactionOverrides(
    [
      ...transactions,
      ...normalizeOneTimeEntries(scenario?.oneTimeIncome || [], "One-time income").map(
        (income, index) => ({
          id: `income:one-time:${index}`,
          kind: "one-time",
          date: income.date,
          source: income.name,
          frequency: "one-time",
          amount: income.amount,
        }),
      ),
    ],
    scenario?.incomeTransactionOverrides,
  );
}

function oneTimeAmountForMonth(entries, scenario, monthOffset = 0) {
  const fallbackMonth = planningAnchorMonth(scenario);
  const targetMonthDate = addMonths(monthKeyToDate(fallbackMonth), monthOffset);
  const targetMonthKey = `${targetMonthDate.getUTCFullYear()}-${String(targetMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;

  return normalizeOneTimeEntries(entries || [], "Entry").reduce((sum, entry) => {
    const entryMonthKey = String(entry.date || "").slice(0, 7);
    return sum + (entryMonthKey === targetMonthKey ? Number(entry.amount || 0) : 0);
  }, 0);
}

function billForMonthFromSources(scenario, monthOffset = 0) {
  return totalTransactionAmountForMonth(buildBillTransactions(scenario), scenario, monthOffset);
}

function buildBillTransactions(scenario) {
  const sources = normalizeBillSources(scenario?.billSources || []);
  const fallbackMonth = planningAnchorMonth(scenario);
  const anchorMonth = monthKeyToDate(fallbackMonth);
  const forecastMonths = Number(scenario?.forecastMonths || 0);
  const expenseGrowth = Number(scenario?.expenseGrowth || 0);
  const transactions = [];

  sources.forEach((bill) => {
    const sourceIndex = sources.indexOf(bill);
    const startDate = dateFromInput(bill.startDate, fallbackMonth);

    for (let monthOffset = 0; monthOffset <= forecastMonths; monthOffset += 1) {
      const targetMonthDate = addMonths(anchorMonth, monthOffset);
      const monthStart = startOfMonth(targetMonthDate);
      const monthEnd = endOfMonth(targetMonthDate);
      const grownAmount =
        Number(bill.amount || 0) * Math.pow(1 + expenseGrowth / 100, monthOffset / 12);

      if (bill.frequency === "bi-weekly") {
        const diffDays = Math.floor((monthStart - startDate) / 86400000);
        let cycle = Math.max(Math.floor(diffDays / 14), 0);
        let paymentDate = new Date(startDate);
        paymentDate.setUTCDate(startDate.getUTCDate() + cycle * 14);

        while (paymentDate < monthStart) {
          paymentDate = new Date(paymentDate);
          paymentDate.setUTCDate(paymentDate.getUTCDate() + 14);
        }

        while (paymentDate <= monthEnd) {
          transactions.push({
            id: `bill:recurring:${sourceIndex}:${isoDate(paymentDate)}`,
            kind: "recurring",
            date: isoDate(paymentDate),
            source: bill.name,
            frequency: bill.frequency,
            amount: grownAmount,
          });
          paymentDate = new Date(paymentDate);
          paymentDate.setUTCDate(paymentDate.getUTCDate() + 14);
        }
        continue;
      }

      if (bill.frequency === "twice-monthly") {
        const fifteenth = new Date(
          Date.UTC(targetMonthDate.getUTCFullYear(), targetMonthDate.getUTCMonth(), 15),
        );
        const lastDay = new Date(
          Date.UTC(
            targetMonthDate.getUTCFullYear(),
            targetMonthDate.getUTCMonth(),
            daysInMonth(targetMonthDate),
          ),
        );

        [fifteenth, lastDay].forEach((paymentDate) => {
          if (paymentDate >= startDate) {
            transactions.push({
              id: `bill:recurring:${sourceIndex}:${isoDate(paymentDate)}`,
              kind: "recurring",
              date: isoDate(paymentDate),
              source: bill.name,
              frequency: bill.frequency,
              amount: grownAmount,
            });
          }
        });
        continue;
      }

      const paymentDay = Math.min(startDate.getUTCDate(), daysInMonth(targetMonthDate));
      const paymentDate = new Date(
        Date.UTC(targetMonthDate.getUTCFullYear(), targetMonthDate.getUTCMonth(), paymentDay),
      );

      if (paymentDate >= startDate) {
        transactions.push({
          id: `bill:recurring:${sourceIndex}:${isoDate(paymentDate)}`,
          kind: "recurring",
          date: isoDate(paymentDate),
          source: bill.name,
          frequency: bill.frequency,
          amount: grownAmount,
        });
      }
    }
  });

  return applyTransactionOverrides(
    [
      ...transactions,
      ...normalizeOneTimeEntries(scenario?.oneTimeBills || [], "One-time bill").map((bill, index) => ({
        id: `bill:one-time:${index}`,
        kind: "one-time",
        date: bill.date,
        source: bill.name,
        frequency: "one-time",
        amount: bill.amount,
      })),
    ],
    scenario?.billTransactionOverrides,
  );
}

function normalizeTransactionOverrides(overrides) {
  return (Array.isArray(overrides) ? overrides : [])
    .map((entry) => ({
      id: String(entry?.id || ""),
      date: String(entry?.date || ""),
      amount: Number(entry?.amount || 0),
    }))
    .filter((entry) => entry.id && entry.date);
}

function applyTransactionOverrides(transactions, overrides) {
  const overrideMap = new Map(
    normalizeTransactionOverrides(overrides).map((entry) => [entry.id, entry]),
  );

  return transactions
    .map((transaction) => {
      const override = overrideMap.get(transaction.id);
      return override
        ? {
            ...transaction,
            date: override.date,
            amount: Number(override.amount),
          }
        : transaction;
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

function totalTransactionAmountForMonth(transactions, scenario, monthOffset = 0) {
  const fallbackMonth = planningAnchorMonth(scenario);
  const targetMonthDate = addMonths(monthKeyToDate(fallbackMonth), monthOffset);
  const targetMonthKey = `${targetMonthDate.getUTCFullYear()}-${String(targetMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;

  return transactions.reduce((sum, transaction) => {
    const transactionMonthKey = String(transaction.date || "").slice(0, 7);
    return sum + (transactionMonthKey === targetMonthKey ? Number(transaction.amount || 0) : 0);
  }, 0);
}

function formDataToScenario() {
  const entries = Array.from(new FormData(form).entries());
  const scenario = {
    incomeSources: [],
    oneTimeIncome: [],
    billSources: [],
    oneTimeBills: [],
    accountBalances: {
      checking: [],
      savings: [],
      investments: [],
      retirement: [],
    },
    liabilityBalances: {
      creditCards: [],
      carLoans: [],
      mortgages: [],
      otherLoans: [],
    },
  };

  entries.forEach(([key, value]) => {
    if (key.startsWith("accountBalances.")) {
      const [, category, index, field] = key.split(".");
      const accountIndex = Number(index);
      scenario.accountBalances[category] = scenario.accountBalances[category] || [];
      scenario.accountBalances[category][accountIndex] =
        scenario.accountBalances[category][accountIndex] || {};
      scenario.accountBalances[category][accountIndex][field] =
        field === "balance" ? parseCurrencyInput(value) : value;
      return;
    }

    if (key.startsWith("incomeSources.")) {
      const [, index, field] = key.split(".");
      const incomeIndex = Number(index);
      scenario.incomeSources[incomeIndex] = scenario.incomeSources[incomeIndex] || {};
      scenario.incomeSources[incomeIndex][field] =
        field === "amount" ? Number(value) : value;
      return;
    }

    if (key.startsWith("oneTimeIncome.")) {
      const [, index, field] = key.split(".");
      const incomeIndex = Number(index);
      scenario.oneTimeIncome[incomeIndex] = scenario.oneTimeIncome[incomeIndex] || {};
      scenario.oneTimeIncome[incomeIndex][field] =
        field === "amount" ? Number(value) : value;
      return;
    }

    if (key.startsWith("billSources.")) {
      const [, index, field] = key.split(".");
      const billIndex = Number(index);
      scenario.billSources[billIndex] = scenario.billSources[billIndex] || {};
      scenario.billSources[billIndex][field] =
        field === "amount" ? Number(value) : value;
      return;
    }

    if (key.startsWith("oneTimeBills.")) {
      const [, index, field] = key.split(".");
      const billIndex = Number(index);
      scenario.oneTimeBills[billIndex] = scenario.oneTimeBills[billIndex] || {};
      scenario.oneTimeBills[billIndex][field] =
        field === "amount" ? Number(value) : value;
      return;
    }

    if (key.startsWith("liabilityBalances.")) {
      const [, category, index, field] = key.split(".");
      const accountIndex = Number(index);
      scenario.liabilityBalances[category] = scenario.liabilityBalances[category] || [];
      scenario.liabilityBalances[category][accountIndex] =
        scenario.liabilityBalances[category][accountIndex] || {};
      scenario.liabilityBalances[category][accountIndex][field] =
        field === "balance" ? parseCurrencyInput(value) : value;
      return;
    }

    scenario[key] =
      key === "startingDebt" ||
      key === "homeValue" ||
      key === "mortgageBalance" ||
      key === "autoValue" ||
      key === "autoLoanBalance"
        ? parseCurrencyInput(value)
        : Number(value);
  });

  scenario.incomeSources = normalizeIncomeSources(scenario.incomeSources);
  scenario.oneTimeIncome = normalizeOneTimeEntries(scenario.oneTimeIncome, "One-time income");
  scenario.billSources = normalizeBillSources(scenario.billSources);
  scenario.oneTimeBills = normalizeOneTimeEntries(scenario.oneTimeBills, "One-time bill");
  scenario.monthlyIncome = incomeForMonthFromSources(scenario, 0);
  scenario.monthlyExpenses = billForMonthFromSources(scenario, 0);
  const enteredMortgageBalance = Number(scenario.mortgageBalance || 0);
  const enteredAutoLoanBalance = Number(scenario.autoLoanBalance || 0);
  scenario.accountBalances = normalizeClientAccountBalances(scenario.accountBalances);
  scenario.liabilityBalances = normalizeClientLiabilityBalances(scenario.liabilityBalances);
  scenario.mortgageBalance =
    sumAccountCategory(scenario.liabilityBalances.mortgages) || enteredMortgageBalance;
  scenario.autoLoanBalance =
    sumAccountCategory(scenario.liabilityBalances.carLoans) || enteredAutoLoanBalance;
  scenario.liabilityBalances.mortgages = syncMortgageLiabilityEntries(
    scenario.liabilityBalances.mortgages,
    scenario.mortgageBalance,
  );
  scenario.liabilityBalances.carLoans = syncAutoLoanLiabilityEntries(
    scenario.liabilityBalances.carLoans,
    scenario.autoLoanBalance,
  );
  scenario.startingCash =
    sumAccountCategory(scenario.accountBalances.checking) +
    sumAccountCategory(scenario.accountBalances.savings);
  scenario.startingInvestments = sumAccountCategory(scenario.accountBalances.investments);
  scenario.startingRetirement = sumAccountCategory(scenario.accountBalances.retirement);
  scenario.startingDebt =
    sumAccountCategory(scenario.liabilityBalances.creditCards) +
    sumAccountCategory(scenario.liabilityBalances.carLoans) +
    sumAccountCategory(scenario.liabilityBalances.mortgages) +
    sumAccountCategory(scenario.liabilityBalances.otherLoans);

  return scenario;
}

function setFormValues(scenario) {
  Object.entries(scenario).forEach(([key, value]) => {
    if (
      key === "incomeSources" ||
      key === "oneTimeIncome" ||
      key === "billSources" ||
      key === "oneTimeBills" ||
      key === "accountBalances" ||
      key === "liabilityBalances"
    ) {
      return;
    }
    if (form.elements[key]) {
      form.elements[key].value =
        key === "startingDebt" ||
        key === "homeValue" ||
        key === "mortgageBalance" ||
        key === "autoValue" ||
        key === "autoLoanBalance"
          ? formatCurrency(value)
          : value;
    }
  });

  renderIncomeSources(scenario.incomeSources || []);
  renderOneTimeIncome(scenario.oneTimeIncome || []);
  renderBillSources(scenario.billSources || []);
  renderOneTimeBills(scenario.oneTimeBills || []);
  renderAccountList(scenario.accountBalances || {}, scenario.liabilityBalances || {});
}

function normalizeIncomeSources(incomeSources) {
  const normalized = (Array.isArray(incomeSources) ? incomeSources : [])
    .map((income, index) => ({
      name: income?.name || `Income ${index + 1}`,
      amount: Number(income?.amount || 0),
      frequency: normalizeIncomeFrequency(income?.frequency),
      startDate: income?.startDate || fallbackIncomeStartDate(),
    }))
    .filter(
      (income) => income.name || income.amount !== 0 || income.startDate || income.frequency,
    );

  return normalized.length > 0
    ? normalized
    : [
        {
          name: "Salary",
          amount: 0,
          frequency: "monthly",
          startDate: fallbackIncomeStartDate(),
        },
      ];
}

function sumIncomeSources(incomeSources) {
  return (Array.isArray(incomeSources) ? incomeSources : []).reduce(
    (sum, income) => sum + Number(income?.amount || 0),
    0,
  );
}

function normalizeBillSources(billSources) {
  const normalized = (Array.isArray(billSources) ? billSources : [])
    .map((bill, index) => ({
      name: bill?.name || `Bill ${index + 1}`,
      amount: Number(bill?.amount || 0),
      frequency: normalizeIncomeFrequency(bill?.frequency),
      startDate: bill?.startDate || fallbackBillStartDate(),
    }))
    .filter((bill) => bill.name || bill.amount !== 0 || bill.startDate || bill.frequency);

  return normalized.length > 0
    ? normalized
    : [
        {
          name: "Bill 1",
          amount: 0,
          frequency: "monthly",
          startDate: fallbackBillStartDate(),
        },
      ];
}

function normalizeOneTimeEntries(entries, fallbackLabel) {
  return (Array.isArray(entries) ? entries : [])
    .map((entry, index) => ({
      name: entry?.name || `${fallbackLabel} ${index + 1}`,
      amount: Number(entry?.amount || 0),
      date: entry?.date || fallbackBillStartDate(),
    }))
    .filter((entry) => entry.name || entry.amount !== 0 || entry.date);
}

function renderIncomeSources(incomeSources) {
  const normalized = normalizeIncomeSources(incomeSources);
  incomeList.innerHTML = normalized
    .map(
      (income, index) => `
        <div class="account-row schedule-row">
          <label>
            <input
              class="account-name-input"
              name="incomeSources.${index}.name"
              type="text"
              form="scenarioForm"
              value="${escapeHtml(income.name)}"
            />
          </label>
          <label>
            <select
              class="account-name-input"
              name="incomeSources.${index}.frequency"
              form="scenarioForm"
            >
              <option value="bi-weekly" ${income.frequency === "bi-weekly" ? "selected" : ""}>Bi-weekly</option>
              <option value="twice-monthly" ${income.frequency === "twice-monthly" ? "selected" : ""}>Twice a month</option>
              <option value="monthly" ${income.frequency === "monthly" ? "selected" : ""}>Monthly</option>
            </select>
          </label>
          <label>
            <input
              class="account-name-input"
              name="incomeSources.${index}.startDate"
              type="date"
              form="scenarioForm"
              value="${income.startDate}"
            />
          </label>
          <label>
            <input
              class="account-balance-input"
              name="incomeSources.${index}.amount"
              type="number"
              step="100"
              form="scenarioForm"
              value="${income.amount}"
            />
          </label>
          <button
            type="button"
            class="remove-account-button icon-action-button"
            data-duplicate-income-index="${index}"
            aria-label="Duplicate income"
            title="Duplicate income"
          >
            <span aria-hidden="true">&#x2398;</span>
          </button>
          <button
            type="button"
            class="remove-account-button icon-action-button"
            data-remove-income-index="${index}"
            aria-label="Delete income"
            title="Delete income"
          >
            <span aria-hidden="true">&#128465;</span>
          </button>
        </div>
      `,
    )
    .join("");
}

function renderOneTimeIncome(oneTimeIncome) {
  const normalized = normalizeOneTimeEntries(oneTimeIncome, "One-time income");
  oneTimeIncomeList.innerHTML = normalized
    .map(
      (income, index) => `
        <div class="account-row one-time-row">
          <label>
            <input
              class="account-name-input"
              name="oneTimeIncome.${index}.name"
              type="text"
              form="scenarioForm"
              value="${escapeHtml(income.name)}"
            />
          </label>
          <label>
            <input
              class="account-name-input"
              name="oneTimeIncome.${index}.date"
              type="date"
              form="scenarioForm"
              value="${income.date}"
            />
          </label>
          <label>
            <input
              class="account-balance-input"
              name="oneTimeIncome.${index}.amount"
              type="number"
              step="25"
              form="scenarioForm"
              value="${income.amount}"
            />
          </label>
          <button
            type="button"
            class="remove-account-button icon-action-button"
            data-duplicate-one-time-income-index="${index}"
            aria-label="Duplicate one-time income"
            title="Duplicate one-time income"
          >
            <span aria-hidden="true">&#x2398;</span>
          </button>
          <button
            type="button"
            class="remove-account-button icon-action-button"
            data-remove-one-time-income-index="${index}"
            aria-label="Delete one-time income"
            title="Delete one-time income"
          >
            <span aria-hidden="true">&#128465;</span>
          </button>
        </div>
      `,
    )
    .join("");
}

function renderBillSources(billSources) {
  const normalized = normalizeBillSources(billSources);
  billList.innerHTML = normalized
    .map(
      (bill, index) => `
        <div class="account-row schedule-row">
          <label>
            <input
              class="account-name-input"
              name="billSources.${index}.name"
              type="text"
              form="scenarioForm"
              value="${escapeHtml(bill.name)}"
            />
          </label>
          <label>
            <select
              class="account-name-input"
              name="billSources.${index}.frequency"
              form="scenarioForm"
            >
              <option value="bi-weekly" ${bill.frequency === "bi-weekly" ? "selected" : ""}>Bi-weekly</option>
              <option value="twice-monthly" ${bill.frequency === "twice-monthly" ? "selected" : ""}>Twice a month</option>
              <option value="monthly" ${bill.frequency === "monthly" ? "selected" : ""}>Monthly</option>
            </select>
          </label>
          <label>
            <input
              class="account-name-input"
              name="billSources.${index}.startDate"
              type="date"
              form="scenarioForm"
              value="${bill.startDate}"
            />
          </label>
          <label>
            <input
              class="account-balance-input"
              name="billSources.${index}.amount"
              type="number"
              step="25"
              form="scenarioForm"
              value="${bill.amount}"
            />
          </label>
          <button
            type="button"
            class="remove-account-button icon-action-button"
            data-duplicate-bill-index="${index}"
            aria-label="Duplicate bill"
            title="Duplicate bill"
          >
            <span aria-hidden="true">&#x2398;</span>
          </button>
          <button
            type="button"
            class="remove-account-button icon-action-button"
            data-remove-bill-index="${index}"
            aria-label="Delete bill"
            title="Delete bill"
          >
            <span aria-hidden="true">&#128465;</span>
          </button>
        </div>
      `,
    )
    .join("");
}

function renderOneTimeBills(oneTimeBills) {
  const normalized = normalizeOneTimeEntries(oneTimeBills, "One-time bill");
  oneTimeBillList.innerHTML = normalized
    .map(
      (bill, index) => `
        <div class="account-row one-time-row">
          <label>
            <input
              class="account-name-input"
              name="oneTimeBills.${index}.name"
              type="text"
              form="scenarioForm"
              value="${escapeHtml(bill.name)}"
            />
          </label>
          <label>
            <input
              class="account-name-input"
              name="oneTimeBills.${index}.date"
              type="date"
              form="scenarioForm"
              value="${bill.date}"
            />
          </label>
          <label>
            <input
              class="account-balance-input"
              name="oneTimeBills.${index}.amount"
              type="number"
              step="25"
              form="scenarioForm"
              value="${bill.amount}"
            />
          </label>
          <button
            type="button"
            class="remove-account-button icon-action-button"
            data-duplicate-one-time-bill-index="${index}"
            aria-label="Duplicate one-time bill"
            title="Duplicate one-time bill"
          >
            <span aria-hidden="true">&#x2398;</span>
          </button>
          <button
            type="button"
            class="remove-account-button icon-action-button"
            data-remove-one-time-bill-index="${index}"
            aria-label="Delete one-time bill"
            title="Delete one-time bill"
          >
            <span aria-hidden="true">&#128465;</span>
          </button>
        </div>
      `,
    )
    .join("");
}

function normalizeClientAccountBalances(accountBalances) {
  return {
    checking: normalizeClientAccountCategory(accountBalances.checking, "Checking"),
    savings: normalizeClientAccountCategory(accountBalances.savings, "Savings"),
    investments: normalizeClientAccountCategory(accountBalances.investments, "Investment"),
    retirement: normalizeClientAccountCategory(accountBalances.retirement, "Retirement"),
  };
}

function normalizeClientLiabilityBalances(liabilityBalances) {
  return {
    creditCards: normalizeClientAccountCategory(liabilityBalances.creditCards, "Credit Card"),
    carLoans: normalizeClientAccountCategory(liabilityBalances.carLoans, "Car Loan"),
    mortgages: normalizeClientAccountCategory(liabilityBalances.mortgages, "Mortgage"),
    otherLoans: normalizeClientAccountCategory(liabilityBalances.otherLoans, "Other Loan"),
  };
}

function syncMortgageLiabilityEntries(mortgages, mortgageBalance) {
  const normalized = normalizeClientAccountCategory(mortgages, "Mortgage");
  return [
    {
      name: normalized[0]?.name || "Primary Mortgage",
      balance: Number(mortgageBalance || 0),
    },
  ];
}

function syncAutoLoanLiabilityEntries(carLoans, autoLoanBalance) {
  const normalized = normalizeClientAccountCategory(carLoans, "Car Loan");
  return [
    {
      name: normalized[0]?.name || "Primary Auto Loan",
      balance: Number(autoLoanBalance || 0),
    },
  ];
}

function normalizeClientAccountCategory(accounts, fallbackLabel) {
  return (Array.isArray(accounts) ? accounts : [])
    .map((account, index) => ({
      name: account?.name || `${fallbackLabel} ${index + 1}`,
      balance: Number(account?.balance || 0),
    }))
    .filter((account) => account.name || account.balance !== 0);
}

function sumAccountCategory(accounts) {
  return (Array.isArray(accounts) ? accounts : []).reduce(
    (sum, account) => sum + Number(account?.balance || 0),
    0,
  );
}

function renderAccountList(accountBalances, liabilityBalances) {
  const normalizedAssets = normalizeClientAccountBalances(accountBalances);
  const normalizedLiabilities = normalizeClientLiabilityBalances(liabilityBalances);

  const investmentAccounts = flattenAccounts(
    {
      investments: normalizedAssets.investments,
      retirement: normalizedAssets.retirement,
    },
    "accountBalances",
  );
  const cashAccounts = flattenAccounts(
    {
      checking: normalizedAssets.checking,
      savings: normalizedAssets.savings,
    },
    "accountBalances",
  );
  const debtAccounts = flattenAccounts(
    {
      creditCards: normalizedLiabilities.creditCards,
      otherLoans: normalizedLiabilities.otherLoans,
    },
    "liabilityBalances",
  );

  investmentAccountList.innerHTML = renderGroupedAccountRows(investmentAccounts);
  cashAccountList.innerHTML = renderGroupedAccountRows(cashAccounts);
  debtAccountList.innerHTML = renderGroupedAccountRows(debtAccounts);
}

function flattenAccounts(groups, rootKey) {
  return Object.entries(groups).flatMap(([category, accounts]) =>
    accounts.map((account, index) => ({
      rootKey,
      category,
      index,
      label: ACCOUNT_TYPE_META[category].label,
      name: account.name,
      balance: account.balance,
    })),
  );
}

function renderGroupedAccountRows(accounts) {
  if (accounts.length === 0) {
    return '<div class="account-empty-state">No accounts yet.</div>';
  }

  return accounts
    .map(
      (account) => `
        <div class="account-row">
          <input
            class="account-name-input"
            name="${account.rootKey}.${account.category}.${account.index}.name"
            type="text"
            form="scenarioForm"
            value="${escapeHtml(account.name)}"
          />
          <div class="account-type-badge">${account.label}</div>
          <input
            class="account-balance-input"
            name="${account.rootKey}.${account.category}.${account.index}.balance"
            type="text"
            inputmode="decimal"
            data-currency-input="true"
            form="scenarioForm"
            value="${formatCurrency(account.balance)}"
          />
          <button
            type="button"
            class="remove-account-button icon-action-button"
            data-remove-root="${account.rootKey}"
            data-remove-category="${account.category}"
            data-remove-index="${account.index}"
            aria-label="Delete account"
            title="Delete account"
          >
            <span aria-hidden="true">&#128465;</span>
          </button>
        </div>
      `,
    )
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function parseCurrencyInput(value) {
  const normalized = String(value ?? "").replace(/[^0-9.-]/g, "");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function cloneAccountSnapshot(snapshot) {
  return JSON.parse(JSON.stringify(snapshot));
}

function buildZeroedHistoricalAccountSnapshot() {
  const currentAssets = normalizeClientAccountBalances(state.plan.accountBalances || {});
  const currentLiabilities = normalizeClientLiabilityBalances(state.plan.liabilityBalances || {});

  return {
    accountBalances: {
      checking: currentAssets.checking.map((account) => ({ name: account.name, balance: 0 })),
      savings: currentAssets.savings.map((account) => ({ name: account.name, balance: 0 })),
      investments: currentAssets.investments.map((account) => ({ name: account.name, balance: 0 })),
      retirement: currentAssets.retirement.map((account) => ({ name: account.name, balance: 0 })),
    },
    liabilityBalances: {
      creditCards: currentLiabilities.creditCards.map((account) => ({ name: account.name, balance: 0 })),
      carLoans: currentLiabilities.carLoans.map((account) => ({ name: account.name, balance: 0 })),
      mortgages: currentLiabilities.mortgages.map((account) => ({ name: account.name, balance: 0 })),
      otherLoans: currentLiabilities.otherLoans.map((account) => ({ name: account.name, balance: 0 })),
    },
  };
}

function pointDateKey(point) {
  if (point.source === "monthly") {
    return `${point.label}-01`;
  }

  if (point.source === "daily" || point.source === "current") {
    return point.label;
  }

  return null;
}

function getAccountSnapshotForPoint(point) {
  if (point.source === "forecast") {
    return null;
  }

  if (point.source === "current") {
    return {
      accountBalances: normalizeClientAccountBalances(state.plan.accountBalances || {}),
      liabilityBalances: normalizeClientLiabilityBalances(state.plan.liabilityBalances || {}),
    };
  }

  const dateKey = pointDateKey(point);
  const savedSnapshot = state.plan.accountSnapshots?.[dateKey];

  return savedSnapshot ? cloneAccountSnapshot(savedSnapshot) : buildZeroedHistoricalAccountSnapshot();
}

function flattenSnapshotAccounts(groups, rootKey) {
  return Object.entries(groups).flatMap(([category, accounts]) =>
    (Array.isArray(accounts) ? accounts : []).map((account, index) => ({
      rootKey,
      category,
      index,
      label: ACCOUNT_TYPE_META[category].label,
      name: account.name,
      balance: Number(account.balance || 0),
    })),
  );
}

function renderSnapshotAccountRows(point, accounts) {
  if (accounts.length === 0) {
    return '<div class="account-empty-state">No accounts.</div>';
  }

  return accounts
    .map(
      (account) => `
        <div class="account-row snapshot-account-row">
          <div class="snapshot-account-name">${escapeHtml(account.name)}</div>
          <div class="account-type-badge">${account.label}</div>
          <input
            class="account-balance-input"
            type="text"
            inputmode="decimal"
            data-currency-input="true"
            data-net-worth-point-id="${point.id}"
            data-net-worth-root-key="${account.rootKey}"
            data-net-worth-category="${account.category}"
            data-net-worth-index="${account.index}"
            value="${formatCurrency(account.balance)}"
            ${point.editable ? "" : "readonly"}
          />
          <span></span>
        </div>
      `,
    )
    .join("");
}

function renderSnapshotAccountGroups(point, snapshot) {
  const investments = flattenSnapshotAccounts(
    {
      investments: snapshot.accountBalances.investments,
      retirement: snapshot.accountBalances.retirement,
    },
    "accountBalances",
  );
  const cash = flattenSnapshotAccounts(
    {
      checking: snapshot.accountBalances.checking,
      savings: snapshot.accountBalances.savings,
    },
    "accountBalances",
  );
  const debt = flattenSnapshotAccounts(snapshot.liabilityBalances, "liabilityBalances");

  return [
    { title: "Investments", kicker: "Assets", rows: investments },
    { title: "Cash", kicker: "Assets", rows: cash },
    { title: "Debt", kicker: "Liabilities", rows: debt },
  ]
    .map(
      (group) => `
        <section class="account-group-card">
          <div class="panel-heading compact">
            <div>
              <p class="kicker">${group.kicker}</p>
              <h3>${group.title}</h3>
            </div>
          </div>
          <div class="account-table">
            <div class="account-table-header">
              <span>Account</span>
              <span>Type</span>
              <span>Amount</span>
              <span></span>
            </div>
            <div class="account-list">
              ${renderSnapshotAccountRows(point, group.rows)}
            </div>
          </div>
        </section>
      `,
    )
    .join("");
}

function aggregateSnapshot(snapshot) {
  const cash =
    sumAccountCategory(snapshot.accountBalances.checking) +
    sumAccountCategory(snapshot.accountBalances.savings);
  const investments = sumAccountCategory(snapshot.accountBalances.investments);
  const retirement = sumAccountCategory(snapshot.accountBalances.retirement);
  const debt =
    sumAccountCategory(snapshot.liabilityBalances.creditCards) +
    sumAccountCategory(snapshot.liabilityBalances.carLoans) +
    sumAccountCategory(snapshot.liabilityBalances.mortgages) +
    sumAccountCategory(snapshot.liabilityBalances.otherLoans);

  return {
    cash,
    investments,
    retirement,
    debt,
    netWorth: cash + investments + retirement - debt,
  };
}

function updatePlanAccounts(mutator) {
  const currentDraft = state.plan
    ? {
        ...state.plan,
        ...formDataToScenario(),
      }
    : { accountBalances: {} };
  const nextAccountBalances = normalizeClientAccountBalances(currentDraft.accountBalances || {});
  const nextLiabilityBalances = normalizeClientLiabilityBalances(currentDraft.liabilityBalances || {});
  mutator(nextAccountBalances, nextLiabilityBalances);
  const mortgageBalance = sumAccountCategory(nextLiabilityBalances.mortgages);
  const autoLoanBalance = sumAccountCategory(nextLiabilityBalances.carLoans);
  state.plan = {
    ...state.plan,
    ...currentDraft,
    accountBalances: nextAccountBalances,
    liabilityBalances: {
      ...nextLiabilityBalances,
      carLoans: syncAutoLoanLiabilityEntries(nextLiabilityBalances.carLoans, autoLoanBalance),
      mortgages: syncMortgageLiabilityEntries(nextLiabilityBalances.mortgages, mortgageBalance),
    },
    autoLoanBalance,
    mortgageBalance,
    startingCash:
      sumAccountCategory(nextAccountBalances.checking) +
      sumAccountCategory(nextAccountBalances.savings),
    startingInvestments: sumAccountCategory(nextAccountBalances.investments),
    startingRetirement: sumAccountCategory(nextAccountBalances.retirement),
    startingDebt:
      sumAccountCategory(nextLiabilityBalances.creditCards) +
      autoLoanBalance +
      mortgageBalance +
      sumAccountCategory(nextLiabilityBalances.otherLoans),
  };
  render();
}

function updateIncomeSources(mutator) {
  const currentDraft = state.plan
    ? {
        ...state.plan,
        ...formDataToScenario(),
      }
    : { incomeSources: [] };
  const nextIncomeSources = normalizeIncomeSources(currentDraft.incomeSources || []);
  mutator(nextIncomeSources);
  state.plan = {
    ...state.plan,
    ...currentDraft,
    incomeSources: nextIncomeSources,
    monthlyIncome: incomeForMonthFromSources(
      {
        ...currentDraft,
        incomeSources: nextIncomeSources,
      },
      0,
    ),
  };
  render();
}

function updateOneTimeIncome(mutator) {
  const currentDraft = state.plan
    ? {
        ...state.plan,
        ...formDataToScenario(),
      }
    : { oneTimeIncome: [] };
  const nextOneTimeIncome = normalizeOneTimeEntries(
    currentDraft.oneTimeIncome || [],
    "One-time income",
  );
  mutator(nextOneTimeIncome);
  state.plan = {
    ...state.plan,
    ...currentDraft,
    oneTimeIncome: nextOneTimeIncome,
    monthlyIncome: incomeForMonthFromSources(
      {
        ...currentDraft,
        oneTimeIncome: nextOneTimeIncome,
      },
      0,
    ),
  };
  render();
}

function updateBillSources(mutator) {
  const currentDraft = state.plan
    ? {
        ...state.plan,
        ...formDataToScenario(),
      }
    : { billSources: [] };
  const nextBillSources = normalizeBillSources(currentDraft.billSources || []);
  mutator(nextBillSources);
  state.plan = {
    ...state.plan,
    ...currentDraft,
    billSources: nextBillSources,
    monthlyExpenses: billForMonthFromSources(
      {
        ...currentDraft,
        billSources: nextBillSources,
      },
      0,
    ),
  };
  render();
}

function updateOneTimeBills(mutator) {
  const currentDraft = state.plan
    ? {
        ...state.plan,
        ...formDataToScenario(),
      }
    : { oneTimeBills: [] };
  const nextOneTimeBills = normalizeOneTimeEntries(currentDraft.oneTimeBills || [], "One-time bill");
  mutator(nextOneTimeBills);
  state.plan = {
    ...state.plan,
    ...currentDraft,
    oneTimeBills: nextOneTimeBills,
    monthlyExpenses: billForMonthFromSources(
      {
        ...currentDraft,
        oneTimeBills: nextOneTimeBills,
      },
      0,
    ),
  };
  render();
}

function updateTransactionOverride(kind, transactionId, field, rawValue) {
  const overrideKey =
    kind === "income" ? "incomeTransactionOverrides" : "billTransactionOverrides";
  const transactions =
    kind === "income" ? buildIncomeTransactions(state.plan) : buildBillTransactions(state.plan);
  const transaction = transactions.find((entry) => entry.id === transactionId);

  if (!transaction) {
    return;
  }

  const existingOverrides = normalizeTransactionOverrides(state.plan[overrideKey] || []);
  const overrideIndex = existingOverrides.findIndex((entry) => entry.id === transactionId);
  const nextOverride = {
    id: transactionId,
    date:
      field === "date"
        ? String(rawValue || transaction.date)
        : existingOverrides[overrideIndex]?.date || transaction.date,
    amount:
      field === "amount"
        ? Number(rawValue || 0)
        : existingOverrides[overrideIndex]?.amount ?? Number(transaction.amount || 0),
  };

  if (overrideIndex >= 0) {
    existingOverrides[overrideIndex] = nextOverride;
  } else {
    existingOverrides.push(nextOverride);
  }

  state.plan = {
    ...state.plan,
    [overrideKey]: existingOverrides,
    monthlyIncome: incomeForMonthFromSources(
      {
        ...state.plan,
        [overrideKey]: existingOverrides,
      },
      0,
    ),
    monthlyExpenses: billForMonthFromSources(
      {
        ...state.plan,
        [overrideKey]: existingOverrides,
      },
      0,
    ),
  };
  render();
}

function setActiveSection(sectionName) {
  state.activeSection = sectionName;
  navLinks.forEach((link) => {
    link.classList.toggle("active", link.dataset.section === sectionName);
  });

  contentSections.forEach((section) => {
    section.classList.toggle("active", section.dataset.section === sectionName);
  });

  render();
}

function renderMetrics(items) {
  if (items.length === 0) {
    metrics.innerHTML = "";
    return;
  }

  metrics.innerHTML = items
    .map(
      (metric) => `
        <article class="metric-card">
          <p class="metric-label">${metric.label}</p>
          <p class="metric-value ${metric.value.startsWith("-$") ? "negative" : "positive"}">${metric.value}</p>
        </article>
      `,
    )
    .join("");
}

function monthKeyFromOffset(offset) {
  const current = planningAnchorMonth(state.plan);
  const [year, month] = current.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function incomeAtOffset(offset) {
  return incomeForMonthFromSources(state.plan, offset);
}

function expensesAtOffset(offset) {
  return billForMonthFromSources(state.plan, offset);
}

function netWorthContributorsForForecastOffset(offset) {
  const point = state.forecast.points[Math.min(offset, state.forecast.points.length - 1)] || {};
  const realEstatePoint =
    state.forecast.realEstatePoints?.[Math.min(offset, state.forecast.realEstatePoints.length - 1)] || {};
  const autoPoint =
    state.forecast.autoPoints?.[Math.min(offset, state.forecast.autoPoints.length - 1)] || {};

  return {
    ...point,
    homeValue: Number(realEstatePoint.homeValue || 0),
    autoValue: Number(autoPoint.autoValue || 0),
  };
}

function buildObservedNetWorthSeries() {
  const snapshots = state.plan.historicalSnapshots || [];
  const observed = snapshots
    .map((snapshot, index) => ({
      offset: index - snapshots.length,
      value: filteredNetWorthValue(snapshot),
    }))
    .filter((point) => point.value !== 0);

  observed.push({
    offset: 0,
    value: filteredNetWorthValue({
      cash: state.plan.startingCash,
      investments: state.plan.startingInvestments,
      retirement: state.plan.startingRetirement,
      homeValue: state.plan.homeValue,
      autoValue: state.plan.autoValue,
      debt: state.plan.startingDebt,
    }),
  });
  return observed.sort((a, b) => a.offset - b.offset);
}

function interpolateObservedValue(observed, targetOffset) {
  const exact = observed.find((point) => point.offset === targetOffset);
  if (exact) {
    return exact.value;
  }

  const lower = [...observed].reverse().find((point) => point.offset < targetOffset);
  const upper = observed.find((point) => point.offset > targetOffset);

  if (lower && upper) {
    const ratio = (targetOffset - lower.offset) / (upper.offset - lower.offset);
    return lower.value + (upper.value - lower.value) * ratio;
  }

  if (upper && observed.length > 1) {
    const next = observed[1];
    const slope = next.offset === upper.offset ? 0 : (next.value - upper.value) / (next.offset - upper.offset);
    return upper.value - slope * (upper.offset - targetOffset);
  }

  if (lower && observed.length > 1) {
    const prev = observed[observed.length - 2];
    const slope = lower.offset === prev.offset ? 0 : (lower.value - prev.value) / (lower.offset - prev.offset);
    return lower.value + slope * (targetOffset - lower.offset);
  }

  return observed[0]?.value || 0;
}

function buildNetWorthTimeline() {
  const observed = buildObservedNetWorthSeries();
  return Array.from({ length: 49 }, (_, index) => {
    const offset = index - 24;
    let value;
    let period = "history";

    if (offset < 0) {
      value = observed.length > 1 ? interpolateObservedValue(observed, offset) : null;
    } else if (offset === 0) {
      value = filteredNetWorthValue(netWorthContributorsForForecastOffset(0));
      period = "current";
    } else {
      value = filteredNetWorthValue(netWorthContributorsForForecastOffset(offset));
      period = "forecast";
    }

    return {
      label: monthKeyFromOffset(offset),
      value,
      period,
    };
  });
}

function buildNetWorthExplorerTimeline() {
  const dailyPoints = (state.plan.dailySnapshots || []).map((snapshot) => {
    const isCurrent = snapshot.date === currentDateKey();
    return {
      id: `day:${snapshot.date}`,
      label: snapshot.date,
      displayLabel: formatDateLabel(snapshot.date),
      value: filteredNetWorthValue(snapshot),
      period: isCurrent ? "current" : "history",
      source: "daily",
      editable: !isCurrent,
      balances: {
        cash: Number(snapshot.cash || 0),
        investments: Number(snapshot.investments || 0),
        retirement: Number(snapshot.retirement || 0),
        homeValue: Number(snapshot.homeValue || 0),
        autoValue: Number(snapshot.autoValue || 0),
        debt: Number(snapshot.debt || 0),
      },
      sortKey: snapshot.date,
    };
  }).filter((point) => point.period === "current" || hasVisibleHistoricalNetWorthValue(point.balances));

  const hasCurrentDailyPoint = dailyPoints.some((point) => point.period === "current");
  const currentPoint = hasCurrentDailyPoint
    ? []
    : [
        {
          id: `current:${currentDateKey()}`,
          label: currentDateKey(),
          displayLabel: formatDateLabel(currentDateKey()),
          value: filteredNetWorthValue(netWorthContributorsForForecastOffset(0)),
          period: "current",
          source: "current",
          editable: false,
          balances: {
            cash: Number(state.plan.startingCash || 0),
            investments: Number(state.plan.startingInvestments || 0),
            retirement: Number(state.plan.startingRetirement || 0),
            homeValue: Number(state.plan.homeValue || 0),
            autoValue: Number(state.plan.autoValue || 0),
            debt: Number(state.plan.startingDebt || 0),
          },
          sortKey: currentDateKey(),
        },
      ];

  const forecastAnchorDate = dateKeyToUtcDate(currentDateKey());
  const dailyCashForecast = buildDailyCashForecastMap();
  const forecastMonthlyAnchors = Array.from(
    { length: Math.min(state.forecast.points.length, 25) },
    (_, index) => {
      const monthlyBalances = netWorthContributorsForForecastOffset(index);
      return {
        date: addMonthsPreservingDayUtc(forecastAnchorDate, index),
        balances: {
          cash: Number(monthlyBalances.cash || 0),
          investments: Number(monthlyBalances.investments || 0),
          retirement: Number(monthlyBalances.retirement || 0),
          homeValue: Number(monthlyBalances.homeValue || 0),
          autoValue: Number(monthlyBalances.autoValue || 0),
          debt: Number(monthlyBalances.debt || 0),
        },
      };
    },
  );

  const forecastPoints = forecastMonthlyAnchors.flatMap((anchor, index) => {
    if (index === 0) {
      return [];
    }

    const previous = forecastMonthlyAnchors[index - 1];
    const daysBetween = Math.max(differenceInDaysUtc(previous.date, anchor.date), 1);

    return Array.from({ length: daysBetween }, (_, dayIndex) => {
      const ratio = (dayIndex + 1) / daysBetween;
      const pointDate = addDaysUtc(previous.date, dayIndex + 1);
      const pointBalances = interpolateBalances(previous.balances, anchor.balances, ratio);
      const dateKey = isoDate(pointDate);
      const dailyCash = dailyCashForecast.get(dateKey);

      return {
        id: `forecast:${dateKey}`,
        label: dateKey,
        displayLabel: formatDateLabel(dateKey),
        value: filteredNetWorthValue({
          ...pointBalances,
          cash: dailyCash ?? pointBalances.cash,
        }),
        period: "forecast",
        source: "forecast",
        editable: false,
        balances: {
          ...pointBalances,
          cash: dailyCash ?? pointBalances.cash,
        },
        sortKey: dateKey,
      };
    });
  });

  return [...dailyPoints, ...currentPoint, ...forecastPoints].sort((a, b) =>
    a.sortKey.localeCompare(b.sortKey),
  );
}

function getSelectedNetWorthPoint(points = state.netWorthExplorerPoints) {
  if (points.length === 0) {
    return null;
  }

  const selected =
    points.find((point) => point.id === state.selectedNetWorthPointId) ||
    points.find((point) => point.period === "current") ||
    points[points.length - 1];

  state.selectedNetWorthPointId = selected?.id || null;
  return selected;
}

function renderSelectedDateBalances(point) {
  if (!point) {
    selectedNetWorthDate.textContent = "Choose a point on the chart";
    selectedNetWorthSummary.textContent = "Hover over the graph, then click a point to inspect its balances.";
    selectedDateHelper.textContent = "Historical saved dates can be edited here. Current and forecast points stay read-only.";
    selectedDateBalances.innerHTML = "";
    return;
  }

  const accountSnapshot = getAccountSnapshotForPoint(point);
  selectedNetWorthDate.textContent = point.displayLabel;
  selectedNetWorthSummary.textContent = `Net worth: ${formatCurrency(point.value)}`;
  selectedDateHelper.textContent = point.editable
    ? "Editing here updates the saved individual account snapshot for that date."
    : point.period === "forecast"
      ? "Forecast points are calculated from your current plan and don’t have editable individual accounts."
      : "Current balances are driven by the live Account Balances page, so this point stays read-only.";

  if (!accountSnapshot) {
    selectedDateBalances.innerHTML = '<p class="helper-copy">No individual account data is available for this point.</p>';
    return;
  }

  selectedDateBalances.innerHTML = renderSnapshotAccountGroups(point, accountSnapshot);
}

function renderNetWorthInspector() {
  if (state.activeSection !== "home") {
    homeChart.innerHTML = "";
    return;
  }

  const points = buildNetWorthExplorerTimeline();
  state.netWorthExplorerPoints = points;
  const selectedPoint = getSelectedNetWorthPoint(points);
  const selectedIndex = points.findIndex((point) => point.id === selectedPoint?.id);
  const hoveredIndex = points.findIndex((point) => point.id === state.hoveredNetWorthPointId);

  drawTimelineChart(homeChart, points, {
    selectedIndex: selectedIndex >= 0 ? selectedIndex : null,
    hoveredIndex: hoveredIndex >= 0 ? hoveredIndex : null,
  });
  renderSelectedDateBalances(selectedPoint);
}

function updateSnapshotBalance(pointId, field, value) {
  const point = state.netWorthExplorerPoints.find((entry) => entry.id === pointId);
  if (!point || !point.editable) {
    return;
  }

  const snapshot = getAccountSnapshotForPoint(point);
  const amount = parseCurrencyInput(value.amount);
  snapshot[value.rootKey][value.category][Number(value.index)].balance = amount;

  const dateKey = pointDateKey(point);
  state.plan.accountSnapshots = {
    ...(state.plan.accountSnapshots || {}),
    [dateKey]: snapshot,
  };

  const aggregate = aggregateSnapshot(snapshot);
  point.value = filteredNetWorthValue(aggregate);

  if (point.source === "monthly") {
    const month = point.label;
    state.plan.historicalSnapshots = (state.plan.historicalSnapshots || []).map((snapshotItem) =>
      snapshotItem.month === month
        ? {
            ...snapshotItem,
            cash: aggregate.cash,
            investments: aggregate.investments,
            retirement: aggregate.retirement,
            debt: aggregate.debt,
          }
        : snapshotItem,
    );
  }

  if (point.source === "daily") {
    const date = point.label;
    state.plan.dailySnapshots = (state.plan.dailySnapshots || []).map((snapshotItem) =>
      snapshotItem.date === date
        ? {
            ...snapshotItem,
            cash: aggregate.cash,
            investments: aggregate.investments,
            retirement: aggregate.retirement,
            debt: aggregate.debt,
            netWorth: aggregate.netWorth,
          }
        : snapshotItem,
    );
  }

  render();
}

function buildFlowTimeline(type) {
  return Array.from({ length: 49 }, (_, index) => {
    const offset = index - 24;
    const period = offset < 0 ? "history" : offset === 0 ? "current" : "forecast";
    const value =
      type === "income"
        ? incomeAtOffset(offset)
        : expensesAtOffset(offset);

    return {
      label: monthKeyFromOffset(offset),
      value,
      period,
    };
  });
}

function buildBillsBarSeries() {
  return Array.from({ length: 12 }, (_, index) => {
    const monthOffset = index;
    const date = addMonths(monthKeyToDate(planningAnchorMonth(state.plan)), monthOffset);
    return {
      label: date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      value: billForMonthFromSources(state.plan, monthOffset),
    };
  });
}

function buildIncomeBarSeries() {
  return Array.from({ length: 12 }, (_, index) => {
    const monthOffset = index;
    const date = addMonths(monthKeyToDate(planningAnchorMonth(state.plan)), monthOffset);
    return {
      label: date.toLocaleString("en-US", { month: "short", timeZone: "UTC" }),
      value: incomeForMonthFromSources(state.plan, monthOffset),
    };
  });
}

function buildRealEstateSeries() {
  const points = state.forecast.realEstatePoints || [];
  return {
    homeValue: points.map((point) => ({
      label: point.month === 0 ? "Today" : `M${point.month}`,
      value: Number(point.homeValue || 0),
    })),
    mortgageBalance: points.map((point) => ({
      label: point.month === 0 ? "Today" : `M${point.month}`,
      value: Number(point.mortgageBalance || 0),
    })),
  };
}

function buildAutoSeries() {
  const points = state.forecast.autoPoints || [];
  return {
    autoValue: points.map((point) => ({
      label: point.month === 0 ? "Today" : `M${point.month}`,
      value: Number(point.autoValue || 0),
    })),
    autoLoanBalance: points.map((point) => ({
      label: point.month === 0 ? "Today" : `M${point.month}`,
      value: Number(point.autoLoanBalance || 0),
    })),
  };
}

function renderRightRail() {
  const netWorthTimeline = buildNetWorthTimeline();

  if (state.activeSection !== "home") {
    homeChart.innerHTML = "";
  }

  if (state.activeSection === "home") {
    chartKicker.textContent = "Home";
    chartTitle.textContent = "Net worth across four years";
    renderMetrics([
      { label: "Net worth today", value: formatCurrency(netWorthTimeline[24].value) },
      { label: "Net worth in 2 years", value: formatCurrency(netWorthTimeline.at(-1).value) },
      { label: "2-year change", value: formatCurrency(netWorthTimeline.at(-1).value - netWorthTimeline[24].value) },
      {
        label: "Debt free estimate",
        value:
          state.forecast.summary.debtFreeMonth === null
            ? "Beyond horizon"
            : `${state.forecast.summary.debtFreeMonth} mo`,
      },
    ]);
    drawTimelineChart(chart, netWorthTimeline);
    return;
  }

  if (state.activeSection === "income") {
    const incomeBarSeries = buildIncomeBarSeries();
    const currentMonthIncome = incomeBarSeries[0]?.value || 0;
    const nextTwelveMonthAverage =
      incomeBarSeries.reduce((sum, point) => sum + point.value, 0) / Math.max(incomeBarSeries.length, 1);
    chartKicker.textContent = "Income";
    chartTitle.textContent = "Monthly income for the next 12 months";
    renderMetrics([
      { label: "This month's income", value: formatCurrency(currentMonthIncome) },
      { label: "Next 12 mo average", value: formatCurrency(nextTwelveMonthAverage) },
      { label: "Annual growth", value: `${state.plan.incomeGrowth.toFixed(1)}%` },
      { label: "Income sources", value: String(normalizeIncomeSources(state.plan.incomeSources).length) },
    ]);
    drawBarChart(chart, incomeBarSeries);
    return;
  }

  if (state.activeSection === "real-estate") {
    const realEstateSeries = buildRealEstateSeries();
    const currentPoint = state.forecast.realEstatePoints?.[0] || {
      homeValue: 0,
      mortgageBalance: 0,
      equity: 0,
    };
    const futurePoint =
      state.forecast.realEstatePoints?.[state.forecast.realEstatePoints.length - 1] || currentPoint;
    chartKicker.textContent = "Real Estate";
    chartTitle.textContent = "Home value vs mortgage over time";
    renderMetrics([
      { label: "Home equity today", value: formatCurrency(currentPoint.equity || 0) },
      { label: "Current home value", value: formatCurrency(currentPoint.homeValue || 0) },
      { label: "Mortgage at horizon", value: formatCurrency(futurePoint.mortgageBalance || 0) },
      { label: "Equity at horizon", value: formatCurrency(futurePoint.equity || 0) },
    ]);
    drawMultiLineChart(chart, [
      { label: "Home Value", color: "#ffffff", points: realEstateSeries.homeValue },
      { label: "Mortgage", color: "#7a7a7a", points: realEstateSeries.mortgageBalance },
    ], {
      xStartLabel: "Today",
      xEndLabel: `${state.plan.forecastMonths} mo`,
    });
    return;
  }

  if (state.activeSection === "auto") {
    const autoSeries = buildAutoSeries();
    const currentPoint = state.forecast.autoPoints?.[0] || {
      autoValue: 0,
      autoLoanBalance: 0,
      equity: 0,
    };
    const futurePoint =
      state.forecast.autoPoints?.[state.forecast.autoPoints.length - 1] || currentPoint;
    chartKicker.textContent = "Auto";
    chartTitle.textContent = "Vehicle value vs loan over time";
    renderMetrics([
      { label: "Vehicle equity today", value: formatCurrency(currentPoint.equity || 0) },
      { label: "Current vehicle value", value: formatCurrency(currentPoint.autoValue || 0) },
      { label: "Auto loan at horizon", value: formatCurrency(futurePoint.autoLoanBalance || 0) },
      { label: "Equity at horizon", value: formatCurrency(futurePoint.equity || 0) },
    ]);
    drawMultiLineChart(chart, [
      { label: "Vehicle Value", color: "#ffffff", points: autoSeries.autoValue },
      { label: "Auto Loan", color: "#7a7a7a", points: autoSeries.autoLoanBalance },
    ], {
      xStartLabel: "Today",
      xEndLabel: `${state.plan.forecastMonths} mo`,
    });
    return;
  }

  if (state.activeSection === "bills") {
    const billsBarSeries = buildBillsBarSeries();
    const currentMonthBills = billsBarSeries[0]?.value || 0;
    const nextTwelveMonthAverage =
      billsBarSeries.reduce((sum, point) => sum + point.value, 0) / Math.max(billsBarSeries.length, 1);
    chartKicker.textContent = "Bills";
    chartTitle.textContent = "Monthly bills for the next 12 months";
    renderMetrics([
      { label: "This month's bills", value: formatCurrency(currentMonthBills) },
      { label: "Next 12 mo average", value: formatCurrency(nextTwelveMonthAverage) },
    ]);
    drawBarChart(chart, billsBarSeries);
    return;
  }

  chartKicker.textContent =
    state.activeSection === "account-balances"
      ? "Account Balances"
      : state.activeSection === "forecast"
        ? "Forecast"
        : state.activeSection === "auto"
          ? "Auto"
        : "Home";
  chartTitle.textContent = "Net worth across four years";
  renderMetrics([
    { label: "Net worth today", value: formatCurrency(netWorthTimeline[24].value) },
    { label: "Net worth in 2 years", value: formatCurrency(netWorthTimeline.at(-1).value) },
    { label: "2-year change", value: formatCurrency(netWorthTimeline.at(-1).value - netWorthTimeline[24].value) },
    {
      label: "Debt free estimate",
      value:
        state.forecast.summary.debtFreeMonth === null
          ? "Beyond horizon"
          : `${state.forecast.summary.debtFreeMonth} mo`,
    },
  ]);
  drawTimelineChart(chart, netWorthTimeline);
}

function renderHistory(scenario) {
  const header = `
    <div class="history-row header">
      <strong>Month</strong>
      <strong>Cash</strong>
      <strong>Investments</strong>
      <strong>Retirement</strong>
      <strong>Debt</strong>
    </div>
  `;

  historyTable.innerHTML = [
    header,
    ...scenario.historicalSnapshots.map(
      (snapshot) => `
        <div class="history-row">
          <span>${snapshot.month}</span>
          <span>${formatCurrency(snapshot.cash)}</span>
          <span>${formatCurrency(snapshot.investments)}</span>
          <span>${formatCurrency(snapshot.retirement || 0)}</span>
          <span>${formatCurrency(snapshot.debt)}</span>
        </div>
      `,
    ),
  ].join("");
}

function renderIncomeTransactions(scenario) {
  const transactions = buildIncomeTransactions(scenario);
  const header = `
    <div class="history-row header">
      <strong>Date</strong>
      <strong>Income source</strong>
      <strong>Frequency</strong>
      <strong>Amount</strong>
    </div>
  `;

  incomeTransactionsTable.innerHTML =
    transactions.length === 0
      ? '<p class="helper-copy">Add an income source to generate its transaction schedule.</p>'
      : [
          header,
          ...transactions.map(
            (transaction) => `
              <div class="history-row">
                <span>
                  <input
                    type="date"
                    value="${transaction.date}"
                    data-transaction-kind="income"
                    data-transaction-id="${transaction.id}"
                    data-transaction-field="date"
                  />
                </span>
                <span>${escapeHtml(transaction.source)}</span>
                <span>${transaction.frequency === "one-time" ? "One-time" : incomeFrequencyLabel(transaction.frequency)}</span>
                <span>
                  <input
                    type="number"
                    step="0.01"
                    value="${Number(transaction.amount).toFixed(2)}"
                    data-transaction-kind="income"
                    data-transaction-id="${transaction.id}"
                    data-transaction-field="amount"
                  />
                </span>
              </div>
            `,
          ),
        ].join("");
}

function renderBillTransactions(scenario) {
  const transactions = buildBillTransactions(scenario);
  const header = `
    <div class="history-row header">
      <strong>Date</strong>
      <strong>Bill</strong>
      <strong>Frequency</strong>
      <strong>Amount</strong>
    </div>
  `;

  billTransactionsTable.innerHTML =
    transactions.length === 0
      ? '<p class="helper-copy">Add a bill to generate its transaction schedule.</p>'
      : [
          header,
          ...transactions.map(
            (transaction) => `
              <div class="history-row">
                <span>
                  <input
                    type="date"
                    value="${transaction.date}"
                    data-transaction-kind="bill"
                    data-transaction-id="${transaction.id}"
                    data-transaction-field="date"
                  />
                </span>
                <span>${escapeHtml(transaction.source)}</span>
                <span>${transaction.frequency === "one-time" ? "One-time" : incomeFrequencyLabel(transaction.frequency)}</span>
                <span>
                  <input
                    type="number"
                    step="0.01"
                    value="${Number(transaction.amount).toFixed(2)}"
                    data-transaction-kind="bill"
                    data-transaction-id="${transaction.id}"
                    data-transaction-field="amount"
                  />
                </span>
              </div>
            `,
          ),
        ].join("");
}

function render() {
  if (!state.plan || !state.forecast) {
    return;
  }

  netWorthFilterInputs.forEach((input) => {
    input.checked = Boolean(state.netWorthGraphFilters[input.dataset.netWorthFilter]);
  });
  setFormValues(state.plan);
  renderHistory(state.plan);
  renderIncomeTransactions(state.plan);
  renderBillTransactions(state.plan);
  renderRightRail();
  renderNetWorthInspector();
}

async function loadBootstrap() {
  const response = await fetch("/api/bootstrap");
  const data = await response.json();
  state = {
    ...state,
    ...data,
  };
  render();
}

async function saveScenario() {
  const payload = {
    ...state.plan,
    ...formDataToScenario(),
    historicalSnapshots: state.plan.historicalSnapshots,
    dailySnapshots: state.plan.dailySnapshots,
    accountSnapshots: state.plan.accountSnapshots,
  };

  const response = await fetch("/api/plan", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await response.json();
  state.plan = data.plan;
  state.forecast = data.forecast;
  render();
}

saveButton.addEventListener("click", saveScenario);
navLinks.forEach((link) => {
  link.addEventListener("click", () => {
    setActiveSection(link.dataset.section);
  });
});

document.addEventListener("click", (event) => {
  const removeButton = event.target.closest("[data-remove-category]");
  if (removeButton) {
    const root = removeButton.dataset.removeRoot;
    const category = removeButton.dataset.removeCategory;
    const index = Number(removeButton.dataset.removeIndex);
    updatePlanAccounts((accountBalances, liabilityBalances) => {
      const target = root === "liabilityBalances" ? liabilityBalances : accountBalances;
      target[category] = target[category].filter((_, itemIndex) => itemIndex !== index);
    });
  }

  const removeIncomeButton = event.target.closest("[data-remove-income-index]");
  if (removeIncomeButton) {
    const index = Number(removeIncomeButton.dataset.removeIncomeIndex);
    updateIncomeSources((incomeSources) => {
      const next = incomeSources.filter((_, incomeIndex) => incomeIndex !== index);
      incomeSources.splice(0, incomeSources.length, ...next);
      if (incomeSources.length === 0) {
        incomeSources.push({
          name: "Income 1",
          amount: 0,
          frequency: "monthly",
          startDate: fallbackIncomeStartDate(),
        });
      }
    });
  }

  const duplicateIncomeButton = event.target.closest("[data-duplicate-income-index]");
  if (duplicateIncomeButton) {
    const index = Number(duplicateIncomeButton.dataset.duplicateIncomeIndex);
    updateIncomeSources((incomeSources) => {
      const source = incomeSources[index];
      incomeSources.splice(index + 1, 0, { ...source, name: `${source.name} Copy` });
    });
  }

  const removeOneTimeIncomeButton = event.target.closest("[data-remove-one-time-income-index]");
  if (removeOneTimeIncomeButton) {
    const index = Number(removeOneTimeIncomeButton.dataset.removeOneTimeIncomeIndex);
    updateOneTimeIncome((oneTimeIncome) => {
      const next = oneTimeIncome.filter((_, incomeIndex) => incomeIndex !== index);
      oneTimeIncome.splice(0, oneTimeIncome.length, ...next);
    });
  }

  const duplicateOneTimeIncomeButton = event.target.closest("[data-duplicate-one-time-income-index]");
  if (duplicateOneTimeIncomeButton) {
    const index = Number(duplicateOneTimeIncomeButton.dataset.duplicateOneTimeIncomeIndex);
    updateOneTimeIncome((oneTimeIncome) => {
      const source = oneTimeIncome[index];
      oneTimeIncome.splice(index + 1, 0, { ...source, name: `${source.name} Copy` });
    });
  }

  const removeBillButton = event.target.closest("[data-remove-bill-index]");
  if (removeBillButton) {
    const index = Number(removeBillButton.dataset.removeBillIndex);
    updateBillSources((billSources) => {
      const next = billSources.filter((_, billIndex) => billIndex !== index);
      billSources.splice(0, billSources.length, ...next);
      if (billSources.length === 0) {
        billSources.push({
          name: "Bill 1",
          amount: 0,
          frequency: "monthly",
          startDate: fallbackBillStartDate(),
        });
      }
    });
  }

  const duplicateBillButton = event.target.closest("[data-duplicate-bill-index]");
  if (duplicateBillButton) {
    const index = Number(duplicateBillButton.dataset.duplicateBillIndex);
    updateBillSources((billSources) => {
      const source = billSources[index];
      billSources.splice(index + 1, 0, { ...source, name: `${source.name} Copy` });
    });
  }

  const removeOneTimeBillButton = event.target.closest("[data-remove-one-time-bill-index]");
  if (removeOneTimeBillButton) {
    const index = Number(removeOneTimeBillButton.dataset.removeOneTimeBillIndex);
    updateOneTimeBills((oneTimeBills) => {
      const next = oneTimeBills.filter((_, billIndex) => billIndex !== index);
      oneTimeBills.splice(0, oneTimeBills.length, ...next);
    });
  }

  const duplicateOneTimeBillButton = event.target.closest("[data-duplicate-one-time-bill-index]");
  if (duplicateOneTimeBillButton) {
    const index = Number(duplicateOneTimeBillButton.dataset.duplicateOneTimeBillIndex);
    updateOneTimeBills((oneTimeBills) => {
      const source = oneTimeBills[index];
      oneTimeBills.splice(index + 1, 0, { ...source, name: `${source.name} Copy` });
    });
  }
});

document.addEventListener("change", (event) => {
  const transactionInput = event.target.closest("[data-transaction-id]");
  if (transactionInput) {
    updateTransactionOverride(
      transactionInput.dataset.transactionKind,
      transactionInput.dataset.transactionId,
      transactionInput.dataset.transactionField,
      transactionInput.value,
    );
    return;
  }

  const filterInput = event.target.closest("[data-net-worth-filter]");
  if (filterInput) {
    state.netWorthGraphFilters[filterInput.dataset.netWorthFilter] = filterInput.checked;
    render();
    return;
  }

  const balanceInput = event.target.closest("[data-net-worth-category]");
  if (!balanceInput) {
    return;
  }

  updateSnapshotBalance(
    balanceInput.dataset.netWorthPointId,
    {
      rootKey: balanceInput.dataset.netWorthRootKey,
      category: balanceInput.dataset.netWorthCategory,
      index: balanceInput.dataset.netWorthIndex,
      amount: balanceInput.value,
    },
  );
});

document.addEventListener("focusin", (event) => {
  const input = event.target.closest("[data-currency-input]");
  if (!input) {
    return;
  }

  const parsed = parseCurrencyInput(input.value);
  input.value = parsed === 0 ? "" : String(parsed);
});

document.addEventListener("focusout", (event) => {
  const input = event.target.closest("[data-currency-input]");
  if (!input) {
    return;
  }

  input.value = formatCurrency(parseCurrencyInput(input.value));
});

function timelinePointIndexFromEvent(svg, event, count) {
  if (count <= 1) {
    return 0;
  }

  const width = 720;
  const padding = 28;
  const rect = svg.getBoundingClientRect();
  const x = ((event.clientX - rect.left) / rect.width) * width;
  const clamped = Math.min(Math.max(x, padding), width - padding);
  return Math.round(((clamped - padding) / (width - padding * 2)) * (count - 1));
}

homeChart.addEventListener("mousemove", (event) => {
  if (state.activeSection !== "home" || state.netWorthExplorerPoints.length === 0) {
    return;
  }

  const index = timelinePointIndexFromEvent(homeChart, event, state.netWorthExplorerPoints.length);
  state.hoveredNetWorthPointId = state.netWorthExplorerPoints[index]?.id || null;
  renderNetWorthInspector();
});

homeChart.addEventListener("mouseleave", () => {
  if (state.hoveredNetWorthPointId === null) {
    return;
  }

  state.hoveredNetWorthPointId = null;
  renderNetWorthInspector();
});

homeChart.addEventListener("click", (event) => {
  if (state.activeSection !== "home" || state.netWorthExplorerPoints.length === 0) {
    return;
  }

  const index = timelinePointIndexFromEvent(homeChart, event, state.netWorthExplorerPoints.length);
  state.selectedNetWorthPointId = state.netWorthExplorerPoints[index]?.id || null;
  renderNetWorthInspector();
});

addIncomeButton.addEventListener("click", () => {
  updateIncomeSources((incomeSources) => {
    incomeSources.push({
      name: `Income ${incomeSources.length + 1}`,
      amount: 0,
      frequency: "monthly",
      startDate: fallbackIncomeStartDate(),
    });
  });
});

addOneTimeIncomeButton.addEventListener("click", () => {
  updateOneTimeIncome((oneTimeIncome) => {
    oneTimeIncome.push({
      name: `One-time income ${oneTimeIncome.length + 1}`,
      amount: 0,
      date: fallbackIncomeStartDate(),
    });
  });
});

addBillButton.addEventListener("click", () => {
  updateBillSources((billSources) => {
    billSources.push({
      name: `Bill ${billSources.length + 1}`,
      amount: 0,
      frequency: "monthly",
      startDate: fallbackBillStartDate(),
    });
  });
});

addOneTimeBillButton.addEventListener("click", () => {
  updateOneTimeBills((oneTimeBills) => {
    oneTimeBills.push({
      name: `One-time bill ${oneTimeBills.length + 1}`,
      amount: 0,
      date: fallbackBillStartDate(),
    });
  });
});

openAddAccountModalButton.addEventListener("click", () => {
  addAccountModal.showModal();
});

cancelAddAccountButton.addEventListener("click", () => {
  addAccountModal.close();
});

confirmAddAccountButton.addEventListener("click", () => {
  const category = newAccountType.value;
  const meta = ACCOUNT_TYPE_META[category];

  updatePlanAccounts((accountBalances, liabilityBalances) => {
    const target = meta.rootKey === "liabilityBalances" ? liabilityBalances : accountBalances;
    target[category].push({
      name: `${meta.label} ${target[category].length + 1}`,
      balance: 0,
    });
  });

  addAccountModal.close();
});

loadBootstrap();
setActiveSection("home");
