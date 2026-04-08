const { getDb } = require('./schema');
const { seedDemoData } = require('./demoData');

const db = getDb();
seedDemoData(db, { includeUsers: true });
console.log('✅  Database seeded successfully');
console.log('\nDemo accounts (password: demo1234)');
console.log('  treasury@banca-demo.ro');
console.log('  collateral@banca-demo.ro');
console.log('  operations@banca-demo.ro');
console.log('  risk@banca-demo.ro');
