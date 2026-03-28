/**
 * Issuer Attestation API
 * Each org signs from its OWN MSP peer — Singpass, DBS, Grab, Singtel are independent.
 * 
 * Singpass simulates the MyInfo/OIDC flow:
 *   - In production: user authenticates via Singpass OIDC, server gets MyInfo data
 *   - For POC: Singpass peer (SingpassMSP) signs the KYC claim on-chain directly
 *   - Reference: https://github.com/GovTechSG/singpass-myinfo-oidc-helper
 * 
 * The key difference from eKYC: we do NOT store document hashes.
 * We store behavioural claims (e.g. "identity_verified", "income_3500_monthly")
 * signed by an independent consortium member's MSP key.
 */

import { getGateway, getContract } from '../../../lib/fabric';

// Simulated Singpass MyInfo data resolver
// In production this would call the actual MyInfo API after OIDC auth
function simulateSingpassMyInfo(didID) {
  return {
    name:   'Verified via Singpass MyInfo',
    nric:   `S${Math.floor(1000000 + Math.random() * 9000000)}Z`,
    status: 'identity_verified',
    source: 'singpass_myinfo_oidc_simulated',
  };
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { didID, claimType, claimValue, org } = req.body;
  if (!didID || !claimType || !claimValue) {
    return res.status(400).json({ error: 'Missing fields: didID, claimType, claimValue' });
  }

  // Map org name to fabric peer org key
  const orgMap = {
    singpass: 'singpass',  // SingpassMSP — its OWN peer, not DBS anymore
    dbs:      'dbs',       // DBSMSP
    grab:     'grab',      // GrabMSP
    singtel:  'singtel',   // SingtelMSP
  };
  const fabricOrg = orgMap[org] || 'dbs';

  // For Singpass: simulate MyInfo OIDC resolution
  let resolvedClaimValue = claimValue;
  let singpassMeta = null;
  if (org === 'singpass') {
    singpassMeta = simulateSingpassMyInfo(didID);
    resolvedClaimValue = singpassMeta.status;
  }

  let gateway, client;
  try {
    ({ gateway, client } = await getGateway(fabricOrg));
    const contract = getContract(gateway, 'identityregistry');
    const expires  = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    // docHash param kept for chaincode compat but proof is behavioural
    const docHash  = `bproof_${fabricOrg}_${Date.now()}`;

    await contract.submitTransaction(
      'IssueCredential',
      didID, claimType, resolvedClaimValue, expires, docHash
    );

    res.status(200).json({
      success: true,
      didID,
      claimType,
      claimValue: resolvedClaimValue,
      issuerOrg:  org,
      issuerMSP:  fabricOrg.toUpperCase() + 'MSP',
      ...(singpassMeta && { singpassMyInfo: singpassMeta }),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  } finally {
    gateway?.close();
    client?.close();
  }
}
