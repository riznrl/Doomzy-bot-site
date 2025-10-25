
// doomzy-controlbridge/index.js

const express = require('express');
const fs = require('fs');
const bodyParser = require('body-parser');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3001;

app.use(bodyParser.json());

app.post('/log', (req, res) => {
    const log = req.body.log || 'No log content provided.';
    fs.appendFileSync('./doomzy-controlbridge/logs.txt', `[${new Date().toISOString()}] ${log}\n`);
    console.log('Log received:', log);
    res.status(200).send('Log received');
});

app.post('/windsurf-task', (req, res) => {
    const task = req.body.task || 'No task';
    fs.writeFileSync('./doomzy-controlbridge/windsurf-patch.md', task);
    console.log('Windsurf task written to patch.md');
    res.status(200).send('Task forwarded to Windsurf');
});

app.listen(PORT, () => {
    console.log(`ControlBridge listening on port ${PORT}`);
});
