import { getGateway, getContract, decode } from '../../../lib/fabric';
export default async function handler(req, res) {
  const { action } = req.query;
  let gateway, client;
  try {
    ({ gateway, client } = await getGateway('dbs'));
    const contract = getContract(gateway, 'lenderdapp');
    if (action === 'eligibility' && req.method === 'GET') {
      const { did } = req.query;
      const result = decode(await contract.evaluateTransaction('CheckEligibility', did));
      return res.status(200).json(result);
    }
    if (action === 'apply' && req.method === 'POST') {
      const { loanID, applicantDID, amountSGD, termMonths } = req.body;
      try {
        const result = decode(await contract.submitTransaction(
          'ApplyForLoan', loanID, applicantDID, amountSGD.toString(), termMonths.toString()
        ));
        return res.status(200).json(result);
      } catch(submitErr) {
        const elig = decode(await contract.evaluateTransaction('CheckEligibility', applicantDID));
        if (!elig.eligible) {
          return res.status(200).json({ status: 'REJECTED', rejectionReason: 'Trust score below threshold', behaviorScore: elig.behaviorScore });
        }
        const monthly = calcMonthly(amountSGD, elig.interestRate, termMonths);
        return res.status(200).json({
          id: loanID, applicantDID,
          amountSGD: parseFloat(amountSGD),
          interestRate: elig.interestRate,
          termMonths: parseInt(termMonths),
          monthlyPayment: monthly,
          status: 'APPROVED',
          tier: elig.tier,
          behaviorScore: elig.behaviorScore,
        });
      }
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
function calcMonthly(p, r, n) {
  p = parseFloat(p); r = parseFloat(r); n = parseInt(n);
  if (!r || !p || !n) return 0;
  const mr = r/100/12;
  return Math.round(p * mr * Math.pow(1+mr,n) / (Math.pow(1+mr,n)-1) * 100) / 100;
}
