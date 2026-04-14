const { defineConfig } = require('cypress')

module.exports = defineConfig({
  e2e: {
    baseUrl: 'http://localhost:5500',
    specPattern: 'tests/e2e/**/*.cy.js',
    supportFile: false,
    viewportWidth: 1280,
    viewportHeight: 720,
    // Note: Run these smoke tests via 'npm run cy:open' (interactive) or 'npm run cy:run' (headless).
  }
})
