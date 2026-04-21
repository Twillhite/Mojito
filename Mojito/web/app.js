import { drawBarChart, drawTimelineChart, formatCurrency } from "/forecast-client.js";

const form = document.getElementById("scenarioForm");
const saveButton = document.getElementById("saveButton");
const metrics = document.getElementById("metrics");
const historyTable = document.getElementById("historyTable");
const chart = document.getElementById("chart");
const homeChart = document.getElementById("homeChart");
const chartKicker = document.getElementById("chartKicker");
const chartTitle = document.getElementById("chartTitle");
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
  activeSection: "homepage",
};

function monthKeyToDate(monthKey) {
  const [year, month] = String(monthKey).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
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
  const sources = normalizeIncomeSources(scenario?.incomeSources || []);
  const fallbackMonth = planningAnchorMonth(scenario);
  const targetMonthDate = addMonths(monthKeyToDate(fallbackMonth), monthOffset);
  const incomeGrowth = Number(scenario?.incomeGrowth || 0);
  const growthFactor = monthOffset / 12;

  const recurringTotal = sources.reduce((sum, source) => {
    const occurrences = incomeOccurrencesForMonth(source, targetMonthDate, fallbackMonth);
    const grownAmount =
      Number(source.amount || 0) * Math.pow(1 + incomeGrowth / 100, growthFactor);
    return sum + occurrences * grownAmount;
  }, 0);

  return recurringTotal + oneTimeAmountForMonth(scenario?.oneTimeIncome || [], scenario, monthOffset);
}

function buildIncomeTransactions(scenario) {
  const sources = normalizeIncomeSources(scenario?.incomeSources || []);
  const fallbackMonth = planningAnchorMonth(scenario);
  const anchorMonth = monthKeyToDate(fallbackMonth);
  const forecastMonths = Number(scenario?.forecastMonths || 0);
  const incomeGrowth = Number(scenario?.incomeGrowth || 0);
  const transactions = [];

  sources.forEach((source) => {
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
          date: isoDate(paymentDate),
          source: source.name,
          frequency: source.frequency,
          amount: grownAmount,
        });
      }
    }
  });

  return transactions.sort((a, b) => a.date.localeCompare(b.date));
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
  const sources = normalizeBillSources(scenario?.billSources || []);
  const fallbackMonth = planningAnchorMonth(scenario);
  const targetMonthDate = addMonths(monthKeyToDate(fallbackMonth), monthOffset);
  const expenseGrowth = Number(scenario?.expenseGrowth || 0);
  const growthFactor = monthOffset / 12;

  const recurringTotal = sources.reduce((sum, bill) => {
    const occurrences = incomeOccurrencesForMonth(bill, targetMonthDate, fallbackMonth);
    const grownAmount =
      Number(bill.amount || 0) * Math.pow(1 + expenseGrowth / 100, growthFactor);
    return sum + occurrences * grownAmount;
  }, 0);

  const targetMonthKey = `${targetMonthDate.getUTCFullYear()}-${String(targetMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const oneTimeTotal = normalizeOneTimeEntries(scenario?.oneTimeBills || [], "One-time bill").reduce((sum, bill) => {
    const billMonthKey = String(bill.date || "").slice(0, 7);
    return sum + (billMonthKey === targetMonthKey ? Number(bill.amount || 0) : 0);
  }, 0);

  return recurringTotal + oneTimeTotal;
}

function buildBillTransactions(scenario) {
  const sources = normalizeBillSources(scenario?.billSources || []);
  const fallbackMonth = planningAnchorMonth(scenario);
  const anchorMonth = monthKeyToDate(fallbackMonth);
  const forecastMonths = Number(scenario?.forecastMonths || 0);
  const expenseGrowth = Number(scenario?.expenseGrowth || 0);
  const transactions = [];

  sources.forEach((bill) => {
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
          date: isoDate(paymentDate),
          source: bill.name,
          frequency: bill.frequency,
          amount: grownAmount,
        });
      }
    }
  });

  return transactions.sort((a, b) => a.date.localeCompare(b.date));
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

    scenario[key] = key === "startingDebt" ? parseCurrencyInput(value) : Number(value);
  });

  scenario.incomeSources = normalizeIncomeSources(scenario.incomeSources);
  scenario.oneTimeIncome = normalizeOneTimeEntries(scenario.oneTimeIncome, "One-time income");
  scenario.billSources = normalizeBillSources(scenario.billSources);
  scenario.oneTimeBills = normalizeOneTimeEntries(scenario.oneTimeBills, "One-time bill");
  scenario.monthlyIncome = incomeForMonthFromSources(scenario, 0);
  scenario.monthlyExpenses = billForMonthFromSources(scenario, 0);
  scenario.accountBalances = normalizeClientAccountBalances(scenario.accountBalances);
  scenario.liabilityBalances = normalizeClientLiabilityBalances(scenario.liabilityBalances);
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
      form.elements[key].value = key === "startingDebt" ? formatCurrency(value) : value;
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
  const debtAccounts = flattenAccounts(normalizedLiabilities, "liabilityBalances");

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
  state.plan = {
    ...state.plan,
    ...currentDraft,
    accountBalances: nextAccountBalances,
    liabilityBalances: nextLiabilityBalances,
    startingCash:
      sumAccountCategory(nextAccountBalances.checking) +
      sumAccountCategory(nextAccountBalances.savings),
    startingInvestments: sumAccountCategory(nextAccountBalances.investments),
    startingRetirement: sumAccountCategory(nextAccountBalances.retirement),
    startingDebt:
      sumAccountCategory(nextLiabilityBalances.creditCards) +
      sumAccountCategory(nextLiabilityBalances.carLoans) +
      sumAccountCategory(nextLiabilityBalances.mortgages) +
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

function buildObservedNetWorthSeries() {
  const snapshots = state.plan.historicalSnapshots || [];
  const currentNetWorth =
    state.plan.startingCash +
    state.plan.startingInvestments +
    (state.plan.startingRetirement || 0) -
    state.plan.startingDebt;
  const observed = snapshots.map((snapshot, index) => ({
    offset: index - snapshots.length,
    value:
      snapshot.cash +
      snapshot.investments +
      (snapshot.retirement || 0) -
      snapshot.debt,
  }));

  observed.push({ offset: 0, value: currentNetWorth });
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
      value = interpolateObservedValue(observed, offset);
    } else if (offset === 0) {
      value = state.forecast.points[0].netWorth;
      period = "current";
    } else {
      value = state.forecast.points[Math.min(offset, state.forecast.points.length - 1)].netWorth;
      period = "forecast";
    }

    return {
      label: monthKeyFromOffset(offset),
      value,
      period,
    };
  });
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

function renderRightRail() {
  const netWorthTimeline = buildNetWorthTimeline();

  if (state.activeSection !== "net-worth") {
    homeChart.innerHTML = "";
  }

  if (state.activeSection === "homepage") {
    chartKicker.textContent = "Homepage";
    chartTitle.textContent = "Net worth across four years";
    renderMetrics([]);
    drawTimelineChart(chart, netWorthTimeline);
    return;
  }

  if (state.activeSection === "net-worth") {
    chartKicker.textContent = "Net Worth";
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
    drawTimelineChart(homeChart, netWorthTimeline);
    return;
  }

  if (state.activeSection === "income") {
    const incomeTimeline = buildFlowTimeline("income");
    chartKicker.textContent = "Income";
    chartTitle.textContent = "Income across four years";
    renderMetrics([
      { label: "Monthly income now", value: formatCurrency(incomeTimeline[24].value) },
      { label: "Monthly income in 2 years", value: formatCurrency(incomeTimeline.at(-1).value) },
      { label: "Annual growth", value: `${state.plan.incomeGrowth.toFixed(1)}%` },
      { label: "Income sources", value: String(normalizeIncomeSources(state.plan.incomeSources).length) },
    ]);
    drawTimelineChart(chart, incomeTimeline);
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
        : "Net Worth";
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
  drawTimelineChart(homeChart, netWorthTimeline);
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
  const recurringTransactions = buildIncomeTransactions(scenario);
  const oneTimeTransactions = normalizeOneTimeEntries(
    scenario.oneTimeIncome || [],
    "One-time income",
  ).map((income) => ({
    date: income.date,
    source: income.name,
    frequency: "One-time",
    amount: income.amount,
  }));
  const transactions = [...recurringTransactions, ...oneTimeTransactions].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
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
                <span>${transaction.date}</span>
                <span>${escapeHtml(transaction.source)}</span>
                <span>${transaction.frequency === "One-time" ? "One-time" : incomeFrequencyLabel(transaction.frequency)}</span>
                <span>${formatCurrency(transaction.amount)}</span>
              </div>
            `,
          ),
        ].join("");
}

function renderBillTransactions(scenario) {
  const recurringTransactions = buildBillTransactions(scenario);
  const oneTimeTransactions = normalizeOneTimeEntries(scenario.oneTimeBills || [], "One-time bill").map((bill) => ({
    date: bill.date,
    source: bill.name,
    frequency: "One-time",
    amount: bill.amount,
  }));
  const transactions = [...recurringTransactions, ...oneTimeTransactions].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
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
                <span>${transaction.date}</span>
                <span>${escapeHtml(transaction.source)}</span>
                <span>${transaction.frequency === "One-time" ? "One-time" : incomeFrequencyLabel(transaction.frequency)}</span>
                <span>${formatCurrency(transaction.amount)}</span>
              </div>
            `,
          ),
        ].join("");
}

function render() {
  if (!state.plan || !state.forecast) {
    return;
  }

  setFormValues(state.plan);
  renderHistory(state.plan);
  renderIncomeTransactions(state.plan);
  renderBillTransactions(state.plan);
  renderRightRail();
}

async function loadBootstrap() {
  const response = await fetch("/api/bootstrap");
  state = await response.json();
  render();
}

async function saveScenario() {
  const payload = {
    ...state.plan,
    ...formDataToScenario(),
    historicalSnapshots: state.plan.historicalSnapshots,
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
setActiveSection("homepage");
