import { getGateway, getContract, decode } from '../../../lib/fabric';

export default async function handler(req, res) {
  const { did } = req.query;
  if (req.method !== 'GET') return res.status(405).end();
  let gateway, client;
  try {
    ({ gateway, client } = await getGateway());
    const contract = getContract(gateway, 'identityregistry');
    const result   = decode(await contract.evaluateTransaction('GetDID', did));
    res.status(200).json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    gateway?.close(); client?.close();
  }
}
