// Formatting helpers so dates, money and percentages look the same everywhere.

const dateFormatter = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 })
const wholeCurrencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })

/** '2026-03-01' -> 'Mar 1, 2026' (dates are calendar dates, formatted in UTC to avoid day shifts). */
export function formatDate(value) {
  if (!value) return '—'
  const date = new Date(String(value).length === 10 ? `${value}T00:00:00Z` : value)
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date)
}

/** 1234.5 -> '$1,234.5' ; { whole: true } -> '$1,235' */
export function formatCurrency(value, { whole = false } = {}) {
  if (value === null || value === undefined || value === '') return '—'
  const number = Number(value)
  if (Number.isNaN(number)) return '—'
  return (whole ? wholeCurrencyFormatter : currencyFormatter).format(number)
}

/** 40.7 -> '40.7%' ; null -> '—' */
export function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return '—'
  return `${Number(value)}%`
}

/** Today's date as 'YYYY-MM-DD' (UTC, matching the API's business date). */
export function todayIso() {
  return new Date().toISOString().slice(0, 10)
}

/** Colour for budget consumption: red above 100%, amber above 80%. */
export function budgetColor(percent) {
  if (percent === null || percent === undefined || percent > 100) return 'error'
  if (percent > 80) return 'warning'
  return 'primary'
}
