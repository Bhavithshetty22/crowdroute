# CrowdPilot AI Testing Protocol

This document outlines the testing strategy, encompassing unit-style programmatic checks and comprehensive manual Quality Assurance (QA) flows.

## Manual QA Checklist

### Cross-Device Responsiveness
- [ ] **Desktop:** Ensure 2-column or wide grid layouts visually maintain proportions (1024px+).
- [ ] **Tablet:** Check off-canvas drawer behavior and flexible map scaling (768px - 1024px).
- [ ] **Mobile:** Confirm bottom navigation bar isolates properly, buttons span full width, and `signin.html` vertically flexes correctly to allow comfortable scrolling of tall options list.

### System Flows
- [ ] **Navigation Testing:** Ensure all internal bottom navigation tabs reflect the currently selected link and route via `window.location`.
- [ ] **localStorage Testing:** 
  - Complete the onboarding path, force refresh the page, and verify `index.html` skips to `dashboard.html`.
  - Save options in the `profile.html` drawer, reload the application, and ensure dropdown choices are retained visually.
- [ ] **Accessibility Testing:** Verify W3C contrast ratio compliance within the dark theme, check for presence of structural ARIA labels, and ensure large touch targets for mobile usability.
- [ ] **JSON Fetch Testing:** Simulate network offline mode within DevTools and verify that fallback arrays natively inject data avoiding catastrophic promise rejections via `.catch()`.
- [ ] **Emergency Flow Testing:** Trigger the global medical/security state toggles and verify the interface aggressively highlights the takeover instructions in red.
- [ ] **Assistant Testing:** Input arbitrary queries in `assistant.html`. Validate keyword recognition (e.g. food, parking) parses dynamic template returns successfully.
- [ ] **Queue and Route Testing:** Force horizontal progress bar fills in the UI using CSS percentage injection to guarantee components react realistically to timing estimates.
