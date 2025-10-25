// test-controlbridge.js - Test ControlBridge API endpoints
import fetch from 'node-fetch';

const CONTROLBRIDGE_URL = 'http://localhost:3001';

async function testControlBridge() {
  console.log('🧪 Testing ControlBridge API...\n');

  try {
    // Test 1: Health check
    console.log('📊 1. Testing health endpoint...');
    const healthResponse = await fetch(`${CONTROLBRIDGE_URL}/status`);
    const healthData = await healthResponse.json();
    console.log('✅ Health check:', healthData);

    // Test 2: Send a log
    console.log('\n📝 2. Testing log endpoint...');
    const logResponse = await fetch(`${CONTROLBRIDGE_URL}/log`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        log: 'Test log message from API test'
      })
    });
    const logData = await logResponse.json();
    console.log('✅ Log response:', logData);

    // Test 3: Send a task
    console.log('\n📋 3. Testing Windsurf task endpoint...');
    const taskResponse = await fetch(`${CONTROLBRIDGE_URL}/windsurf-task`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        task: '# Test Task\n\nThis is a test task to verify the system works correctly.'
      })
    });
    const taskData = await taskResponse.json();
    console.log('✅ Task response:', taskData);

    // Test 4: Check logs
    console.log('\n📄 4. Testing logs view...');
    const logsResponse = await fetch(`${CONTROLBRIDGE_URL}/logs`);
    const logsData = await logsResponse.json();
    console.log('✅ Recent logs:', logsData.totalLines, 'lines');

    // Test 5: Check current task
    console.log('\n📄 5. Testing task view...');
    const taskViewResponse = await fetch(`${CONTROLBRIDGE_URL}/task`);
    const taskViewData = await taskViewResponse.json();
    console.log('✅ Current task exists:', taskViewData.exists);

    console.log('\n🎉 All tests completed successfully!');
    console.log('🌉 ControlBridge system is operational');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n💡 Make sure ControlBridge is running: npm run controlbridge');
  }
}

testControlBridge();
