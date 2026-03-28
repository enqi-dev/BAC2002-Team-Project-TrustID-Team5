import { exec } from 'child_process';
import path from 'path';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { did } = req.body;
  if (!did) return res.status(400).json({ error: 'did required' });

  const oraclePath = path.join(process.cwd(), '..', 'oracle', 'oracle.js');
  exec(`node ${oraclePath} score ${did}`, { timeout: 30000 }, (err, stdout, stderr) => {
    if (err) return res.status(500).json({ error: err.message, stderr });
    res.status(200).json({ success: true, output: stdout });
  });
}
