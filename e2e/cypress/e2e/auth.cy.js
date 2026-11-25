// Critical path: authentication, session handling and role-based navigation.
import { USERS } from '../support/commands'

describe('Authentication', () => {
  it('redirects anonymous visitors to the login page', () => {
    cy.visit('/#/projects')
    cy.location('hash').should('eq', '#/login')
    cy.contains('h1', 'ACME Project Tracker')
  })

  it('validates the login form before calling the API', () => {
    cy.visit('/#/login')
    cy.contains('button', 'Sign in').click()
    cy.contains('Email is required')
    cy.contains('Password is required')
  })

  it('rejects a wrong password with a clear message', () => {
    cy.visit('/#/login')
    cy.get('#login-email').type(USERS.admin.email)
    cy.get('#login-password').type('wrong-password')
    cy.contains('button', 'Sign in').click()
    cy.get('[role="alert"]').should('contain', 'Invalid email or password')
  })

  it('logs in, keeps the session on reload and logs out', () => {
    cy.visit('/#/login')
    cy.get('#login-email').type(USERS.manager.email)
    cy.get('#login-password').type(USERS.manager.password)
    cy.contains('button', 'Sign in').click()
    cy.location('hash').should('eq', '#/')
    cy.contains('Project Manager')
    cy.reload()
    cy.contains('Project Manager')
    cy.get('button[aria-label="Log out"]').click()
    cy.location('hash').should('eq', '#/login')
    cy.visit('/#/projects')
    cy.location('hash').should('eq', '#/login')
  })

  it('shows user management only to admins', () => {
    cy.visitAs('admin', '/')
    cy.get('nav[aria-label="Main navigation"]').should('contain', 'Users')
    cy.visitAs('manager', '/')
    cy.get('nav[aria-label="Main navigation"]').should('not.contain', 'Users')
    cy.visitAs('manager', '/users')
    cy.contains('Access denied')
  })

  it('logs out a user whose token is no longer valid', () => {
    cy.visit('/#/', {
      onBeforeLoad(win) {
        win.localStorage.setItem('acme-pm-session', JSON.stringify({ accessToken: 'not-a-real-token', refreshToken: 'nope', user: { id: 1, role: 'admin', full_name: 'X', permissions: ['dashboard:read'] } }))
      },
    })
    cy.location('hash').should('eq', '#/login')
  })
})
