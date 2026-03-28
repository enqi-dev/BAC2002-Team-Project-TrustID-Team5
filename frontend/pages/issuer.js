/**
 * TrustID Issuer Portal
 * 4 independent consortium organisations each sign from their own MSP peer.
 * Singpass simulates MyInfo OIDC — signs via SingpassMSP (its own peer node).
 */
import { useState } from 'react';
import Link from 'next/link';

const ORGS = [
  {
    id: 'singpass', name: 'Singpass', msp: 'SingpassMSP', color: '#B2102F',
    badge: 'Gov Identity Authority',
    description: 'Simulates Singpass MyInfo OIDC — verifies NRIC, liveness, address via national identity infrastructure.',
    claims: ['identity_verified', 'nric_valid', 'address_verified', 'liveness_check', 'myinfo_consent'],
  },
  {
    id: 'dbs', name: 'DBS Bank', msp: 'DBSMSP', color: '#e8002d',
    badge: 'Financial Institution',
    description: 'Issues financial behaviour attestations — loan repayment history, savings, account verification.',
    claims: ['loan_repayment_12mo', 'savings_history', 'account_verified', 'credit_limit_ok', 'no_defaults'],
  },
  {
    id: 'grab', name: 'Grab', msp: 'GrabMSP', color: '#00b14f',
    badge: 'Platform Economy',
    description: 'Issues gig-economy income and activity attestations from ride-hailing and GrabPay data.',
    claims: ['income_verified', 'grabpay_active', 'driver_rating_4plus', 'monthly_trips_50plus', 'consistent_income'],
  },
  {
    id: 'singtel', name: 'Singtel', msp: 'SingtelMSP', color: '#cc0000',
    badge: 'Telco Operator',
    description: 'Issues telco behaviour attestations — bill payment history, account age, SIM registration.',
    claims: ['telco_bills_paid_24mo', 'account_age_2yr', 'postpaid_verified', 'sim_kyc_passed', 'no_fraud_flags'],
  },
];

export default function Issuer() {
  const [org,       setOrg]       = useState('singpass');
  const [didID,     setDidID]     = useState('');
  const [claimType, setClaimType] = useState('');
  const [claimVal,  setClaimVal]  = useState('');
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [success,   setSuccess]   = useState(null);
  const [history,   setHistory]   = useState([]);

  const selectedOrg = ORGS.find(o => o.id === org);

  const issue = async () => {
    if (!didID || !claimType || !claimVal) return setError('Fill in all fields');
    setLoading(true); setError(''); setSuccess(null);
    try {
      const r = await fetch('/api/issuer/attest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ didID, claimType, claimValue: claimVal, org }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setSuccess(d);
      setHistory(h => [{
        org: selectedOrg.name, msp: selectedOrg.msp, didID,
        claimType, claimVal, time: new Date().toLocaleTimeString('en-SG'),
      }, ...h]);
      setClaimVal('');
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div style={S.page}>
      <nav style={S.nav}>
        <Link href="/" style={S.logo}>TrustID</Link>
        <div style={S.navLinks}>
          <Link href="/" style={S.navLink}>Dashboard</Link>
          <Link href="/register" style={S.navLink}>Register DID</Link>
          <Link href="/issuer" style={S.navLink}>Issuer Portal</Link>
          <Link href="/loan" style={S.navLink}>Apply for Loan</Link>
        </div>
      </nav>

      <div style={S.container}>
        <h1 style={S.h1}>Issuer Portal</h1>
        <p style={S.sub}>
          Four independent consortium members each sign attestations from their own
          MSP peer node. No single org can manufacture trust alone — MAJORITY endorsement required.
        </p>

        {/* Org selector */}
        <div style={S.orgGrid}>
          {ORGS.map(o => (
            <button key={o.id} onClick={() => { setOrg(o.id); setClaimType(''); }}
              style={{ ...S.orgCard, borderColor: org === o.id ? o.color : '#e5e7eb', boxShadow: org === o.id ? `0 0 0 2px ${o.color}22` : 'none' }}>
              <div style={{ ...S.orgDot, background: o.color }} />
              <div style={S.orgCardName}>{o.name}</div>
              <div style={{ ...S.orgBadge, background: o.color + '18', color: o.color }}>{o.badge}</div>
              <div style={S.orgMsp}>{o.msp}</div>
            </button>
          ))}
        </div>

        {/* Org info banner */}
        <div style={{ ...S.orgBanner, borderColor: selectedOrg.color + '44', background: selectedOrg.color + '08' }}>
          <span style={{ ...S.orgBannerTag, background: selectedOrg.color, color: '#fff' }}>
            {selectedOrg.name} · {selectedOrg.msp}
          </span>
          <span style={S.orgBannerDesc}>{selectedOrg.description}</span>
          {selectedOrg.id === 'singpass' && (
            <span style={S.singpassNote}>
              ⚡ Simulates Singpass MyInfo OIDC flow — signs via independent SingpassMSP peer
            </span>
          )}
        </div>

        <div style={S.card}>
          <div style={S.field}>
            <label style={S.label}>Target DID</label>
            <input value={didID} onChange={e => setDidID(e.target.value)}
              placeholder="did:trustid:alice" style={S.input} />
          </div>
          <div style={S.fieldRow}>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Claim Type</label>
              <select value={claimType} onChange={e => setClaimType(e.target.value)} style={S.select}>
                <option value="">Select claim...</option>
                {selectedOrg.claims.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{ flex: 1 }}>
              <label style={S.label}>Claim Value</label>
              <input value={claimVal} onChange={e => setClaimVal(e.target.value)}
                placeholder="e.g. verified, 12_months_perfect" style={S.input} />
            </div>
          </div>

          {error && <div style={S.error}>{error}</div>}

          {success && (
            <div style={S.successBox}>
              <div style={S.successTitle}>✓ Attestation written to Fabric ledger</div>
              <div style={S.successDetail}>
                <span style={{ color: selectedOrg.color, fontWeight: 600 }}>{success.issuerOrg}</span>
                {' '}({success.issuerMSP}) attested <strong>{success.claimType}</strong> → <strong>{success.claimValue}</strong>
              </div>
              {success.singpassMyInfo && (
                <div style={S.myinfoBox}>
                  <span style={S.myinfoLabel}>Singpass MyInfo (simulated)</span>
                  <span>NRIC: {success.singpassMyInfo.nric} · {success.singpassMyInfo.source}</span>
                </div>
              )}
            </div>
          )}

          <button onClick={issue} disabled={loading} style={{ ...S.submitBtn, background: selectedOrg.color }}>
            {loading ? 'Writing to Blockchain...' : `Issue as ${selectedOrg.name} (${selectedOrg.msp})`}
          </button>
        </div>

        {/* Proof chain explainer */}
        <div style={S.explainer}>
          <div style={S.explainerTitle}>How TrustID Proof Chain works</div>
          <div style={S.explainerGrid}>
            {[
              { step: '1', text: 'User registers DID — genesis proof entry created on-chain' },
              { step: '2', text: 'Each issuer attests a behavioural claim from its own MSP peer' },
              { step: '3', text: 'Each attestation appends a SHA-256 proof to the DID\'s ProofChain' },
              { step: '4', text: 'AI oracle reads ProofChain diversity + behaviour events to score identity' },
            ].map(s => (
              <div key={s.step} style={S.explainerStep}>
                <div style={S.explainerNum}>{s.step}</div>
                <div style={S.explainerText}>{s.text}</div>
              </div>
            ))}
          </div>
        </div>

        {history.length > 0 && (
          <div style={S.histCard}>
            <div style={S.histTitle}>Session History</div>
            {history.map((h, i) => (
              <div key={i} style={S.histRow}>
                <span style={{ ...S.histOrg, color: ORGS.find(o => o.name === h.org)?.color }}>{h.org}</span>
                <span style={S.histMsp}>{h.msp}</span>
                <span style={S.histDid}>{h.didID}</span>
                <span style={S.histClaim}>{h.claimType}: {h.claimVal}</span>
                <span style={S.histTime}>{h.time}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const S = {
  page:         { fontFamily: 'system-ui,sans-serif', minHeight: '100vh', background: '#fafafa' },
  nav:          { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: 56, background: '#fff', borderBottom: '1px solid #eee' },
  logo:         { fontSize: 18, fontWeight: 700, textDecoration: 'none', color: '#111' },
  navLinks:     { display: 'flex', gap: 24 },
  navLink:      { fontSize: 14, color: '#444', textDecoration: 'none' },
  container:    { maxWidth: 760, margin: '0 auto', padding: '40px 20px' },
  h1:           { fontSize: 28, fontWeight: 700, margin: '0 0 8px' },
  sub:          { color: '#666', fontSize: 14, marginBottom: 28, lineHeight: 1.6 },
  orgGrid:      { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12, marginBottom: 16 },
  orgCard:      { padding: '14px 12px', border: '2px solid', borderRadius: 10, cursor: 'pointer', textAlign: 'center', background: '#fff', transition: 'all 0.15s' },
  orgDot:       { width: 10, height: 10, borderRadius: '50%', margin: '0 auto 8px' },
  orgCardName:  { fontSize: 13, fontWeight: 700, marginBottom: 6 },
  orgBadge:     { fontSize: 10, padding: '2px 8px', borderRadius: 10, marginBottom: 6, display: 'inline-block' },
  orgMsp:       { fontSize: 10, color: '#999', fontFamily: 'monospace' },
  orgBanner:    { border: '1px solid', borderRadius: 10, padding: '12px 16px', marginBottom: 20, display: 'flex', flexDirection: 'column', gap: 6 },
  orgBannerTag: { display: 'inline-block', fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, alignSelf: 'flex-start' },
  orgBannerDesc:{ fontSize: 13, color: '#555', lineHeight: 1.5 },
  singpassNote: { fontSize: 12, color: '#B2102F', fontWeight: 500 },
  card:         { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 28, marginBottom: 20 },
  field:        { marginBottom: 18 },
  fieldRow:     { display: 'flex', gap: 16, marginBottom: 18 },
  label:        { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 },
  input:        { width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  select:       { width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff' },
  error:        { background: '#FFF8F8', border: '1px solid #F7C1C1', borderRadius: 8, padding: '10px 14px', color: '#A32D2D', marginBottom: 16, fontSize: 13 },
  successBox:   { background: '#F0FDF8', border: '1px solid #9FE1CB', borderRadius: 8, padding: '12px 16px', marginBottom: 16 },
  successTitle: { fontSize: 13, fontWeight: 600, color: '#085041', marginBottom: 6 },
  successDetail:{ fontSize: 13, color: '#444' },
  myinfoBox:    { marginTop: 8, fontSize: 12, color: '#B2102F', display: 'flex', gap: 10, alignItems: 'center' },
  myinfoLabel:  { fontWeight: 600 },
  submitBtn:    { width: '100%', padding: 13, color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 },
  explainer:    { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 24, marginBottom: 20 },
  explainerTitle: { fontSize: 14, fontWeight: 600, marginBottom: 14 },
  explainerGrid:  { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 },
  explainerStep:  { display: 'flex', gap: 12, alignItems: 'flex-start', padding: '10px 14px', background: '#f9f9f9', borderRadius: 8 },
  explainerNum:   { background: '#111', color: '#fff', borderRadius: '50%', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, flexShrink: 0 },
  explainerText:  { fontSize: 13, color: '#555', lineHeight: 1.5 },
  histCard:     { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 24 },
  histTitle:    { fontSize: 14, fontWeight: 600, marginBottom: 14 },
  histRow:      { display: 'flex', gap: 12, alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f5f5f5', fontSize: 12 },
  histOrg:      { fontWeight: 600, minWidth: 70 },
  histMsp:      { color: '#999', fontFamily: 'monospace', fontSize: 10, minWidth: 100 },
  histDid:      { color: '#666', minWidth: 130 },
  histClaim:    { color: '#555', flex: 1 },
  histTime:     { color: '#999' },
};
