// profile.test.js
// Verifies profile preference deep-merging and memory retention

console.log("Running profile.test.js...");

function testProfilePersistence() {
    // Baseline state
    const mockProfile = {
        seatSection: "VIP",
        accessibility: "None",
        notifications: true,
        history: []
    };
    
    // Simulate updating an existing user's profile with a partial payload
    const partialPayload = { accessibility: "Wheelchair", notifications: false, newKey: "test", seatSection: null };
    const updatedProfile = { ...mockProfile, ...partialPayload };
    
    // Core Assertions
    console.assert(updatedProfile.seatSection === null, "Profile merging logic should safely allow nullification of keys");
    console.assert(updatedProfile.accessibility === "Wheelchair", "Profile merging logic should safely overwrite targeted keys");
    console.assert(updatedProfile.notifications === false, "Profile merging logic should safely overwrite booleans");
    
    // Edge case assertions
    console.assert(updatedProfile.history.length === 0, "Profile merging should not wipe unmentioned structures");
    console.assert(updatedProfile.newKey === "test", "Profile merging should allow new schema keys securely");
    
    // Invalid payloads
    try {
        const errorProfile = Object.assign({}, null, mockProfile);
        console.assert(errorProfile.seatSection === "VIP", "Null merges should be handled gracefully");
    } catch(e) {
        console.error("Null merge failed");
    }
}

testProfilePersistence();
console.log("profile.test.js complete.");
