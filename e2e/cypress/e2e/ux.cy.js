// The UX upgrade end to end: dashboard figures that open the list behind them, filters kept in the
// address bar, sortable columns, the projects timeline, the allocation heat map, the allocation
// what-if, the database wake-up ping on the login page and urgency labels.
// Retry-safe: every block creates its own records through the API (RUN prefix) and the file deletes
// them at the end. Nothing depends on how many demo records there are, and the figures that other
// test runs can change at the same time (the dashboard's) are read again before a test fails.
import { USERS } from '../support/commands'
import { choose, dateOffset, fill, filterBy, RUN } from '../support/ui'

// ---------------------------------------------------------------------------------------------
// Helpers for this spec
// ---------------------------------------------------------------------------------------------

/** 'YYYY-MM-DD' -> 'Nov 25, 2026', as the app shows calendar dates (in UTC). */
const dateFormat = new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' })
const dateText = (iso) => dateFormat.format(new Date(`${iso}T00:00:00Z`))

/** A hash route with its query string, encoded: route('/projects', { view: 'timeline' }). */
function route(path, params = {}) {
  const query = new URLSearchParams(params).toString()
  return query ? `${path}?${query}` : path
}

/** '#/projects?health=at_risk%2Coverdue' -> { path: '/projects', params: { health: 'at_risk,overdue' } } */
function parseHash(hash) {
  const [path, query = ''] = hash.replace(/^#/, '').split('?')
  return { path, params: Object.fromEntries(new URLSearchParams(query)) }
}

/** The address bar shows `path` with exactly these query parameters (in any order, encoded or not). */
const expectRoute = (path, params = {}) =>
  cy.location('hash').should((hash) => {
    expect(parseHash(hash), `address bar ${hash}`).to.deep.equal({ path, params })
  })

/** POST as admin; fails with the API's error when the record is not created. Yields the record. */
const create = (path, body) =>
  cy.api('POST', path, body).then(({ status, body: created }) => {
    expect(status, `POST ${path} ${JSON.stringify(created?.error ?? '')}`).to.be.oneOf([200, 201])
    return created
  })

/** A project whose dates are offsets in days from today (active by default). */
const createProject = (name, { status = 'active', start = 0, end = 60 } = {}) =>
  create('/projects', { name, department: 'E2E UX', status, start_date: dateOffset(start), end_date: dateOffset(end), budget: 10000 })

let emailCount = 0
const createPerson = (fullName) => {
  emailCount += 1
  return create('/resources', {
    full_name: fullName,
    email: `ux.${Date.now()}.${emailCount}@e2e.acme.com`,
    job_title: 'Analyst',
    department: 'E2E UX',
  })
}

const allocate = (resourceId, projectId, percent) =>
  create('/allocations', { resource_id: resourceId, project_id: projectId, allocation_percent: percent })

const table = (label) => `table[aria-label="${label}"]`
const rows = (label) => cy.get(`${table(label)} tbody tr`)
const rowWith = (label, text) => cy.contains(`${table(label)} tbody tr`, text)
const viewButton = (label) => cy.get('[role="group"][aria-label="View"]').contains('button', label)

/**
 * The text of each row of a DataTable once its data has loaded (none when it shows its empty state).
 * Use it right after the page opened (its first load starts as "loading", so there is no stale moment).
 * Texts, not elements: Cypress would turn an array of elements back into a jQuery object.
 */
function loadedRowTexts(label) {
  cy.get('main').find('[role="status"], [aria-label="Refreshing"]').should('not.exist')
  return cy
    .get('main')
    .should(($main) => {
      const loaded = $main.find(table(label)).length > 0 || /No matching|No \w+ yet/.test($main.text())
      expect(loaded, `the ${label} list has loaded`).to.equal(true)
    })
    .then(($main) => $main.find(`${table(label)} tbody tr`).toArray().map((row) => row.innerText))
}

/** The first percentage in a text: 'Total 110% Over-allocated' -> 110. */
const percentIn = (text) => Number(/(\d+(?:\.\d+)?)%/.exec(text)?.[1])

// ---------------------------------------------------------------------------------------------

after(() => {
  cy.cleanup('resources', RUN)
  cy.cleanup('projects', RUN) // deletes their deliverables and allocations too
})

describe('Dashboard figures open the list behind them', () => {
  // `ofTotal`: the card reads "X of Y" (completed of all); its list shows all Y.
  const KPIS = [
    { label: 'Active projects', path: '/projects', params: { status: 'active' }, list: 'Projects', rowShows: /Active/ },
    { label: 'Projects at risk', path: '/projects', params: { health: 'at_risk,overdue' }, list: 'Projects', rowShows: /At risk|Overdue/ },
    { label: 'Over-allocated', path: '/resources', params: { over_allocated: 'true' }, list: 'Resources', rowShows: /Over-allocated/ },
    { label: 'Key deliverables', path: '/deliverables', params: { is_key: 'true' }, list: 'Deliverables', rowShows: /Key/, ofTotal: true },
    { label: 'Overdue deliverables', path: '/deliverables', params: { overdue: 'true' }, list: 'Deliverables', rowShows: /overdue/ },
  ]
  /** Other test runs write to the same database: read both sides again this often before failing. */
  const ATTEMPTS = 4

  before(() => {
    // At least one record behind every card, whatever the demo data holds.
    createProject(`${RUN} Kpi Atlas`, { start: -30, end: 30 }).then((atlas) => {
      // Active and at risk; its key deliverable is overdue.
      create('/deliverables', { project_id: atlas.id, name: `${RUN} Kpi late step`, status: 'in_progress', due_date: dateOffset(-2), is_key: true })
      createProject(`${RUN} Kpi Boreas`).then((boreas) =>
        createPerson(`${RUN} Kpi Dana`).then((dana) => {
          allocate(dana.id, atlas.id, 60)
          allocate(dana.id, boreas.id, 50)
        }),
      )
    })
  })

  /** The card's number, from its accessible name: "Key deliverables: 1 of 9, 11% completed" -> 9 (ofTotal). */
  function cardFigure(kpi, name) {
    const match = new RegExp(`^${kpi.label}: (\\d+)(?: of (\\d+))?`).exec(name)
    expect(match, `"${name}" starts with "${kpi.label}: <number>"`).to.not.equal(null)
    return Number(kpi.ofTotal ? match[2] : match[1])
  }

  function cardMatchesList(kpi, attempt) {
    cy.visitAs('admin', '/')
    cy.get(`a[aria-label^="${kpi.label}: "]`).then(($card) => {
      const name = $card.attr('aria-label')
      const figure = cardFigure(kpi, name)
      cy.wrap($card).click()
      expectRoute(kpi.path, kpi.params)
      cy.contains('h1', kpi.list)
      loadedRowTexts(kpi.list).then((listed) => {
        if (listed.length !== figure && attempt < ATTEMPTS) {
          cy.log(`"${name}" but ${listed.length} rows: the data may have changed in between, reading both again`)
          cardMatchesList(kpi, attempt + 1)
          return
        }
        expect(listed.length, `rows listed after clicking "${name}"`).to.equal(figure)
        listed.forEach((text) => expect(text, 'a listed row').to.match(kpi.rowShows))
      })
    })
  }

  KPIS.forEach((kpi) => {
    it(`"${kpi.label}" opens ${route(kpi.path, kpi.params)} listing exactly the number on the card`, () => {
      cardMatchesList(kpi, 1)
    })
  })
})

describe('Filters in the address bar', () => {
  const PREFIX = `${RUN} Filter`
  const ACTIVE = `${PREFIX} Lyra`
  const PLANNED = `${PREFIX} Mira`

  before(() => {
    createProject(ACTIVE)
    createProject(PLANNED, { status: 'planned', start: 10, end: 70 })
  })

  const searchBox = () => cy.get('main input[placeholder="Name, description or department"]')
  const statusSelect = () => cy.contains('main .MuiInputLabel-root', /^Status/).parent().find('[role="combobox"]')

  /** The filtered list: the search and status shown in the filters, and only the active project. */
  function showsFilteredList() {
    expectRoute('/projects', { search: PREFIX, status: 'active' })
    searchBox().should('have.value', PREFIX)
    statusSelect().should('have.text', 'Active')
    rows('Projects').should('have.length', 1).first().should('contain', ACTIVE)
  }

  it('keeps a filter in the address bar, after a reload and after Back from a project page', () => {
    cy.visitAs('manager', '/projects')
    cy.contains('h1', 'Projects')
    searchBox().type(PREFIX)
    expectRoute('/projects', { search: PREFIX })
    rows('Projects').should('have.length', 2)
    filterBy('Status', 'Active')
    showsFilteredList()

    cy.reload()
    cy.contains('h1', 'Projects')
    showsFilteredList()

    rowWith('Projects', ACTIVE).find('td').first().click()
    cy.location('hash').should('match', /^#\/projects\/\d+$/)
    cy.contains('h1', ACTIVE)
    cy.go('back')
    cy.contains('h1', 'Projects')
    showsFilteredList()
  })
})

describe('Sortable columns', () => {
  const PREFIX = `${RUN} Sort`
  const ALPHA = `${PREFIX} alpha`
  const BRAVO = `${PREFIX} Bravo`
  const CHARLIE = `${PREFIX} Charlie`

  before(() => {
    // The API lists projects by end date: Charlie, alpha, Bravo.
    createProject(CHARLIE, { end: 10 })
    createProject(ALPHA, { end: 20 })
    createProject(BRAVO, { end: 30 })
  })

  const header = (text) => cy.contains(`${table('Projects')} thead th`, new RegExp(`^${text}$`))
  const sortBy = (text) => header(text).find('.MuiTableSortLabel-root').click()
  const namesInOrder = (expected) =>
    rows('Projects').should(($rows) => {
      const names = $rows.toArray().map((row) => [ALPHA, BRAVO, CHARLIE].find((name) => row.innerText.includes(name)))
      expect(names, 'projects from top to bottom').to.deep.equal(expected)
    })

  it('sorts by a column header: ascending, then descending, then back to the API order', () => {
    cy.visitAs('viewer', route('/projects', { search: PREFIX }))
    namesInOrder([CHARLIE, ALPHA, BRAVO])
    header('Project').should('not.have.attr', 'aria-sort')

    sortBy('Project')
    header('Project').should('have.attr', 'aria-sort', 'ascending')
    namesInOrder([ALPHA, BRAVO, CHARLIE]) // case-insensitive: "alpha" before "Bravo"

    sortBy('Project')
    header('Project').should('have.attr', 'aria-sort', 'descending')
    namesInOrder([CHARLIE, BRAVO, ALPHA])

    sortBy('Project')
    header('Project').should('not.have.attr', 'aria-sort')
    namesInOrder([CHARLIE, ALPHA, BRAVO])
    cy.get(`${table('Projects')} th[aria-sort]`).should('not.exist')
  })
})

describe('Projects timeline', () => {
  const PREFIX = `${RUN} Time`
  const PROJECTS = [
    { name: `${PREFIX} Nova`, start: 0, end: 60, health: 'On track' },
    { name: `${PREFIX} Rigel`, start: -30, end: 30, health: 'At risk' }, // half the time gone, nothing done
    { name: `${PREFIX} Sirius`, start: -60, end: -5, health: 'Overdue' }, // its end date has passed
  ]
  const [ON_TRACK, AT_RISK, OVERDUE] = PROJECTS

  before(() => {
    PROJECTS.forEach(({ name, start, end }) => createProject(name, { start, end }))
  })

  const timeline = 'ul[aria-label="Project timeline"]'
  const timelineRows = () => cy.get(`${timeline} > li`)
  const rowLink = (name) => cy.get(`${timeline} a[aria-label^="${name}: "]`)

  it('shows one row per listed project with its dates and health in its name, and the Today line', () => {
    cy.visitAs('viewer', route('/projects', { search: PREFIX }))
    rows('Projects').should('have.length', PROJECTS.length)
    viewButton('Timeline').click()
    expectRoute('/projects', { search: PREFIX, view: 'timeline' })
    viewButton('Timeline').should('have.attr', 'aria-pressed', 'true')
    viewButton('List').should('have.attr', 'aria-pressed', 'false')
    cy.get(table('Projects')).should('not.exist')

    timelineRows().should('have.length', PROJECTS.length)
    PROJECTS.forEach(({ name, start, end, health }) => {
      rowLink(name)
        .should('have.attr', 'aria-label')
        .and('contain', `${dateText(dateOffset(start))} – ${dateText(dateOffset(end))}`)
        .and('contain', health)
    })

    cy.get('[data-testid="timeline-today-label"]').should('be.visible').and('have.text', 'Today')
    timelineRows().each(($row) => cy.wrap($row).find('[data-testid="timeline-today"]').should('exist'))
    cy.get('ul[aria-label="Legend"]').should('contain', 'Today')

    // A row opens its project
    rowLink(AT_RISK.name).click()
    cy.contains('h1', AT_RISK.name)
  })

  it('narrows to the projects at risk or overdue with the Health filter, in both views', () => {
    cy.visitAs('viewer', route('/projects', { view: 'timeline', search: PREFIX }))
    timelineRows().should('have.length', PROJECTS.length)
    filterBy('Health', 'At risk or overdue')
    expectRoute('/projects', { view: 'timeline', search: PREFIX, health: 'at_risk,overdue' })
    timelineRows().should('have.length', 2)
    rowLink(AT_RISK.name).should('have.attr', 'aria-label').and('contain', 'At risk')
    rowLink(OVERDUE.name).should('have.attr', 'aria-label').and('contain', 'Overdue')
    cy.get(timeline).should('not.contain', ON_TRACK.name)

    // The list shows the same projects: switching views keeps the filters
    viewButton('List').click()
    expectRoute('/projects', { search: PREFIX, health: 'at_risk,overdue' })
    rows('Projects').should('have.length', 2)
    rowWith('Projects', AT_RISK.name).should('contain', 'At risk')
    rowWith('Projects', OVERDUE.name).should('contain', 'Overdue')
  })
})

describe('Allocation heat map', () => {
  const PREFIX = `${RUN} Heat`
  const OVER = `${PREFIX} Pia` // 60% + 50% on two active projects: 110%
  const WITHIN = `${PREFIX} Quinn` // 40% on an active project (30% on a planned one does not count)
  const PLANNED = `${PREFIX} Ceres`

  before(() => {
    createProject(`${PREFIX} Atlas`).then((atlas) =>
      createProject(`${PREFIX} Boreas`).then((boreas) =>
        createProject(PLANNED, { status: 'planned', start: 10, end: 70 }).then((ceres) => {
          createPerson(OVER).then((pia) => {
            allocate(pia.id, atlas.id, 60)
            allocate(pia.id, boreas.id, 50)
          })
          createPerson(WITHIN).then((quinn) => {
            allocate(quinn.id, atlas.id, 40)
            allocate(quinn.id, ceres.id, 30)
          })
        }),
      ),
    )
  })

  it("shows each person's total over active projects as the list does, and marks who is over-allocated", () => {
    cy.visitAs('viewer', route('/resources', { search: PREFIX }))
    rows('Resources').should('have.length', 2)

    // The list view's totals
    const listed = {}
    cy.get(`${table('Resources')} thead th`).then(($headers) => {
      const column = $headers.toArray().findIndex((th) => th.innerText.trim() === 'Total allocation')
      expect(column, 'the "Total allocation" column').to.be.greaterThan(-1)
      rows('Resources').each(($row) => {
        const name = [OVER, WITHIN].find((person) => $row.text().includes(person))
        listed[name] = percentIn($row.find('td').eq(column).text())
      })
    })
    cy.wrap(listed).should('deep.equal', { [OVER]: 110, [WITHIN]: 40 })
    rowWith('Resources', OVER).should('contain', 'Over-allocated')

    viewButton('Heat map').click()
    expectRoute('/resources', { search: PREFIX, view: 'heatmap' })
    viewButton('Heat map').should('have.attr', 'aria-pressed', 'true')
    cy.get('[role="region"][aria-label="Allocation heat map"]').within(() => {
      cy.get('caption').should('have.text', "Only active projects count toward a person's load; more than 100% is over-allocated.")
      cy.get('thead th').last().should('have.text', 'Total (active)')
      cy.contains('thead th', PLANNED).should('contain', 'Planned – not counted')
      cy.get('tbody tr').should('have.length', 2)
      ;[OVER, WITHIN].forEach((name) => {
        cy.contains('tbody tr', name)
          .find('td')
          .last()
          .should(($total) => expect(percentIn($total.text()), `${name}: Total (active)`).to.equal(listed[name]))
      })
      cy.contains('tbody tr', OVER).find('td').last().should('contain', 'Over-allocated')
      cy.contains('tbody tr', WITHIN).find('td').last().should('not.contain', 'Over-allocated')
    })
  })
})

describe('Allocation what-if', () => {
  const PREFIX = `${RUN} WhatIf`
  const PERSON = `${PREFIX} Wren`
  const TARGET = `${PREFIX} Vega`
  let targetId

  before(() => {
    createProject(`${PREFIX} Orion`).then((orion) => createPerson(PERSON).then((wren) => allocate(wren.id, orion.id, 60)))
    createProject(TARGET).then((vega) => {
      targetId = vega.id
    })
  })

  const targetAllocations = () => cy.api('GET', `/allocations?project_id=${targetId}`).its('body.items')

  it("shows the person's total before and after the change, and warns about over-allocation before saving", () => {
    // Retry-safe: nothing left from an earlier attempt
    targetAllocations().each((allocation) => cy.api('DELETE', `/allocations/${allocation.id}`))

    cy.visitAs('manager', `/projects/${targetId}`)
    cy.contains('h1', TARGET)
    cy.contains('[role="tab"]', 'Team').click()
    cy.contains('button', 'New allocation').click()
    choose('Team member', PERSON)
    fill('allocation_percent', 30)
    cy.get('[data-testid="allocation-what-if"]')
      .should('contain', `${PERSON}: 60% now → 90% after this change`)
      .and('contain', 'Within capacity')
      .and('not.contain', 'over-allocated')

    fill('allocation_percent', 50)
    cy.get('[data-testid="allocation-what-if"]')
      .should('contain', `${PERSON}: 60% now → 110% after this change`)
      .and('contain', 'Will be over-allocated – more than 100% across active projects')
    // The same facts for screen readers, once typing pauses
    cy.get('[role="dialog"] [role="status"]').should(
      'have.text',
      `${PERSON}: 60% now, 110% after this change. Will be over-allocated – more than 100% across active projects.`,
    )
    // A heads-up only: saving stays possible. Cancel: nothing was saved.
    cy.get('[role="dialog"] button[type="submit"]').should('be.enabled')
    cy.get('[role="dialog"]').contains('button', 'Cancel').click()
    cy.get('[role="dialog"]').should('not.exist')
    targetAllocations().should('have.length', 0)
  })
})

describe('Login page', () => {
  function signIn({ email, password }) {
    cy.get('#login-email').type(email)
    cy.get('#login-password').type(password, { log: false })
    cy.contains('button', 'Sign in').click()
    cy.location('hash').should('eq', '#/')
    cy.contains('h1', 'Dashboard')
  }

  it('pings GET /health/db to wake the database while the user types, and signing in works', () => {
    cy.intercept('GET', '**/health/db').as('wakeUp')
    cy.visit('/#/login')
    cy.wait('@wakeUp').then(({ request, response }) => {
      expect(request.headers, 'the ping sends no token').not.to.have.property('authorization')
      expect(response.statusCode).to.equal(200)
      expect(response.body).to.include({ database: 'ok' })
    })
    signIn(USERS.manager)
  })

  it('still signs in when the wake-up ping fails, without showing an error', () => {
    cy.intercept('GET', '**/health/db', { forceNetworkError: true }).as('wakeUp')
    cy.visit('/#/login')
    cy.wait('@wakeUp')
    cy.contains('h1', 'ACME Project Tracker')
    cy.get('[role="alert"]').should('not.exist')
    signIn(USERS.viewer)
  })
})

describe('Urgency labels', () => {
  const PREFIX = `${RUN} Late`
  const DELIVERABLES = [
    { name: `${PREFIX} three`, due: -3, status: 'in_progress', label: '3 days overdue' },
    { name: `${PREFIX} one`, due: -1, status: 'not_started', label: '1 day overdue' },
    { name: `${PREFIX} soon`, due: 3, status: 'not_started', label: 'Due in 3 days' },
    { name: `${PREFIX} finished`, due: -3, status: 'completed', label: null }, // finished work is not urgent
  ]

  before(() => {
    createProject(`${PREFIX} Hydra`, { start: -30, end: 30 }).then((hydra) => {
      DELIVERABLES.forEach(({ name, due, status }) =>
        create('/deliverables', { project_id: hydra.id, name, status, due_date: dateOffset(due), is_key: false }),
      )
    })
  })

  it('shows "N days overdue" under the due date of an unfinished deliverable', () => {
    cy.visitAs('viewer', route('/deliverables', { search: PREFIX }))
    rows('Deliverables').should('have.length', DELIVERABLES.length)
    DELIVERABLES.forEach(({ name, due, label }) => {
      rowWith('Deliverables', name).within(() => {
        cy.contains(dateText(dateOffset(due)))
        if (label) cy.contains('span', new RegExp(`^${label}$`)).should('be.visible')
        else cy.root().should('not.contain', 'overdue').and('not.contain', 'Due in')
      })
    })
  })
})
