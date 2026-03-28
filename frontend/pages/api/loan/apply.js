import { exec } from 'child_process';
import { getGateway, getContract, decode } from '../../../lib/fabric';
import { addLog } from '../../../lib/activityLog';

function calcMonthly(p, r, n) {
  p = parseFloat(p); r = parseFloat(r); n = parseInt(n);
  if (!r || !p || !n) return 0;
  const mr = r/100/12;
  return Math.round(p * mr * Math.pow(1+mr,n) / (Math.pow(1+mr,n)-1) * 100) / 100;
}

function shellInvoke(loanID, applicantDID, amountSGD, termMonths) {
  return new Promise((resolve, reject) => {
    const script = `/home/enqi3/trustid-v2/scripts/invoke-loan.sh "${loanID}" "${applicantDID}" "${amountSGD}" "${termMonths}"`;
    exec(script, { timeout: 30000 }, (err, stdout, stderr) => {
      const out = stdout + stderr;
      if (out.includes('Chaincode invoke successful') || out.includes('status:200')) {
        resolve(true);
      } else {
        reject(new Error(out || err?.message));
      }
    });
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { loanID, applicantDID, amountSGD, termMonths } = req.body;
  let gateway, client;
  try {
    ({ gateway, client } = await getGateway('dbs'));
    const contract = getContract(gateway, 'lenderdapp');

    const elig = decode(await contract.evaluateTransaction('CheckEligibility', applicantDID));
    if (!elig.eligible) {
      return res.status(200).json({
        status: 'REJECTED',
        rejectionReason: 'Trust score below threshold',
        behaviorScore: elig.behaviorScore
      });
    }

    addLog('ApplyForLoan: ' + loanID + ' | DID: ' + applicantDID, 'info');
    addLog('Requesting endorsement from DBS · Grab · Singtel...', 'info');

    await shellInvoke(loanID, applicantDID, amountSGD, termMonths);

    addLog('✓ Loan ' + loanID + ' committed to Fabric ledger', 'ok');
    addLog('✓ Endorsed by DBSMSP · GrabMSP · SingtelMSP', 'ok');

    const monthly = calcMonthly(amountSGD, elig.interestRate, termMonths);
    return res.status(200).json({
      id: loanID,
      applicantDID,
      amountSGD: parseFloat(amountSGD),
      interestRate: elig.interestRate,
      termMonths: parseInt(termMonths),
      monthlyPayment: monthly,
      status: 'APPROVED',
      tier: elig.tier,
      behaviorScore: elig.behaviorScore,
    });
  } catch(e) {
    res.status(500).json({ error: e.message });
  } finally {
    gateway?.close(); client?.close();
  }
}
