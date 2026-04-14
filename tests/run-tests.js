const fs = require('fs');
const path = require('path');
const store = {};
global.localStorage = { getItem: (k) => store[k] === undefined ? null : store[k], setItem: (k,v) => store[k] = v, removeItem: (k) => delete store[k] };

console.log('--- CrowdPilot AI Test Runner ---');
const files = fs.readdirSync(__dirname).filter(f => f.endsWith('.test.js'));
let passed = 0;
for(let f of files) {
   console.log('Running:', f);
   try {
       require('./'+f);
       passed++;
   } catch(e) {
       console.error('Failed:', f, e);
   }
}
console.log('Passed ' + passed + '/' + files.length + ' Test Suites');
if(passed < files.length) process.exit(1);
