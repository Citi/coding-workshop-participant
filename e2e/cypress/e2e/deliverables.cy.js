// Critical path: key deliverables and the dependency chain between deliverables.
import { choose, dateOffset, fill, pickMulti, RUN, save } from '../support/ui'

const PROJECT = `${RUN} Hermes`

describe('Deliverables and dependencies', () => {
  let projectId

  before(() => {
    cy.api('POST', '/projects', { name: PROJECT, department: 'Digital', status: 'active', start_date: dateOffset(-30), end_date: dateOffset(60), budget: 1000 })
      .then(({ body }) => {
        projectId = body.id
      })
  })

  after(() => cy.cleanup('projects', RUN))

  it('adds deliverables with a dependency and shows the chain', () => {
    // retry-safe: start from an empty project
    cy.api('GET', `/deliverables?project_id=${projectId}`).then(({ body }) => {
      body.items.forEach((item) => cy.api('DELETE', `/deliverables/${item.id}`))
    })
    cy.visitAs('manager', `/projects/${projectId}`)
    cy.contains('[role="tab"]', 'Deliverables').click()

    // First deliverable
    cy.contains('button', /New deliverable/i).click()
    fill('name', `${RUN} Design`)
    choose('Status', 'Completed')
    fill('due_date', dateOffset(-5))
    save()
    cy.contains(/Deliverable created/i)

    // Second deliverable depends on the first and is a key deliverable
    cy.contains('button', /New deliverable/i).click()
    fill('name', `${RUN} Build`)
    choose('Status', 'In progress')
    fill('due_date', dateOffset(20))
    cy.get('input[name="is_key"]').check()
    pickMulti('depends_on_ids', `${RUN} Design`)
    save()
    cy.contains(/Deliverable created/i)

    // Details: dependency chain
    cy.contains(`${RUN} Build`).click()
    cy.get('[role="dialog"]').within(() => {
      cy.contains(/Depends on \(1\)/)
      cy.contains(/Dependency chain \(1\)/)
      cy.contains(`${RUN} Design`)
      cy.contains('Key deliverable')
      // Urgency in words next to the due date; the completed dependency is past its date but not overdue
      cy.contains('Due in 2 weeks')
      cy.contains(/overdue/i).should('not.exist')
    })
    cy.get('button[aria-label="Close details"]').click()
  })

  it('filters key deliverables on the Deliverables page', () => {
    cy.visitAs('manager', '/deliverables?is_key=true')
    cy.contains('h1', 'Deliverables')
    cy.contains('label', 'Key deliverables only').find('input[type="checkbox"]').should('be.checked')
    cy.contains(`${RUN} Build`)
    cy.contains(`${RUN} Design`).should('not.exist')
  })

  it('rejects a circular dependency', () => {
    cy.api('GET', `/deliverables?project_id=${projectId}`).then(({ body }) => {
      const design = body.items.find((d) => d.name.endsWith('Design'))
      const build = body.items.find((d) => d.name.endsWith('Build'))
      cy.api('PUT', `/deliverables/${design.id}`, { ...design, depends_on_ids: [build.id] }).then((response) => {
        expect(response.status).to.eq(400)
        expect(response.body.error.details).to.have.property('depends_on_ids')
      })
    })
  })
})
