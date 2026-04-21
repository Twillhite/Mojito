function toMonthlyRate(annualPercent) {
  return annualPercent / 100 / 12;
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

function totalScheduledIncome(scenario, monthOffset) {
  return (
    totalScheduledAmount(
      Array.isArray(scenario.incomeSources) ? scenario.incomeSources : [],
      scenario.monthlyIncome,
      scenario.incomeGrowth,
      scenario,
      monthOffset,
    ) + totalOneTimeEntries(scenario.oneTimeIncome, scenario, monthOffset)
  );
}

function totalScheduledBills(scenario, monthOffset) {
  return (
    totalScheduledAmount(
      Array.isArray(scenario.billSources) ? scenario.billSources : [],
      scenario.monthlyExpenses,
      scenario.expenseGrowth,
      scenario,
      monthOffset,
    ) + totalOneTimeBills(scenario, monthOffset)
  );
}

function totalOneTimeBills(scenario, monthOffset) {
  return totalOneTimeEntries(scenario.oneTimeBills, scenario, monthOffset);
}

function totalOneTimeEntries(entries, scenario, monthOffset) {
  const list = Array.isArray(entries) ? entries : [];
  if (list.length === 0) {
    return 0;
  }

  const currentMonth = planningAnchorMonth(scenario);
  const targetMonthDate = addMonths(monthKeyToDate(currentMonth), monthOffset);
  const targetMonthKey = `${targetMonthDate.getUTCFullYear()}-${String(targetMonthDate.getUTCMonth() + 1).padStart(2, "0")}`;

  return list.reduce((sum, entry) => {
    const entryDate = dateFromInput(entry.date, currentMonth);
    const entryMonthKey = `${entryDate.getUTCFullYear()}-${String(entryDate.getUTCMonth() + 1).padStart(2, "0")}`;
    return sum + (entryMonthKey === targetMonthKey ? Number(entry.amount || 0) : 0);
  }, 0);
}

function totalScheduledAmount(sources, fallbackAmount, annualGrowthRate, scenario, monthOffset) {
  if (sources.length === 0) {
    return Number(fallbackAmount || 0);
  }
  const currentMonth = planningAnchorMonth(scenario);
  const targetMonthDate = addMonths(monthKeyToDate(currentMonth), monthOffset);
  const growthFactor = monthOffset / 12;

  return sources.reduce((sum, source) => {
    const occurrences = occurrencesForMonth(source, targetMonthDate, currentMonth);
    const grownAmount =
      Number(source.amount || 0) * Math.pow(1 + Number(annualGrowthRate || 0) / 100, growthFactor);
    return sum + occurrences * grownAmount;
  }, 0);
}

function projectSnapshot(scenario, month) {
  const income = totalScheduledIncome(scenario, month);
  const bills = totalScheduledBills(scenario, month);
  const expenses = bills;
  const investableCash = income - expenses - scenario.monthlyDebtPayment;

  return {
    income,
    expenses,
    bills,
    investableCash,
  };
}

function buildForecast(scenario) {
  let cash = scenario.startingCash;
  let investments = scenario.startingInvestments;
  let retirement = scenario.startingRetirement;
  let debt = scenario.startingDebt;
  const monthlyReturn = toMonthlyRate(scenario.investmentReturn);
  const points = [];

  for (let month = 0; month <= scenario.forecastMonths; month += 1) {
    let current = null;

    if (month > 0) {
      current = projectSnapshot(scenario, month);
      cash += current.income - current.expenses;

      const debtPayment = Math.min(debt, scenario.monthlyDebtPayment);
      cash -= debtPayment;
      debt -= debtPayment;

      if (cash > scenario.cashReserveTarget) {
        const surplus = cash - scenario.cashReserveTarget;
        const retirementContribution = surplus * 0.25;
        const taxableInvestmentContribution = surplus - retirementContribution;
        retirement += retirementContribution;
        investments += taxableInvestmentContribution;
        cash -= surplus;
      }

      investments *= 1 + monthlyReturn;
      retirement *= 1 + monthlyReturn;
    }

    points.push({
      month,
      cash: round(cash),
      investments: round(investments),
      retirement: round(retirement),
      debt: round(debt),
      fixedExpenses: month === 0 ? round(totalScheduledBills(scenario, 0)) : round(current.bills),
      variableExpenses: 0,
      netWorth: round(cash + investments + retirement - debt),
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
      currentMonthlyIncome: round(totalScheduledIncome(scenario, 0)),
      currentMonthlyExpenses: round(totalScheduledBills(scenario, 0)),
    },
    points,
  };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

module.exports = {
  buildForecast,
};
