import { getGateway, getContract, decode } from '../../../lib/fabric';

export default async function handler(req, res) {
  const { action } = req.query;
  let gateway, client;
  try {
    ({ gateway, client } = await getGateway());
    const contract = getContract(gateway, 'lenderdapp');

    if (action === 'eligibility' && req.method === 'GET') {
      const { did } = req.query;
      const result = decode(await contract.evaluateTransaction('CheckEligibility', did));
      return res.status(200).json(result);
    }

    if (action === 'apply' && req.method === 'POST') {
      const { loanID, applicantDID, amountSGD, termMonths } = req.body;
      const result = decode(await contract.submitTransaction(
        'ApplyForLoan', loanID, applicantDID, amountSGD.toString(), termMonths.toString()
      ));
      return res.status(200).json(result);
    }

    if (action === 'repay' && req.method === 'POST') {
      const { loanID } = req.body;
      await contract.submitTransaction('RepayLoan', loanID);
      return res.status(200).json({ success: true, loanID });
    }

    if (action === 'get' && req.method === 'GET') {
      const { loanID } = req.query;
      const result = decode(await contract.evaluateTransaction('GetLoan', loanID));
      return res.status(200).json(result);
    }

    res.status(400).json({ error: 'Unknown action' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    gateway?.close(); client?.close();
  }
}
