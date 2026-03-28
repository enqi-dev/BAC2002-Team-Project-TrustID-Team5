import { exec } from 'child_process';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { roundID } = req.body;
  const round = roundID || `round-${Date.now()}`;
  const cmd = `cd /home/enqi3/trustid-v2/oracle && node oracle.js train "${round}" 2>&1`;
  exec(cmd, { timeout: 120000 }, (err, stdout, stderr) => {
    if (err && !stdout.includes('Training Round Complete')) {
      return res.status(500).json({ error: err.message, output: stdout });
    }
    res.status(200).json({ success: true, roundID: round, output: stdout });
  });
}
