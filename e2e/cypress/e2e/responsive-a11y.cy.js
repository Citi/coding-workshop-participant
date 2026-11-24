// Responsive layout on common screen sizes + automated accessibility checks (axe-core, WCAG 2.1 AA).
const PAGES = [
  { path: '/', heading: 'Dashboard' },
  { path: '/projects', heading: 'Projects' },
  { path: '/deliverables', heading: 'Deliverables' },
  { path: '/resources', heading: 'Resources' },
  { path: '/budget', heading: 'Budget' },
  { path: '/users', heading: 'Users' },
]

const SIZES = [
  { name: 'phone', width: 375, height: 812, mobile: true },
  { name: 'tablet', width: 768, height: 1024, mobile: true },
  { name: 'desktop', width: 1366, height: 900, mobile: false },
]

const noHorizontalScroll = () =>
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth, 'page width').to.be.at.most(doc.documentElement.clientWidth + 1)
  })

describe('Responsive layout', () => {
  SIZES.forEach((size) => {
    describe(`${size.name} (${size.width}px)`, () => {
      beforeEach(() => cy.viewport(size.width, size.height))

      PAGES.forEach((page) => {
        it(`${page.heading} fits the screen`, () => {
          cy.visitAs('admin', page.path)
          cy.contains('h1', page.heading)
          noHorizontalScroll()
          if (size.mobile) {
            // menu collapses into a drawer and lists become cards
            cy.get('button[aria-label="Open navigation menu"]').should('be.visible')
            cy.get('table').should('not.exist')
          } else {
            cy.get('nav[aria-label="Main navigation"]').should('be.visible')
          }
        })
      })

      if (size.mobile) {
        it('navigation drawer opens and navigates', () => {
          cy.visitAs('admin', '/')
          cy.get('button[aria-label="Open navigation menu"]').click()
          cy.get('nav[aria-label="Main navigation"]').contains('Projects').click()
          cy.contains('h1', 'Projects')
        })
      }
    })
  })
})

describe('Accessibility (axe-core, WCAG 2.1 AA)', () => {
  it('login page', () => {
    cy.visit('/#/login')
    cy.contains('h1', 'ACME Project Tracker')
    cy.checkA11y()
  })

  PAGES.forEach((page) => {
    it(`${page.heading} page`, () => {
      cy.visitAs('admin', page.path)
      cy.contains('h1', page.heading)
      cy.get('[role="status"]').should('not.exist') // wait for data to load
      cy.checkA11y()
    })
  })
})
