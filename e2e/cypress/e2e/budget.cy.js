// Critical path: budget tracking - expenses consume the planned budget, over-budget is flagged.
import { choose, dateOffset, fill, RUN, save } from '../support/ui'

const PROJECT = `${RUN} Juno`

describe('Budget tracking', () => {
  let projectId

  before(() => {
    cy.api('POST', '/projects', { name: PROJECT, department: 'Finance', status: 'active', start_date: dateOffset(-15), end_date: dateOffset(45), budget: 1000 })
      .then(({ body }) => (projectId = body.id))
  })

  after(() => cy.cleanup('projects', RUN))

  it('records an expense from the project page and shows the project over budget', () => {
    cy.api('GET', `/expenses?project_id=${projectId}`).then(({ body }) => {
      body.items.forEach((item) => cy.api('DELETE', `/expenses/${item.id}`)) // retry-safe
    })

    cy.visitAs('manager', `/projects/${projectId}`)
    cy.contains('[role="tab"]', 'Budget').click()
    cy.contains('button', 'New expense').click()

    // validation: amount must be positive
    choose('Category', 'Software')
    fill('description', 'Licences')
    fill('amount', 0)
    fill('expense_date', dateOffset(-1))
    save()
    cy.get('[role="dialog"]').find('.Mui-error').should('exist')

    fill('amount', 1200)
    save()
    cy.contains('Expense created')

    // API agrees: 120% used, over budget
    cy.api('GET', `/projects/${projectId}`).its('body').should((project) => {
      expect(project.budget_spent).to.eq(1200)
      expect(project.over_budget).to.eq(true)
      expect(project.budget_used_percent).to.eq(120)
    })

    // Budget page: planned vs consumed
    cy.visitAs('manager', '/budget')
    cy.contains('Planned vs consumed by project')
    cy.contains('tr', PROJECT).within(() => cy.contains('Over budget'))
  })
})
