export default async function handler(req, res) {
  try {
    const r = await fetch('http://localhost:5001/metrics');
    const d = await r.json();
    res.status(200).json(d);
  } catch(e) {
    res.status(200).json({ model1: {}, model2: {} });
  }
}
