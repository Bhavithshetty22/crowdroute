describe('Landing Page Smoke Test', () => {
  it('loads the homepage layout correctly', () => {
    // Visit /
    cy.visit('/');
    
    // Verify page title or hero text exists
    cy.title().should('not.be.empty');
    cy.get('body').should('contain.text', 'CrowdPilot');
    
    // Verify navbar exists
    cy.get('nav').should('exist').should('be.visible');
    
    // Verify CTA button exists
    cy.get('a, button').contains(/(Get Started|Sign In|Start)/i).should('exist');
  });
});
