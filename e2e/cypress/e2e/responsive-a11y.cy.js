// Responsive layout on common screen sizes + automated accessibility checks (axe-core, WCAG 2.1 AA).
// `view`: a page's alternative view (e.g. ?view=timeline) and the element it renders once loaded.
// `scrollsInside`: the view stays a table on small screens, scrolling sideways inside its own region.
const PAGES = [
  { path: '/', heading: 'Dashboard' },
  { path: '/projects', heading: 'Projects' },
  { path: '/projects?view=timeline', heading: 'Projects', title: 'Projects timeline', view: 'ul[aria-label="Project timeline"]' },
  { path: '/deliverables', heading: 'Deliverables' },
  { path: '/resources', heading: 'Resources' },
  {
    path: '/resources?view=heatmap',
    heading: 'Resources',
    title: 'Resources heat map',
    view: '[role="region"][aria-label="Allocation heat map"]',
    scrollsInside: true,
  },
  { path: '/budget', heading: 'Budget' },
  { path: '/users', heading: 'Users' },
]

const SIZES = [
  { name: 'phone', width: 375, height: 812, mobile: true },
  { name: 'tablet', width: 768, height: 1024, mobile: true },
  { name: 'desktop', width: 1366, height: 900, mobile: false },
]

const titleOf = (page) => page.title || page.heading

const noHorizontalScroll = () =>
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth, 'page width').to.be.at.most(doc.documentElement.clientWidth + 1)
  })

/** The page with its data loaded (no loading spinner left) and, for a view, the view itself shown. */
function openLoaded(page) {
  cy.visitAs('admin', page.path)
  cy.contains('h1', page.heading)
  cy.get('[role="status"]:not(.MuiAlert-root)').should('not.exist') // wait for data to load
  if (page.view) cy.get(page.view).should('be.visible')
}

describe('Responsive layout', () => {
  SIZES.forEach((size) => {
    describe(`${size.name} (${size.width}px)`, () => {
      beforeEach(() => cy.viewport(size.width, size.height))

      PAGES.forEach((page) => {
        it(`${titleOf(page)} fits the screen`, () => {
          openLoaded(page)
          noHorizontalScroll()
          if (size.mobile) {
            // menu collapses into a drawer and lists become cards
            cy.get('button[aria-label="Open navigation menu"]').should('be.visible')
            if (page.scrollsInside) {
              // the heat map stays a table: it scrolls sideways inside its region, which fits the screen
              cy.get(page.view).find('table').should('exist')
              cy.get(page.view).should(($region) => {
                expect($region[0].getBoundingClientRect().right, 'right edge of the scroll region').to.be.at.most(size.width)
              })
            } else {
              cy.get('table').should('not.exist')
            }
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
    it(`${titleOf(page)} page`, () => {
      openLoaded(page)
      cy.checkA11y()
    })
  })
})
