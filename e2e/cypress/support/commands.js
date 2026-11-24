// Seeded accounts (see README / docs/API.md).
export const USERS = {
  admin: { email: 'admin@acme.com', password: 'Admin@123' },
  manager: { email: 'manager@acme.com', password: 'Manager@123' },
  contributor: { email: 'contributor@acme.com', password: 'Contributor@123' },
  viewer: { email: 'viewer@acme.com', password: 'Viewer@123' },
}

const SESSION_KEY = 'acme-pm-session'
const apiUrl = () => Cypress.expose('apiUrl')

// One login per role per spec file: logins are deliberately slow (bcrypt), tokens last 30 minutes.
const sessions = {}

/** Log in through the API (cached per role) and return the session object the web app stores. */
Cypress.Commands.add('loginByApi', (role = 'admin') => {
  if (sessions[role]) return cy.wrap(sessions[role], { log: false })
  return cy.request('POST', `${apiUrl()}/auth/login`, USERS[role]).then(({ body }) => {
    sessions[role] = { accessToken: body.access_token, refreshToken: body.refresh_token, user: body.user }
    return sessions[role]
  })
})

/** Open a page (hash route, e.g. '/projects') already logged in as `role`. */
Cypress.Commands.add('visitAs', (role, path = '/') =>
  cy.loginByApi(role).then((session) =>
    // The query string forces a full page load even when only the #route differs
    cy.visit(`/?as=${role}#${path}`, {
      onBeforeLoad(win) {
        win.localStorage.setItem(SESSION_KEY, JSON.stringify(session))
      },
    }),
  ),
)

/** Authenticated API call as admin (for arranging and cleaning up test data). */
Cypress.Commands.add('api', (method, path, body, role = 'admin') =>
  cy.loginByApi(role).then((session) =>
    cy.request({
      method,
      url: `${apiUrl()}${path}`,
      body,
      headers: { Authorization: `Bearer ${session.accessToken}` },
      failOnStatusCode: false,
    }),
  ),
)

/** Delete every record of a collection whose search matches `term` (cascades handle children). */
Cypress.Commands.add('cleanup', (collection, term) =>
  cy.api('GET', `/${collection}?search=${encodeURIComponent(term)}`).then(({ body }) => {
    ;(body?.items || []).forEach((item) => cy.api('DELETE', `/${collection}/${item.id}`))
  }),
)

/**
 * Accessibility scan with axe-core (WCAG 2.1 A/AA rules). Fails on "serious" and "critical"
 * violations and logs every violation to the Cypress command log.
 */
Cypress.Commands.add('checkA11y', (context = 'body') => {
  cy.readFile('node_modules/axe-core/axe.min.js', { log: false }).then((source) => {
    cy.window({ log: false }).then((win) => {
      if (!win.axe) win.eval(source)
      return win.axe.run(win.document.querySelector(context), {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
      })
    })
  }).then((results) => {
    results.violations.forEach((violation) => {
      Cypress.log({ name: 'a11y', message: `${violation.impact}: ${violation.id} (${violation.nodes.length}) - ${violation.help}` })
    })
    const blocking = results.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact))
    expect(blocking.map((v) => `${v.id}: ${v.help} -> ${v.nodes.map((n) => n.target.join(' ')).slice(0, 3).join(' | ')}`), 'serious/critical a11y violations').to.deep.equal([])
  })
})
