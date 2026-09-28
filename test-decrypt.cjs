const crypto = require('crypto');

const payload = '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';

const blob = Buffer.from(payload, 'base64');

console.log('\n=== PAYLOAD ANALYSIS ===');
console.log('Total bytes:', blob.length);
console.log('First 10 bytes (hex):', blob.slice(0, 10).toString('hex'));
console.log('\nFirst byte value:', blob[0]);
console.log('Expected version byte: 1');
console.log('Match:', blob[0] === 1 ? '✓ YES - Has version byte!' : '✗ NO - Missing version byte!');

console.log('\nFirst byte interpretation:');
console.log('  As decimal:', blob[0]);
console.log('  As hex:', blob[0].toString(16).padStart(2, '0'));

const potentialIV = blob.slice(0, 12);
console.log('\nFirst 12 bytes (potential IV if no version):');
console.log('  Hex:', potentialIV.toString('hex'));

