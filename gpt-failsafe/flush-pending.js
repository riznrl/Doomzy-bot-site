const fs = require('fs')
const fetch = require('node-fetch')

const GPT_COMMAND_URL = 'http://localhost:3000/api/gptops/command'
const TASK_QUEUE = './gpt-failsafe/pending-tasks.json'

async function flushQueue() {
  if (!fs.existsSync(TASK_QUEUE)) return console.log('No pending tasks.')

  const queue = JSON.parse(fs.readFileSync(TASK_QUEUE))
  for (const task of queue) {
    try {
      const res = await fetch(GPT_COMMAND_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ input: task.input })
      })
      const data = await res.text()
      console.log('Task sent to GPT:', task.input)
    } catch (err) {
      console.error('Failed to send task:', err.message)
      return
    }
  }
  fs.unlinkSync(TASK_QUEUE)
  console.log('Queue flushed.')
}

flushQueue()
