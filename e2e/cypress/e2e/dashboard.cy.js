// Critical path: the dashboard answers the business questions from live data.
import { dateOffset, kpiCard, RUN } from '../support/ui'

const AT_RISK = `${RUN} Atlas`
const PERSON = `${RUN} Dana`

describe('Dashboard', () => {
  before(() => {
    const project = (name) => ({ name, department: 'Ops', status: 'active', start_date: dateOffset(-30), end_date: dateOffset(30), budget: 500 })
    cy.api('POST', '/projects', project(AT_RISK)).then(({ body: atRisk }) => {
      // a blocked key deliverable puts the project at risk
      cy.api('POST', '/deliverables', { project_id: atRisk.id, name: `${RUN} Blocked step`, status: 'blocked', due_date: dateOffset(10), is_key: true })
      cy.api('POST', '/expenses', { project_id: atRisk.id, category: 'other', description: 'Overspend', amount: 900, expense_date: dateOffset(-1) })
      cy.api('POST', '/projects', project(`${RUN} Boreas`)).then(({ body: other }) => {
        cy.api('POST', '/resources', { full_name: PERSON, email: `dana.${Date.now()}@e2e.acme.com`, job_title: 'Analyst', department: 'Ops' })
          .then(({ body: person }) => {
            cy.api('POST', '/allocations', { resource_id: person.id, project_id: atRisk.id, allocation_percent: 80 })
            cy.api('POST', '/allocations', { resource_id: person.id, project_id: other.id, allocation_percent: 40 })
          })
      })
    })
  })

  after(() => {
    cy.cleanup('resources', RUN)
    cy.cleanup('projects', RUN)
  })

  it('shows at-risk projects, over-allocated people, key deliverables and budget for every role', () => {
    cy.visitAs('viewer', '/')
    cy.contains('h1', 'Dashboard')
    // section headings are h2 (KPI cards above use the same words as labels)
    const section = (title) => cy.contains('h2', title).parents('.MuiPaper-root').first()
    section('Projects at risk').within(() => cy.contains(AT_RISK))
    section('Over-allocated team members').within(() => cy.contains(PERSON))
    section('Key deliverables').within(() => cy.contains(`${RUN} Blocked step`))
    section('Budget: planned vs consumed').within(() => cy.contains(AT_RISK))

    // drill down from the dashboard to the project
    cy.contains('a', AT_RISK).first().click()
    cy.contains('h1', AT_RISK)
  })

  it('opens the over-allocated team members from their KPI card', () => {
    cy.visitAs('viewer', '/')
    kpiCard('Over-allocated').click()
    cy.location('hash').should('eq', '#/resources?over_allocated=true')
    cy.contains('h1', 'Resources')
    // the filter from the link is on, and only over-allocated people are listed
    cy.contains('label', 'Over-allocated only').find('input[type="checkbox"]').should('be.checked')
    cy.contains('tr', PERSON).should('contain', 'Over-allocated')
    cy.get('table[aria-label="Resources"] tbody tr').should((rows) => {
      expect(rows.length, 'people listed').to.be.greaterThan(0)
      rows.each((index, row) => expect(row.innerText, `row ${index + 1}`).to.include('Over-allocated'))
    })
  })

  it('matches the API numbers', () => {
    cy.api('GET', '/dashboard').its('body').should((dashboard) => {
      expect(dashboard.at_risk_projects.map((p) => p.name)).to.include(AT_RISK)
      expect(dashboard.over_allocated_resources.map((r) => r.full_name)).to.include(PERSON)
      expect(dashboard.key_deliverables.map((d) => d.name)).to.include(`${RUN} Blocked step`)
    })
  })
})
