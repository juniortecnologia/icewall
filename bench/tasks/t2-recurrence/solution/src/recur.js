function parseDate(str) {
  const [y, m, d] = str.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function formatDate(d) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function addDays(d, n) {
  const res = new Date(d);
  res.setUTCDate(res.getUTCDate() + n);
  return res;
}

export function nextOccurrences(rule, from, count) {
  if (count <= 0) return [];

  const interval = rule.interval ?? 1;
  if (!Number.isInteger(interval) || interval < 1) {
    throw new RangeError("interval must be an integer >= 1");
  }

  const startDate = parseDate(rule.start);
  const fromDate = from ? parseDate(from) : startDate;

  const results = [];

  if (rule.freq === "daily") {
    let k = 0;
    while (results.length < count) {
      const candidate = addDays(startDate, k * interval);
      if (candidate >= fromDate && candidate >= startDate) {
        results.push(formatDate(candidate));
      }
      k++;
    }
  } else if (rule.freq === "weekly") {
    const days = [...new Set(rule.byWeekday ?? [startDate.getUTCDay()])].sort((a, b) => a - b);
    const sunday0 = addDays(startDate, -startDate.getUTCDay());
    // Primeira semana ativa que pode conter `from`: semanas desde sunday0, arredondadas para baixo ao intervalo.
    const weeksToFrom = Math.floor((fromDate - sunday0) / (7 * 86_400_000));
    let k = Math.max(0, Math.floor(weeksToFrom / interval));
    while (results.length < count) {
      const sunday = addDays(sunday0, k * interval * 7);
      for (const wd of days) {
        const candidate = addDays(sunday, wd);
        if (results.length < count && candidate >= fromDate && candidate >= startDate) results.push(formatDate(candidate));
      }
      k++;
    }
  } else if (rule.freq === "monthly") {
    const targetDay = rule.byMonthDay ?? startDate.getUTCDate();
    const startYear = startDate.getUTCFullYear();
    const startMonth = startDate.getUTCMonth();
    const fromYear = fromDate.getUTCFullYear();
    const fromMonth = fromDate.getUTCMonth();
    let k = 0;
    if (fromDate > startDate) {
      const monthsDiff = (fromYear - startYear) * 12 + (fromMonth - startMonth);
      if (monthsDiff > 0) {
        k = Math.ceil(monthsDiff / interval);
      }
    }

    while (results.length < count) {
      const targetMonthIndex = startMonth + k * interval;
      const targetYear = startYear + Math.floor(targetMonthIndex / 12);
      const targetMonth = ((targetMonthIndex % 12) + 12) % 12; // 0-11

      const candidate = new Date(Date.UTC(targetYear, targetMonth, targetDay));
      if (candidate.getUTCMonth() === targetMonth) {
        if (candidate >= fromDate && candidate >= startDate) {
          results.push(formatDate(candidate));
        }
      }

      k++;
    }
  }

  return results;
}
