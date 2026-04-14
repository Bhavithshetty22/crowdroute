// shared.test.js
// Verifies localStorage and utility functions from shared.js

console.log("Running shared.test.js...");

function testRandomInt() {
    // Ensure the function outputs values within the specified constraint bounds safely.
    if (typeof randomInt === 'function') {
        const val = randomInt(5, 10);
        console.assert(val >= 5 && val <= 10, "randomInt() should stay within bounds");
        
        // Edge cases
        const equalBounds = randomInt(5, 5);
        console.assert(equalBounds === 5, "randomInt should handle equal min/max inputs without NaN");
        
        const negativeBounds = randomInt(-10, -5);
        console.assert(negativeBounds >= -10 && negativeBounds <= -5, "randomInt should support negative domain");
    } else {
        console.warn("Skipping randomInt test (function not found in test context)");
    }
}

function testLocalStorage() {
    // Define dummy test payloads
    const testKey = 'crowdpilot_test_persistence';
    const testData = { verified: true, ts: Date.now() };
    
    // Test write and retrieve operations
    localStorage.setItem(testKey, JSON.stringify(testData));
    let retrieved = null;
    try {
        retrieved = JSON.parse(localStorage.getItem(testKey));
    } catch(e) { /* ignore parse error */ }
    
    // Assert integrity
    console.assert(retrieved !== null, "localStorage should retrieve the item");
    console.assert(retrieved.verified === true, "localStorage payload should match original data");
    
    // Test Edge Case: Null object deserialization
    localStorage.setItem(testKey, "null");
    let nullRetrieved = JSON.parse(localStorage.getItem(testKey));
    console.assert(nullRetrieved === null, "Null parse should remain null");
    
    // Test Edge Case: Missing key
    let missingRetrieved = localStorage.getItem("non_existent_key_123");
    console.assert(missingRetrieved === null, "Integration flow: missing keys must yield explicit null, not undefined or exception");
    
    // Cleanup
    localStorage.removeItem(testKey);
}

testRandomInt();
testLocalStorage();
console.log("shared.test.js complete.");
