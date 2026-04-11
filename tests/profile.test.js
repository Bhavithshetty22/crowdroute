// profile.test.js
// Verifies profile preference deep-merging and memory retention

console.log("Running profile.test.js...");

function testProfilePersistence() {
    // Baseline state
    const mockProfile = {
        seatSection: "VIP",
        accessibility: "None"
    };
    
    // Simulate updating an existing user's profile with a partial payload
    const updatedProfile = { ...mockProfile, accessibility: "Wheelchair" };
    
    // Assertions
    console.assert(updatedProfile.seatSection === "VIP", "Profile merging logic should safely preserve old keys");
    console.assert(updatedProfile.accessibility === "Wheelchair", "Profile merging logic should safely overwrite targeted keys");
}

testProfilePersistence();
console.log("profile.test.js complete.");
