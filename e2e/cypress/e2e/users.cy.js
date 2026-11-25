// Critical path: an admin manages users and roles; the new user gets exactly their role's access.
import { choose, fill, RUN, save } from '../support/ui'

const NAME = `${RUN} Una`
const EMAIL = `una.${Date.now()}@e2e.acme.com`
const PASSWORD = 'Welcome2026'

describe('User management', () => {
  after(() => cy.cleanup('users', RUN))

  it('admin creates a viewer who can only read', () => {
    cy.cleanup('users', NAME) // retry-safe
    cy.visitAs('admin', '/users')
    cy.contains('h1', 'Users')
    cy.contains('button', 'New user').click()
    fill('full_name', NAME)
    fill('email', EMAIL)
    choose('Role', 'Viewer')
    fill('password', 'short')
    save()
    cy.contains('Must be at least 8 characters')
    fill('password', PASSWORD)
    save()
    cy.contains('User created')
    cy.contains('tr', NAME).within(() => cy.contains('Viewer'))

    // Log out and sign in as the new user
    cy.get('button[aria-label="Log out"]').click()
    cy.get('#login-email').type(EMAIL)
    cy.get('#login-password').type(PASSWORD)
    cy.contains('button', 'Sign in').click()
    cy.location('hash').should('eq', '#/')
    cy.get('nav[aria-label="Main navigation"]').should('not.contain', 'Users')
    cy.visit('/#/projects')
    cy.contains('h1', 'Projects')
    cy.contains('button', 'New project').should('not.exist')
  })

  it('an admin cannot delete their own account', () => {
    cy.visitAs('admin', '/users')
    cy.contains('tr', 'admin@acme.com').within(() => {
      cy.get('button[aria-label^="Delete"]').should('be.disabled')
    })
    cy.api('GET', '/users?search=admin@acme.com').then(({ body }) => {
      cy.api('DELETE', `/users/${body.items[0].id}`).its('status').should('eq', 400)
    })
  })
})
