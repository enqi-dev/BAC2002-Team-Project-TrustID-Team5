import fs from 'fs';
import path from 'path';

const LOG_FILE = path.join(process.cwd(), 'logs', 'activity.log');

export function addLog(msg, type = 'info') {
  const ts = new Date().toLocaleTimeString('en-SG', { hour12: false });
  const line = JSON.stringify({ ts, msg, type }) + '\n';
  try { 
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line); 
  } catch(e) {}
}

export function getLogs(since = 0) {
  try {
    const content = fs.readFileSync(LOG_FILE, 'utf8');
    const lines = content.trim().split('\n').filter(Boolean);
    const parsed = lines.map(l => {
      try { 
        const p = JSON.parse(l); 
        return '[' + p.ts + '] ' + p.msg; 
      } catch { return l; }
    });
    return { logs: parsed.slice(since), total: parsed.length };
  } catch(e) {
    return { logs: [], total: 0 };
  }
}

export function clearLogs() {
  try { fs.writeFileSync(LOG_FILE, ''); } catch(e) {}
}
