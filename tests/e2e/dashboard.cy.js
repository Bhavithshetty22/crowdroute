describe('Dashboard Smoke Test', () => {
  it('loads critical dashboard structures', () => {
    cy.visit('/dashboard.html');
    
    // Verify dashboard header exists
    cy.get('header, h1').should('exist');
    
    // Verify crowd cards, queue cards, recommendation section exist
    // Based on standard class names or generic HTML structures for the data visualization logic
    cy.get('.cp-card, .bg-surface-container').should('exist'); 
    cy.get('body').contains(/(Queue|Wait|Line|Congestion)/i).should('exist');
    cy.get('body').contains(/(Recommendation|Route|Suggest)/i).should('exist');
  });
});
