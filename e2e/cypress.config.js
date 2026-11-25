// End-to-end tests run against the local stack started by ./bin/start-dev.sh
// (web app on :3000, API through the dev proxy on :3001). Override with E2E_BASE_URL / E2E_API_URL
// to run the same suite against the CloudFront deployment.
const { defineConfig } = require('cypress')

module.exports = defineConfig({
  e2e: {
    baseUrl: process.env.E2E_BASE_URL || 'http://localhost:3000',
    specPattern: 'cypress/e2e/**/*.cy.js',
    supportFile: 'cypress/support/e2e.js',
    video: false,
    screenshotOnRunFailure: true,
    viewportWidth: 1366,
    viewportHeight: 900,
    defaultCommandTimeout: 20000, // first Lambda call after a code change can take a few seconds
    requestTimeout: 30000,
    responseTimeout: 30000,
    retries: { runMode: 1, openMode: 0 },
    // Cypress 16: public (non-secret) values are read with Cypress.expose('apiUrl')
    expose: {
      apiUrl: process.env.E2E_API_URL || 'http://localhost:3001/api/pm-service',
    },
  },
})
