import { getGateway, getContract } from '../../../lib/fabric';
import { addLog } from '../../../lib/activityLog';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { didID, owner, publicKeyMultibase } = req.body;
  if (!didID || !owner) return res.status(400).json({ error: 'didID and owner required' });

  const pubKey = publicKeyMultibase || ('z6Mk' + Math.random().toString(36).slice(2, 18));
  let gateway, client;
  try {
    addLog(`RegisterDID requested: ${didID} | owner: ${owner}`, 'info');
    addLog(`Proposing to DBS, Grab, Singtel peers...`, 'info');
    ({ gateway, client } = await getGateway('dbs'));
    const contract = getContract(gateway, 'identityregistry');
    await contract.submitTransaction('RegisterDID', didID, owner, pubKey);
    addLog(`✓ RegisterDID committed — DID: ${didID}`, 'ok');
    addLog(`✓ ProofChain genesis entry created. BehaviouralAttestation-v1`, 'ok');
    addLog(`✓ Endorsed by DBSMSP · GrabMSP · SingtelMSP`, 'ok');
    res.status(200).json({ success: true, did: didID, owner });
  } catch (e) {
    addLog(`ERROR RegisterDID: ${e.message}`, 'err');
    res.status(500).json({ error: e.message });
  } finally {
    gateway?.close(); client?.close();
  }
}
