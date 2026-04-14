describe('Assistant Smoke Test', () => {
  it('loads chat interface and interactivity elements', () => {
    cy.visit('/assistant.html');
    
    // Verify assistant header exists
    cy.get('header, h1').contains(/(Assistant|Chat|Pilot)/i).should('exist');
    
    // Verify assistant chat input exists
    cy.get('input[type="text"], [contenteditable]').should('exist');
    
    // Verify send button exists
    cy.get('button').should('exist');
    
    // Verify suggestion chips exist
    cy.get('.chip, [data-intent], button.text-sm').should('exist');
  });
});
