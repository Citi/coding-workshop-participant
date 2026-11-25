// Critical path: role-based access - the UI hides what a role cannot do and the API enforces it.
import { dateOffset, RUN } from '../support/ui'

const PROJECT = `${RUN} Athena`

describe('Role-based access control', () => {
  before(() => {
    cy.api('POST', '/projects', { name: PROJECT, department: 'Finance', status: 'active', start_date: dateOffset(-5), end_date: dateOffset(40) })
  })

  after(() => cy.cleanup('projects', RUN))

  it('viewer is read-only', () => {
    cy.visitAs('viewer', '/projects')
    cy.contains(PROJECT)
    cy.contains('button', 'New project').should('not.exist')
    cy.get(`button[aria-label="Edit ${PROJECT}"]`).should('not.exist')
    cy.get(`button[aria-label="Delete ${PROJECT}"]`).should('not.exist')
    cy.get('nav[aria-label="Main navigation"]').should('not.contain', 'Users')
  })

  it('contributor can create and edit but not delete', () => {
    cy.visitAs('contributor', '/projects')
    cy.contains(PROJECT)
    cy.contains('button', 'New project').should('exist')
    cy.get(`button[aria-label="Edit ${PROJECT}"]`).should('exist')
    cy.get(`button[aria-label="Delete ${PROJECT}"]`).should('not.exist')
  })

  it('the API refuses what the UI hides', () => {
    cy.api('GET', `/projects?search=${encodeURIComponent(PROJECT)}`).then(({ body }) => {
      const id = body.items[0].id
      cy.api('DELETE', `/projects/${id}`, undefined, 'contributor').its('status').should('eq', 403)
      cy.api('POST', '/projects', { name: 'x', department: 'x', start_date: dateOffset(0), end_date: dateOffset(1) }, 'viewer')
        .its('status').should('eq', 403)
      cy.api('GET', '/users', undefined, 'manager').its('status').should('eq', 403)
    })
  })

  it('non-admins cannot open user management', () => {
    cy.visitAs('contributor', '/users')
    cy.contains('Access denied')
  })
})
