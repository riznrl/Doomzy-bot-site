// generate-admin-token.js - Generate random admin token for ControlBridge
import crypto from 'crypto';

const token = crypto.randomBytes(32).toString('hex');
console.log('🔑 Generated ControlBridge Admin Token:');
console.log(token);
console.log('\n📝 Add this to your Railway environment variables:');
console.log(`CONTROLBRIDGE_ADMIN_TOKEN=${token}`);
