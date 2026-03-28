/**
 * TrustID Oracle Service
 * - Scores DIDs via two-model Flask pipeline
 * - Calls LogVerification after every score
 * - Handles StartTrainingRound + LogModelMetrics for both models
 */

const axios = require('axios');
const path  = require('path');
const fs    = require('fs');

const AI_URL = process.env.AI_SCORER_URL || 'http://localhost:5001';

let fabricAvailable = false;
let Gateway, Wallets;
try {
  ({ Gateway, Wallets } = require('fabric-network'));
  fabricAvailable = true;
} catch(e) {
  console.log('[Oracle] fabric-network not installed — mock mode');
}

const CONN_PATH   = path.join(__dirname, '..', 'network', 'config', 'connection-profile.json');
const WALLET_PATH = path.join(__dirname, 'wallet');

// ── Fabric connection ─────────────────────────────────────────────────────────

async function getContract() {
  const ccp     = JSON.parse(fs.readFileSync(CONN_PATH, 'utf8'));
  const wallet  = await Wallets.newFileSystemWallet(WALLET_PATH);
  const gateway = new Gateway();
  await gateway.connect(ccp, {
    wallet,
    identity: 'oracle-admin',
    discovery: { enabled: true, asLocalhost: true }
  });
  const network  = await gateway.getNetwork('trustid-channel');
  const contract = network.getContract('identityregistry');
  return { gateway, contract };
}

// ── Feature extraction (unchanged logic) ─────────────────────────────────────

function buildFeatures(did, events) {
  const totalLoans  = did.totalLoans  || 0;
  const totalRepaid = did.totalRepaid || 0;
  const repaymentRate = totalLoans > 0 ? totalRepaid / totalLoans : 0;

  const createdAt = new Date(did.createdAt || did.created || Date.now());
  const ageDays   = Math.max(1, (Date.now() - createdAt) / 86400000);

  const dates = events.map(e => new Date(e.timestamp)).sort((a,b) => a-b);
  const daysActive = dates.length > 1
    ? Math.max(1, (dates[dates.length-1] - dates[0]) / 86400000)
    : ageDays;
  const txPerDay = events.length / daysActive;

  const intervals = dates.slice(1).map((d,i) => (d - dates[i]) / 86400000);
  const mean = intervals.length ? intervals.reduce((a,b)=>a+b,0)/intervals.length : 1;
  const variance = intervals.length
    ? intervals.reduce((s,x)=>s+Math.pow(x-mean,2),0)/intervals.length : 0;
  const cv = mean > 0 ? Math.sqrt(variance)/mean : 0;

  const borrowed = events.filter(e=>e.eventType==='loan_issued')
    .reduce((s,e)=>s+parseFloat(e.amount||0),0);
  const paidBack = events.filter(e=>e.eventType==='loan_repaid')
    .reduce((s,e)=>s+parseFloat(e.amount||0),0);
  const loanToRepayRatio = borrowed > 0 ? paidBack/borrowed : 0;

  const attestationCount = did.uniqueIssuers > 0
    ? did.uniqueIssuers
    : Math.min((did.credentials || []).length, 4);

  return {
    did:                 did.id,
    repayment_rate:      repaymentRate,
    did_age_days:        ageDays,
    tx_per_day:          txPerDay,
    attestation_count:   attestationCount,
    tx_interval_cv:      cv,
    loan_to_repay_ratio: loanToRepayRatio,
  };
}

// ── Score a single DID ────────────────────────────────────────────────────────

async function scoreDID(contract, didID, triggeredBy = 'oracle') {
  console.log(`\n[Oracle] Scoring: ${didID}`);

  // Read from ledger
  const didBuf  = await contract.evaluateTransaction('GetDID', didID);
  const did     = JSON.parse(didBuf.toString());
  const evtBuf  = await contract.evaluateTransaction('GetBehaviorEvents', didID);
  const events  = JSON.parse(evtBuf.toString()) || [];

  // Build features
  const features = buildFeatures(did, events);
  console.log('[Oracle] Features:', JSON.stringify(features, null, 2));

  // Call Model 2 (identity trust score)
  const { data } = await axios.post(`${AI_URL}/score`, features);
  console.log(`[Oracle] Trust score: ${data.trustScore}/100 (${data.tier}) | Fraud prob: ${data.fraudProb}`);

  // Write trust score to ledger
  await contract.submitTransaction(
    'UpdateTrustScore',
    didID,
    data.trustScore.toString(),
    data.tier,
    data.fraudProb.toString()
  );
  console.log(`[Oracle] ✓ UpdateTrustScore committed for ${didID}`);

  // Write verification record to ledger (audit trail)
  await contract.submitTransaction(
    'LogVerification',
    didID,
    data.trustScore.toString(),
    data.tier,
    data.fraudProb.toString(),
    triggeredBy
  );
  console.log(`[Oracle] ✓ LogVerification committed for ${didID}`);

  return data;
}

// ── Full training round ───────────────────────────────────────────────────────

async function runTrainingRound(contract, roundID) {
  console.log(`\n[Oracle] ═══ Starting Training Round: ${roundID} ═══`);

  // Step 1 — commit StartTrainingRound to ledger (requires 3-peer endorsement)
  console.log('[Oracle] Proposing training round to consortium...');
  await contract.submitTransaction(
    'StartTrainingRound',
    roundID,
    'RandomForest+SMOTE',
    'Kaggle+Synthetic'
  );
  console.log('[Oracle] ✓ Training round endorsed and committed to ledger');

  // Step 2 — trigger Flask to retrain both models
  console.log('[Oracle] Triggering model retraining (both models)...');
  const { data: retrainResult } = await axios.post(`${AI_URL}/retrain`, { model: 'both' });
  console.log('[Oracle] ✓ Both models retrained');

  const m1 = retrainResult.model1;
  const m2 = retrainResult.model2;

  // Step 3 — log Model 1 metrics to ledger
  console.log('[Oracle] Committing Model 1 metrics to ledger...');
  await contract.submitTransaction(
    'LogModelMetrics',
    `${roundID}-kaggle`,
    m1.rocAuc.toString(),
    m1.f1Score.toString(),
    m1.accuracy.toString(),
    m1.precision.toString(),
    m1.recall.toString(),
    'RandomForest-Kaggle',
    m1.trainSize.toString()
  );
  console.log(`[Oracle] ✓ Model 1 metrics committed — ROC-AUC: ${m1.rocAuc} F1: ${m1.f1Score}`);

  // Step 4 — log Model 2 metrics to ledger
  console.log('[Oracle] Committing Model 2 metrics to ledger...');
  await contract.submitTransaction(
    'LogModelMetrics',
    `${roundID}-synthetic`,
    m2.rocAuc.toString(),
    m2.f1Score.toString(),
    m2.accuracy.toString(),
    m2.precision.toString(),
    m2.recall.toString(),
    'RandomForest-Synthetic',
    m2.trainSize.toString()
  );
  console.log(`[Oracle] ✓ Model 2 metrics committed — ROC-AUC: ${m2.rocAuc} F1: ${m2.f1Score}`);

  console.log('[Oracle] ═══ Training Round Complete ═══\n');
  return { model1: m1, model2: m2 };
}

// ── CLI entry point ───────────────────────────────────────────────────────────

async function main() {
  const [,, cmd, arg] = process.argv;

  if (!fabricAvailable) {
    console.log('[Oracle] fabric-network not available');
    return;
  }

  const { gateway, contract } = await getContract();

  try {
    switch(cmd) {

      case 'score':
        // node oracle.js score did:trustid:alice
        if (!arg) { console.log('Usage: node oracle.js score <did>'); break; }
        await scoreDID(contract, arg, 'manual');
        break;

      case 'train':
        // node oracle.js train round-001
        const roundID = arg || `round-${Date.now()}`;
        await runTrainingRound(contract, roundID);
        break;

      case 'score-all':
        // node oracle.js score-all
        // Scores all known demo DIDs
        const dids = ['did:trustid:alice', 'did:trustid:bob', 'did:trustid:fraud1'];
        for (const did of dids) {
          try { await scoreDID(contract, did, 'score-all'); }
          catch(e) { console.log(`[Oracle] Skipping ${did}: ${e.message}`); }
        }
        break;

      default:
        console.log('[Oracle] Commands:');
        console.log('  node oracle.js score <did>       — score a single DID');
        console.log('  node oracle.js train <roundID>   — run full training round');
        console.log('  node oracle.js score-all         — score all demo DIDs');
        setInterval(() => {}, 10000);
    }
  } finally {
    gateway.disconnect();
  }
}

main().catch(console.error);
