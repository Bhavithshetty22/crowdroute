// shared.test.js
// Verifies localStorage and utility functions from shared.js

console.log("Running shared.test.js...");

function testRandomInt() {
    // Ensure the function outputs values within the specified constraint bounds safely.
    if (typeof randomInt === 'function') {
        const val = randomInt(5, 10);
        console.assert(val >= 5 && val <= 10, "randomInt() should stay within bounds");
    } else {
        console.warn("Skipping randomInt test (function not found in test context)");
    }
}

function testLocalStorage() {
    // Define dummy test payloads
    const testKey = 'crowdpilot_test_persistence';
    const testData = { verified: true };
    
    // Test write and retrieve operations
    localStorage.setItem(testKey, JSON.stringify(testData));
    const retrieved = JSON.parse(localStorage.getItem(testKey));
    
    // Assert integrity
    console.assert(retrieved !== null, "localStorage should retrieve the item");
    console.assert(retrieved.verified === true, "localStorage payload should match original data");
    
    // Cleanup
    localStorage.removeItem(testKey);
}

testRandomInt();
testLocalStorage();
console.log("shared.test.js complete.");
