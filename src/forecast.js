function toMonthlyRate(annualPercent) {
  return annualPercent / 100 / 12;
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function monthKeyToDate(monthKey) {
  const [year, month] = String(monthKey).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, 1));
}

function currentMonthKey() {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function planningAnchorMonth(scenario) {
  const latestHistoricalMonth = scenario.historicalSnapshots?.at(-1)?.month || "2026-03";
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

function occurrencesForMonth(source, targetMonthDate, fallbackMonth) {
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
  const paymentDate = new Date(Date.UTC(targetMonthDate.getUTCFullYear(), targetMonthDate.getUTCMonth(), paymentDay));
  return paymentDate >= startDate ? 1 : 0;
}

function buildRecurringTransactions(sources, annualGrowthRate, scenario, fallbackAmount, kind) {
  if (!Array.isArray(sources) || sources.length === 0) {
    return [];
  }

  const fallbackMonth = planningAnchorMonth(scenario);
  const anchorMonth = monthKeyToDate(fallbackMonth);
  const forecastMonths = Number(scenario?.forecastMonths || 0);
  const transactions = [];

  sources.forEach((source, sourceIndex) => {
    const startDate = dateFromInput(source.startDate, fallbackMonth);

    for (let monthOffset = 0; monthOffset <= forecastMonths; monthOffset += 1) {
      const targetMonthDate = addMonths(anchorMonth, monthOffset);
      const monthStart = startOfMonth(targetMonthDate);
      const monthEnd = endOfMonth(targetMonthDate);
      const grownAmount =
        Number(source.amount || fallbackAmount || 0) *
        Math.pow(1 + Number(annualGrowthRate || 0) / 100, monthOffset / 12);

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
            id: `${kind}:recurring:${sourceIndex}:${isoDate(paymentDate)}`,
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
        const dates = [
          new Date(Date.UTC(targetMonthDate.getUTCFullYear(), targetMonthDate.getUTCMonth(), 15)),
          new Date(
            Date.UTC(
              targetMonthDate.getUTCFullYear(),
              targetMonthDate.getUTCMonth(),
              daysInMonth(targetMonthDate),
            ),
          ),
        ];

        dates.forEach((paymentDate) => {
          if (paymentDate >= startDate) {
            transactions.push({
              id: `${kind}:recurring:${sourceIndex}:${isoDate(paymentDate)}`,
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
          id: `${kind}:recurring:${sourceIndex}:${isoDate(paymentDate)}`,
          kind: "recurring",
          date: isoDate(paymentDate),
          source: source.name,
          frequency: source.frequency,
          amount: grownAmount,
        });
      }
    }
  });

  return transactions;
}

function buildOneTimeTransactions(entries, kind, label) {
  return (Array.isArray(entries) ? entries : []).map((entry, index) => ({
    id: `${kind}:one-time:${index}`,
    kind: "one-time",
    date: String(entry?.date || ""),
    source: entry?.name || `${label} ${index + 1}`,
    frequency: "one-time",
    amount: Number(entry?.amount || 0),
  }));
}

function applyTransactionOverrides(transactions, overrides) {
  const overrideMap = new Map(
    (Array.isArray(overrides) ? overrides : []).map((entry) => [entry.id, entry]),
  );

  return transactions
    .map((transaction) => {
      const override = overrideMap.get(transaction.id);
      return override
        ? {
            ...transaction,
            date: String(override.date || transaction.date),
            amount: Number(override.amount ?? transaction.amount),
          }
        : transaction;
    })
    .sort((left, right) => left.date.localeCompare(right.date));
}

function buildIncomeTransactions(scenario) {
  return applyTransactionOverrides(
    [
      ...buildRecurringTransactions(
        Array.isArray(scenario.incomeSources) ? scenario.incomeSources : [],
        scenario.incomeGrowth,
        scenario,
        scenario.monthlyIncome,
        "income",
      ),
      ...buildOneTimeTransactions(scenario.oneTimeIncome, "income", "One-time income"),
    ],
    scenario.incomeTransactionOverrides,
  );
}

function buildBillTransactions(scenario) {
  return applyTransactionOverrides(
    [
      ...buildRecurringTransactions(
        Array.isArray(scenario.billSources) ? scenario.billSources : [],
        scenario.expenseGrowth,
        scenario,
        scenario.monthlyExpenses,
        "bill",
      ),
      ...buildOneTimeTransactions(scenario.oneTimeBills, "bill", "One-time bill"),
    ],
    scenario.billTransactionOverrides,
  );
}

function totalTransactionAmountForMonth(transactions, scenario, monthOffset) {
  const currentMonth = planningAnchorMonth(scenario);
  const targetMonthDate = addMonths(monthKeyToDate(currentMonth), monthOffset);
  const targetMonthKey = `${targetMonthDate.getUTCFullYear()}-${String(targetMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;

  return transactions.reduce((sum, transaction) => {
    const entryDate = dateFromInput(transaction.date, currentMonth);
    const entryMonthKey = `${entryDate.getUTCFullYear()}-${String(entryDate.getUTCMonth() + 1).padStart(2, "0")}`;
    return sum + (entryMonthKey === targetMonthKey ? Number(transaction.amount || 0) : 0);
  }, 0);
}

function projectSnapshot(scenario, month) {
  const incomeTransactions = buildIncomeTransactions(scenario);
  const billTransactions = buildBillTransactions(scenario);
  const recurringIncome = totalTransactionAmountForMonth(
    incomeTransactions.filter((transaction) => transaction.kind === "recurring"),
    scenario,
    month,
  );
  const oneTimeIncome = totalTransactionAmountForMonth(
    incomeTransactions.filter((transaction) => transaction.kind === "one-time"),
    scenario,
    month,
  );
  const income = recurringIncome + oneTimeIncome;
  const recurringBills = totalTransactionAmountForMonth(
    billTransactions.filter((transaction) => transaction.kind === "recurring"),
    scenario,
    month,
  );
  const oneTimeBills = totalTransactionAmountForMonth(
    billTransactions.filter((transaction) => transaction.kind === "one-time"),
    scenario,
    month,
  );
  const bills = recurringBills + oneTimeBills;
  const expenses = bills;
  const mortgagePayment = Number(scenario.monthlyMortgagePaydown || 0);
  const autoLoanPayment = Number(scenario.monthlyAutoLoanPaydown || 0);
  const investableCash =
    income -
    expenses;

  return {
    recurringIncome,
    oneTimeIncome,
    income,
    recurringBills,
    oneTimeBills,
    expenses,
    bills,
    mortgagePayment,
    autoLoanPayment,
    investableCash,
  };
}

function buildRealEstateForecast(scenario) {
  const monthlyAppreciation = toMonthlyRate(scenario.homeValueGrowth || 0);
  const monthlyMortgagePaydown = Number(scenario.monthlyMortgagePaydown || 0);
  let homeValue = Number(scenario.homeValue || 0);
  let mortgageBalance = Number(scenario.mortgageBalance || 0);
  const points = [];

  for (let month = 0; month <= scenario.forecastMonths; month += 1) {
    if (month > 0) {
      homeValue *= 1 + monthlyAppreciation;
      mortgageBalance = Math.max(mortgageBalance - monthlyMortgagePaydown, 0);
    }

    points.push({
      month,
      homeValue: round(homeValue),
      mortgageBalance: round(mortgageBalance),
      equity: round(homeValue - mortgageBalance),
    });
  }

  return points;
}

function buildAutoForecast(scenario) {
  const monthlyChange = toMonthlyRate(scenario.autoValueGrowth || 0);
  const monthlyAutoLoanPaydown = Number(scenario.monthlyAutoLoanPaydown || 0);
  let autoValue = Number(scenario.autoValue || 0);
  let autoLoanBalance = Number(scenario.autoLoanBalance || 0);
  const points = [];

  for (let month = 0; month <= scenario.forecastMonths; month += 1) {
    if (month > 0) {
      autoValue *= 1 + monthlyChange;
      autoLoanBalance = Math.max(autoLoanBalance - monthlyAutoLoanPaydown, 0);
    }

    points.push({
      month,
      autoValue: round(autoValue),
      autoLoanBalance: round(autoLoanBalance),
      equity: round(autoValue - autoLoanBalance),
    });
  }

  return points;
}

function buildForecast(scenario) {
  let cash = scenario.startingCash;
  let investments = scenario.startingInvestments;
  let retirement = scenario.startingRetirement;
  let unsecuredDebt = Math.max(
    Number(scenario.startingDebt || 0) -
      Number(scenario.mortgageBalance || 0) -
      Number(scenario.autoLoanBalance || 0),
    0,
  );
  const monthlyReturn = toMonthlyRate(scenario.investmentReturn);
  const points = [];
  const realEstatePoints = buildRealEstateForecast(scenario);
  const autoPoints = buildAutoForecast(scenario);
  const monthZeroProjection = projectSnapshot(scenario, 0);

  for (let month = 0; month <= scenario.forecastMonths; month += 1) {
    let current = null;
    const realEstatePoint = realEstatePoints[Math.min(month, realEstatePoints.length - 1)] || {};
    const autoPoint = autoPoints[Math.min(month, autoPoints.length - 1)] || {};
    const homeValue = Number(realEstatePoint.homeValue || 0);
    const mortgageBalance = Number(realEstatePoint.mortgageBalance || 0);
    const autoValue = Number(autoPoint.autoValue || 0);
    const autoLoanBalance = Number(autoPoint.autoLoanBalance || 0);
    const debt = unsecuredDebt + mortgageBalance + autoLoanBalance;

    if (month > 0) {
      current = projectSnapshot(scenario, month);
      cash += current.income;
      cash -= current.expenses;
      const debtPayment = Math.min(unsecuredDebt, scenario.monthlyDebtPayment);
      unsecuredDebt -= debtPayment;

      investments *= 1 + monthlyReturn;
      retirement *= 1 + monthlyReturn;
    }

    points.push({
      month,
      cash: round(cash),
      investments: round(investments),
      retirement: round(retirement),
      debt: round(debt),
      homeValue: round(homeValue),
      autoValue: round(autoValue),
      recurringIncome: month === 0 ? round(monthZeroProjection.recurringIncome) : round(current.recurringIncome),
      oneTimeIncome: month === 0 ? round(monthZeroProjection.oneTimeIncome) : round(current.oneTimeIncome),
      recurringBills: month === 0 ? round(monthZeroProjection.recurringBills) : round(current.recurringBills),
      oneTimeBills: month === 0 ? round(monthZeroProjection.oneTimeBills) : round(current.oneTimeBills),
      mortgagePayment: month === 0 ? round(Number(scenario.monthlyMortgagePaydown || 0)) : round(current.mortgagePayment),
      autoLoanPayment: month === 0 ? round(Number(scenario.monthlyAutoLoanPaydown || 0)) : round(current.autoLoanPayment),
      fixedExpenses: month === 0 ? round(monthZeroProjection.bills) : round(current.bills),
      variableExpenses: 0,
      netWorth: round(cash + investments + retirement + homeValue + autoValue - debt),
    });
  }

  const start = points[0];
  const end = points[points.length - 1];
  const debtFreeMonth = points.find((point) => point.debt <= 0)?.month ?? null;

  return {
    summary: {
      startingNetWorth: start.netWorth,
      endingNetWorth: end.netWorth,
      changeInNetWorth: round(end.netWorth - start.netWorth),
      debtFreeMonth,
      currentMonthlyIncome: round(totalTransactionAmountForMonth(buildIncomeTransactions(scenario), scenario, 0)),
      currentMonthlyExpenses: round(totalTransactionAmountForMonth(buildBillTransactions(scenario), scenario, 0)),
      currentHomeValue: round(realEstatePoints[0]?.homeValue || 0),
      currentMortgageBalance: round(realEstatePoints[0]?.mortgageBalance || 0),
      currentHomeEquity: round(realEstatePoints[0]?.equity || 0),
      currentAutoValue: round(autoPoints[0]?.autoValue || 0),
      currentAutoLoanBalance: round(autoPoints[0]?.autoLoanBalance || 0),
      currentAutoEquity: round(autoPoints[0]?.equity || 0),
    },
    points,
    realEstatePoints,
    autoPoints,
  };
}

module.exports = {
  buildForecast,
};
