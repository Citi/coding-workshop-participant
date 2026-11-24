// UI helpers for the MUI-based forms used across the app (FormDialog field ids are "field-<name>"),
// the view switches, the dashboard's KPI cards and the filters kept in the URL.

/** Type into a text/number/date field of the open dialog (clears it first). */
export function fill(name, value) {
  cy.get(`#field-${name}`).clear()
  if (value !== '') cy.get(`#field-${name}`).type(String(value))
}

// MUI v9 renders a select's label as a <div class="MuiInputLabel-root"> (not a <label>).
const LABEL = '.MuiInputLabel-root'

/** Choose an option of a select field in the open dialog by its visible label. */
export function choose(label, option) {
  cy.get('[role="dialog"]').contains(LABEL, new RegExp(`^${label}`)).parent().find('[role="combobox"]').click()
  cy.get('[role="listbox"]').contains('[role="option"]', option).click()
}

/** Pick one value in a multiselect (Autocomplete) field. */
export function pickMulti(name, option) {
  cy.get(`#field-${name}`).click().type(option)
  cy.get('[role="listbox"]').contains('[role="option"]', option).click()
  // Close the suggestions by clicking the dialog title (Escape would close the whole dialog)
  cy.get('#form-dialog-title').click()
}

/** Choose an option of a FilterBar select by its label. */
export function filterBy(label, option) {
  cy.contains(LABEL, new RegExp(`^${label}`)).parent().find('[role="combobox"]').click()
  cy.get('[role="listbox"]').contains('[role="option"]', option).click()
}

export function save() {
  cy.get('[role="dialog"]').find('button[type="submit"]').click()
}

/**
 * Show one of a page's views with its switch, e.g. Projects "List" | "Timeline" or Resources
 * "List" | "Heat map". The view is kept in the URL (?view=timeline; the list has no parameter).
 */
export function chooseView(label) {
  const button = () => cy.get('[role="group"][aria-label="View"]').contains('button', label)
  button().click()
  button().should('have.attr', 'aria-pressed', 'true')
}

/** A dashboard KPI card: one link to the list behind its figure, named "<label>: <value>, <helper>". */
export function kpiCard(label) {
  return cy.get(`section[aria-label="Key figures"] a[aria-label^="${label}: "]`)
}

/**
 * Assert query parameters of the current route (filters and views live in the URL), e.g.
 * expectUrlParams({ search: 'Apollo', view: 'timeline' }); null asserts that a parameter is absent.
 */
export function expectUrlParams(expected) {
  cy.location('hash').should((hash) => {
    const params = new URLSearchParams(hash.split('?')[1] || '')
    Object.entries(expected).forEach(([name, value]) => expect(params.get(name), `URL parameter "${name}"`).to.eq(value))
  })
}

export function dateOffset(days) {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

/** A run-unique prefix so tests never collide with demo data or earlier runs. */
export const RUN = `E2E ${Date.now().toString(36)}`
