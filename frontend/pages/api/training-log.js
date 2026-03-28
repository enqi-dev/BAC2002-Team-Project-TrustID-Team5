export default async function handler(req, res) {
  const since = parseInt(req.query.since || '0');
  try {
    const r = await fetch(`http://localhost:5001/training-log?since=${since}`);
    const data = await r.json();
    res.status(200).json(data);
  } catch(e) {
    res.status(200).json({ logs: [], total: 0 });
  }
}
