/**
 * TrustID Oracle Service
 * Bridges AI scorer → Hyperledger Fabric chaincode
 * 
 * Start:  node oracle.js
 * Manual: node oracle.js score did:trustid:alice
 */

const axios = require('axios');
const path  = require('path');
const fs    = require('fs');

const AI_URL = process.env.AI_SCORER_URL || 'http://localhost:5001';

// Try to load Fabric gateway — if not available, run in mock mode
let fabricAvailable = false;
let Gateway, Wallets;
try {
  ({ Gateway, Wallets } = require('fabric-network'));
  fabricAvailable = true;
} catch(e) {
  console.log('[Oracle] fabric-network not installed — running in mock mode');
}

const CONN_PATH   = path.join(__dirname, '..', 'network', 'config', 'connection-profile.json');
const WALLET_PATH = path.join(__dirname, 'wallet');

async function getContract() {
  if (!fs.existsSync(CONN_PATH)) {
    throw new Error(`Connection profile not found: ${CONN_PATH}\nRun scripts/1-start-network.sh first`);
  }
  const ccp     = JSON.parse(fs.readFileSync(CONN_PATH, 'utf8'));
  const wallet  = await Wallets.newFileSystemWallet(WALLET_PATH);
  const gateway = new Gateway();
  await gateway.connect(ccp, {
    wallet, identity: 'oracle-admin',
    discovery: { enabled: true, asLocalhost: true }
  });
  const network  = await gateway.getNetwork('trustid-channel');
  const contract = network.getContract('identityregistry');
  return { gateway, contract };
}

function buildFeatures(did, events) {
  const loans   = events.filter(e => ['loan_issued','loan_repaid','loan_defaulted'].includes(e.eventType));
  const repaid  = events.filter(e => e.eventType === 'loan_repaid').length;
  const issued  = events.filter(e => e.eventType === 'loan_issued').length;
  const dates   = events.map(e => new Date(e.timestamp)).sort((a,b)=>a-b);
  
  const intervals = dates.slice(1).map((d,i) => (d-dates[i])/86400000);
  const mean = intervals.length ? intervals.reduce((a,b)=>a+b,0)/intervals.length : 0;
  const variance = intervals.length ? intervals.reduce((s,x)=>s+Math.pow(x-mean,2),0)/intervals.length : 0;
  const cv = mean > 0 ? Math.sqrt(variance)/mean : 0;

  const borrowed = loans.filter(e=>e.eventType==='loan_issued').reduce((s,e)=>s+parseFloat(e.amount||0),0);
  const paidBack = loans.filter(e=>e.eventType==='loan_repaid').reduce((s,e)=>s+parseFloat(e.amount||0),0);
  const createdAt = new Date(did.createdAt || Date.now());
  const ageDays = Math.max(1, (Date.now()-createdAt)/86400000);
  const daysActive = dates.length>1 ? Math.max(1,(dates[dates.length-1]-dates[0])/86400000) : ageDays;
  const issuers = [...new Set((did.attestations||[]).filter(a=>a.valid).map(a=>a.issuerOrg))];

  return {
    did:                 did.id,
    repayment_rate:      issued > 0 ? repaid/issued : 0,
    did_age_days:        ageDays,
    tx_per_day:          events.length / daysActive,
    attestation_count:   issuers.length,
    tx_interval_cv:      cv,
    loan_to_repay_ratio: borrowed > 0 ? paidBack/borrowed : 0,
  };
}

async function scoreDID(contract, didID) {
  console.log(`\n[Oracle] Scoring: ${didID}`);

  const didBuf  = await contract.evaluateTransaction('GetDID', didID);
  const did     = JSON.parse(didBuf.toString());
  const evtBuf  = await contract.evaluateTransaction('GetBehaviorEvents', didID);
  const events  = JSON.parse(evtBuf.toString()) || [];

  const features = buildFeatures(did, events);
  console.log('[Oracle] Features:', JSON.stringify(features, null, 2));

  const { data } = await axios.post(`${AI_URL}/score`, features);
  console.log(`[Oracle] Score: ${data.trustScore}/100 (${data.tier}) | Fraud prob: ${data.fraudProb}`);

  await contract.submitTransaction(
    'UpdateTrustScore',
    didID,
    data.trustScore.toString(),
    data.tier,
    data.fraudProb.toString()
  );
  console.log(`[Oracle] ✓ Score ${data.trustScore} written to Fabric ledger`);
  return data;
}

// Mock mode for testing without Fabric
async function mockScore(didID) {
  console.log(`[Oracle MOCK] Scoring ${didID}...`);
  const mockFeatures = {
    did: didID,
    repayment_rate: 0.9,
    did_age_days: 300,
    tx_per_day: 0.8,
    attestation_count: 3,
    tx_interval_cv: 0.7,
    loan_to_repay_ratio: 0.85,
  };
  const { data } = await axios.post(`${AI_URL}/score`, mockFeatures);
  console.log(`[Oracle MOCK] Result: ${data.trustScore}/100 (${data.tier})`);
  return data;
}

async function main() {
  const [,, cmd, arg] = process.argv;

  if (cmd === 'score' && arg) {
    if (!fabricAvailable) {
      return mockScore(arg);
    }
    const { gateway, contract } = await getContract();
    try {
      await scoreDID(contract, arg);
    } finally {
      gateway.disconnect();
    }
  } else {
    console.log('[Oracle] Listening mode...');
    console.log('[Oracle] For POC demo, use: node oracle.js score <did>');
    // Keep running
    setInterval(() => {}, 10000);
  }
}

main().catch(console.error);
