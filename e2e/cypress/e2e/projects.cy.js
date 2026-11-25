// Critical path: project CRUD from the UI through the API to the database, with validation.
import { choose, chooseView, dateOffset, expectUrlParams, fill, RUN, save } from '../support/ui'

const NAME = `${RUN} Apollo`

describe('Projects', () => {
  beforeEach(() => cy.cleanup('projects', NAME)) // retry-safe
  after(() => cy.cleanup('projects', RUN))

  it('creates, finds, opens, edits and deletes a project', () => {
    cy.visitAs('manager', '/projects')
    cy.contains('h1', 'Projects')

    // Create - client-side validation first
    cy.contains('button', 'New project').click()
    fill('name', NAME)
    fill('department', 'Engineering')
    choose('Status', 'Active')
    fill('start_date', dateOffset(-10))
    fill('end_date', dateOffset(-20))
    save()
    cy.contains('Must be on or after the start date')

    fill('end_date', dateOffset(90))
    fill('budget', '120000')
    save()
    cy.contains('Project created')

    // Persisted: visible through the API too
    cy.api('GET', `/projects?search=${encodeURIComponent(NAME)}`).its('body.total').should('eq', 1)

    // Search - the list narrows to the match, and the search is kept in the URL (reload, Back and links keep it)
    cy.get('input[placeholder]').first().clear().type(NAME)
    expectUrlParams({ search: NAME })
    cy.get('table[aria-label="Projects"] tbody tr').should('have.length', 1).and('contain', NAME)

    // The same filtered projects on the timeline; back on the list the search is still applied
    chooseView('Timeline')
    expectUrlParams({ search: NAME, view: 'timeline' })
    cy.get('[aria-label="Project timeline"] > li').should('have.length', 1).find(`a[aria-label^="${NAME}: "]`).should('be.visible')
    chooseView('List')
    expectUrlParams({ search: NAME, view: null })

    // Detail page with tabs
    cy.contains('td, [role="listitem"]', NAME).click()
    cy.location('hash').should('match', /#\/projects\/\d+$/)
    cy.contains('h1', NAME)
    cy.get('[role="tablist"]').within(() => {
      cy.contains('[role="tab"]', 'Deliverables')
      cy.contains('[role="tab"]', 'Team')
      cy.contains('[role="tab"]', 'Budget')
    })

    // Edit (header actions on the detail page)
    cy.get('main').contains('button', /^Edit$/).click()
    fill('department', 'Platform Engineering')
    save()
    cy.contains('Project updated')
    cy.contains('Platform Engineering')

    // Delete (with confirmation explaining the cascade)
    cy.get('main').contains('button', /^Delete$/).click()
    cy.get('[role="dialog"]').should('contain', 'permanently deleted')
    cy.get('[role="dialog"]').contains('button', 'Delete project').click()
    cy.contains('Project deleted')
    cy.api('GET', `/projects?search=${encodeURIComponent(NAME)}`).its('body.total').should('eq', 0)
  })

  it('shows the API duplicate-name error next to the field', () => {
    cy.api('POST', '/projects', { name: `${NAME} Dup`, department: 'IT', start_date: dateOffset(0), end_date: dateOffset(30) })
    cy.visitAs('manager', '/projects')
    cy.contains('button', 'New project').click()
    fill('name', `${NAME} Dup`)
    fill('department', 'IT')
    fill('start_date', dateOffset(0))
    fill('end_date', dateOffset(30))
    save()
    cy.get('[role="dialog"]').find('[role="alert"]').should('be.visible')
    cy.get('#field-name').parents('.MuiFormControl-root').find('.Mui-error').should('exist')
  })
})
