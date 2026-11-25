// Critical path: resource allocation across projects and over-allocation detection.
import { choose, dateOffset, fill, RUN, save } from '../support/ui'

const PERSON = `${RUN} Riley`

describe('Resource allocation and over-allocation', () => {
  let projectA
  let projectB
  let resourceId

  before(() => {
    const project = (name) => ({ name, department: 'Delivery', status: 'active', start_date: dateOffset(-10), end_date: dateOffset(80) })
    cy.api('POST', '/projects', project(`${RUN} Orion`)).then(({ body }) => (projectA = body.id))
    cy.api('POST', '/projects', project(`${RUN} Vega`)).then(({ body }) => (projectB = body.id))
    cy.api('POST', '/resources', { full_name: PERSON, email: `riley.${Date.now()}@e2e.acme.com`, job_title: 'Developer', department: 'Delivery' })
      .then(({ body }) => {
        resourceId = body.id
        cy.api('POST', '/allocations', { resource_id: resourceId, project_id: projectB, allocation_percent: 60 })
      })
  })

  after(() => {
    cy.cleanup('resources', RUN)
    cy.cleanup('projects', RUN)
  })

  it('warns when an allocation over-allocates someone and lists them as over-allocated', () => {
    // retry-safe: remove a previous attempt's allocation to project A
    cy.api('GET', `/allocations?project_id=${projectA}`).then(({ body }) => {
      body.items.forEach((item) => cy.api('DELETE', `/allocations/${item.id}`))
    })

    cy.visitAs('manager', `/projects/${projectA}`)
    cy.contains('[role="tab"]', 'Team').click()
    cy.contains('button', 'New allocation').click()
    choose('Team member', PERSON)

    // Live what-if before saving: the person's total now (60% on Vega) and after this change
    const whatIf = () => cy.get('[role="dialog"] [data-testid="allocation-what-if"]')
    fill('allocation_percent', 30)
    whatIf().should('contain', `${PERSON}: 60% now → 90% after this change`).and('contain', 'Within capacity')
    fill('allocation_percent', 70)
    whatIf()
      .should('contain', `${PERSON}: 60% now → 130% after this change`)
      .and('contain', 'Will be over-allocated')
      .and('not.contain', 'Within capacity')
    // Screen readers get the same facts in words, once typing pauses
    cy.get('[role="dialog"]').contains('[role="status"]', `${PERSON}: 60% now, 130% after this change. Will be over-allocated`)

    // Saving is not blocked (the API allows over-allocation); the warning comes back once saved
    save()
    cy.contains(`${PERSON} is now over-allocated (130%)`)

    // Resources page, "Over-allocated only"
    cy.visitAs('manager', '/resources?over_allocated=true')
    cy.contains(PERSON).parents('tr').within(() => cy.contains('Over-allocated'))

    // Person's page: total and both projects
    cy.visitAs('manager', `/resources/${resourceId}`)
    cy.contains('130%')
    cy.contains(`${RUN} Orion`)
    cy.contains(`${RUN} Vega`)
  })

  it('rejects a second allocation of the same person to the same project', () => {
    cy.api('POST', '/allocations', { resource_id: resourceId, project_id: projectB, allocation_percent: 10 }).then((response) => {
      expect(response.status).to.eq(409)
      expect(response.body.error.details).to.have.property('resource_id')
    })
  })
})
