// test-debug.js - Simple test version of HydraCheck
import 'dotenv/config';

console.log('🧪 DOOMZY HYDRACHECK - QUICK VALIDATION');
console.log('=====================================\n');

// Check environment variables
const required = [
  'DISCORD_BOT_TOKEN',
  'CLIENT_ID',
  'DISCORD_GUILD_ID',
  'DISCORD_REQUIRED_ROLE_ID',
  'DISCORD_SIGNUP_CHANNEL_ID',
  'APPROVED_USER_ID'
];

let allGood = true;

required.forEach(env => {
  const value = process.env[env];
  if (value) {
    console.log(`✅ ${env}: ${env.includes('TOKEN') || env.includes('SECRET') ? '[SET]' : value}`);
  } else {
    console.log(`❌ ${env}: Missing`);
    allGood = false;
  }
});

console.log(`\n${allGood ? '✅' : '❌'} Environment validation: ${allGood ? 'PASSED' : 'FAILED'}`);

if (!allGood) {
  console.log('\n💡 Run this after setting up Railway variables:');
  console.log('1. Copy .env.example to .env');
  console.log('2. Fill in all the required values');
  console.log('3. Run: npm run debug');
}

console.log('\n🚀 Ready to deploy! Run: npm start');
