// Derives the reporting periods, trend range and forecast horizon from the `months` table
// instead of hardcoding them in source. Everything the dashboard labels -- "YTD thru June 2026",
// "MTD — July 1–15, 2026 (partial)" -- is produced here from each month's year, period_end and
// is_complete flag, so loading a new month rolls the whole site forward with no code change.
//
// The rules, stated once:
//   mtd_current  = the newest month loaded
//   mtd_prior    = the month before that
//   ytd_current  = every month loaded
//   ytd_prior    = every month except the newest
// A month is "partial" when is_complete is false (e.g. July 1-15 mid-month payroll). Trend
// charts and the forecast horizon only ever count complete months, so a half-month never drags
// a trend line down or shortens the forecast.

const MONTH_ABBREV = {
  January: 'Jan', February: 'Feb', March: 'Mar', April: 'Apr', May: 'May', June: 'Jun',
  July: 'Jul', August: 'Aug', September: 'Sep', October: 'Oct', November: 'Nov', December: 'Dec',
};

const MONTHS_IN_YEAR = 12;

// period_end arrives as a plain 'YYYY-MM-DD' string. Parsing it with `new Date()` would apply
// the server's timezone and can shift the date back a day, so pull the parts out directly.
function dayOfMonth(periodEnd) {
  if (!periodEnd) return null;
  const parts = String(periodEnd).slice(0, 10).split('-');
  return parts.length === 3 ? Number(parts[2]) : null;
}

function monthLabel(m) {
  return `${m.key} ${m.year}`;
}

// "June 2026" for a complete month, "July 15, 2026" for a partial one -- a partial month has to
// name the cut-off date or the number underneath it is misleading.
function endLabel(m) {
  if (!m) return '';
  if (m.is_complete) return monthLabel(m);
  const day = dayOfMonth(m.period_end);
  return day ? `${m.key} ${day}, ${m.year}` : monthLabel(m);
}

function mtdLabel(m) {
  if (!m) return '';
  if (m.is_complete) return `MTD — ${monthLabel(m)}`;
  const day = dayOfMonth(m.period_end);
  return day ? `MTD — ${m.key} 1–${day}, ${m.year} (partial)` : `MTD — ${monthLabel(m)} (partial)`;
}

export function buildPeriodModel(monthRows, forecastMeta) {
  const months = [...(monthRows || [])].sort((a, b) => a.sort_order - b.sort_order);
  if (!months.length) {
    return {
      months: [], allMonths: [], trendMonths: [], periods: [], entityPeriodLabels: {},
      forecastPeriodKey: null, forecastMonthCount: 0, forecastBaseLabel: '', forecastIsStale: false,
      defaultPeriodKey: null,
    };
  }

  const complete = months.filter((m) => m.is_complete);
  const latest = months[months.length - 1];
  const prior = months.length > 1 ? months[months.length - 2] : null;
  const latestComplete = complete.length ? complete[complete.length - 1] : null;

  const allMonths = months.map((m) => m.key);
  const trendMonths = complete.map((m) => m.key);

  const periods = [];
  if (prior) periods.push({ key: 'mtd_prior', label: mtdLabel(prior), months: [prior.key] });
  periods.push({ key: 'mtd_current', label: mtdLabel(latest), months: [latest.key] });
  if (months.length > 1) {
    const priorYtd = months.slice(0, -1);
    periods.push({
      key: 'ytd_prior',
      label: `YTD thru ${endLabel(priorYtd[priorYtd.length - 1])}`,
      months: priorYtd.map((m) => m.key),
    });
  }
  periods.push({ key: 'ytd_current', label: `YTD thru ${endLabel(latest)}`, months: allMonths });

  // The forecast picks up where actuals stop, so it belongs on whichever YTD period ends at the
  // last complete month -- that is ytd_prior while a partial month is loaded, ytd_current once
  // the partial is replaced by a closed month.
  const forecastPeriodKey =
    latestComplete && latest.key === latestComplete.key ? 'ytd_current' : 'ytd_prior';

  // What the stored forecast_rows were actually built from, rather than what we wish they were.
  const meta = forecastMeta || null;
  const forecastMonthCount = meta ? meta.forecast_month_count : Math.max(MONTHS_IN_YEAR - complete.length, 0);
  const forecastBaseLabel = meta ? `${meta.base_through_month} ${meta.base_through_year}` : '';
  // True when actuals have moved past the point the forecast was generated from -- e.g. July has
  // closed but forecast_rows still projects July-December. Surfaced in the UI rather than
  // silently producing a forecast that double-counts a month.
  const forecastIsStale = Boolean(
    meta && latestComplete && (meta.base_through_month !== latestComplete.key || meta.base_through_year !== latestComplete.year)
  );

  const entityPeriodLabels = {};
  const forecastPeriod = periods.find((p) => p.key === forecastPeriodKey);
  if (forecastPeriod) entityPeriodLabels[forecastPeriodKey] = `${forecastPeriod.label} + Forecast`;

  return {
    months, allMonths, trendMonths, periods, entityPeriodLabels,
    forecastPeriodKey, forecastMonthCount, forecastBaseLabel, forecastIsStale,
    defaultPeriodKey: 'ytd_current',
    trendRangeLabel: trendMonths.length
      ? `${complete[0].key} through ${complete[complete.length - 1].key} ${complete[complete.length - 1].year}`
      : '',
  };
}

// Resolves a ?period= query value against the derived list, falling back to the default rather
// than 404ing if an old bookmarked period key no longer exists.
export function resolvePeriod(model, requestedKey) {
  return (
    model.periods.find((p) => p.key === requestedKey) ||
    model.periods.find((p) => p.key === model.defaultPeriodKey) ||
    model.periods[model.periods.length - 1] ||
    null
  );
}

export function monthAbbrev(key) {
  return MONTH_ABBREV[key] || String(key).slice(0, 3);
}
