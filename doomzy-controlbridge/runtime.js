import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const registryFile = path.join(__dirname, 'registry.json');

// Persistent runtime registry
let registry = {};
try {
  if (fs.existsSync(registryFile))
    registry = JSON.parse(fs.readFileSync(registryFile, 'utf8'));
} catch { registry = {}; }

function saveRegistry() {
  fs.writeFileSync(registryFile, JSON.stringify(registry, null, 2));
}

export function listRuntimes() {
  return Object.entries(registry).map(([name, data]) => ({
    name, pid: data.pid, port: data.port, alive: !!data.pid
  }));
}

export async function launchRuntime(name, dir) {
  const port = 9000 + Math.floor(Math.random() * 900);
  const env = { ...process.env, PORT: port };

  console.log(`🚀 Launching ${name} on port ${port}`);
  const child = spawn('node', ['index.js'], {
    cwd: dir,
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  registry[name] = { pid: child.pid, port, started: Date.now() };
  saveRegistry();

  child.stdout.on('data', d => log(name, d.toString()));
  child.stderr.on('data', d => log(name, d.toString(), true));
  child.on('exit', code => {
    log(name, `Process exited with code ${code}`);
    delete registry[name];
    saveRegistry();
  });
}

export function stopRuntime(name) {
  const r = registry[name];
  if (!r) return false;
  try { process.kill(r.pid); } catch {}
  delete registry[name];
  saveRegistry();
  return true;
}

function log(name, msg, isErr = false) {
  const file = path.join(__dirname, 'logs.txt');
  const line = `[${new Date().toISOString()}][${name}] ${msg}`;
  fs.appendFileSync(file, line + '\n');
  console[isErr ? 'error' : 'log'](line);
}

export function getRegistry() { return registry; }
