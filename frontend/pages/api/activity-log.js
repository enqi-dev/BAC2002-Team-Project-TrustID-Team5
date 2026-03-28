import { getLogs, clearLogs } from '../../lib/activityLog';

export default function handler(req, res) {
  if (req.method === 'DELETE') {
    clearLogs();
    return res.status(200).json({ success: true });
  }
  const since = parseInt(req.query.since || '0');
  res.status(200).json(getLogs(since));
}
