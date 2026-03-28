import { useState } from 'react';
import Link from 'next/link';

const scoreColor = s => s >= 80 ? '#1d9e75' : s >= 65 ? '#f5a623' : s >= 50 ? '#e05c2a' : '#e24b4a';
const tierBg     = t => t === 'Prime' ? '#E1F5EE' : t === 'Standard' ? '#FAEEDA' : t === 'Subprime' ? '#FAECE7' : '#FCEBEB';
const tierColor  = t => t === 'Prime' ? '#085041' : t === 'Standard' ? '#633806' : t === 'Subprime' ? '#712B13' : '#A32D2D';

export default function Home() {
  const [didInput, setDidInput] = useState('');
  const [did,      setDid]      = useState(null);
  const [elig,     setElig]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [scoring,  setScoring]  = useState(false);
  const [error,    setError]    = useState('');
  const [msg,      setMsg]      = useState('');

  const lookup = async (id) => {
    const target = id || didInput;
    if (!target) return;
    setLoading(true); setError(''); setDid(null); setElig(null); setMsg('');
    try {
      const r1 = await fetch(`/api/identity/${encodeURIComponent(target)}`);
      const d1 = await r1.json();
      if (!r1.ok) throw new Error(d1.error || 'DID not found');
      setDid(d1);
      const r2 = await fetch(`/api/loan/eligibility?action=eligibility&did=${encodeURIComponent(target)}`);
      const d2 = await r2.json();
      if (r2.ok) setElig(d2);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const triggerScore = async () => {
    if (!did) return;
    setScoring(true); setMsg('');
    try {
      const r = await fetch('/api/oracle/score', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ did: did.id })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMsg('Score updated! Refreshing...');
      setTimeout(() => lookup(did.id), 2000);
    } catch(e) { setError(e.message); }
    finally { setScoring(false); }
  };

  return (
    <div style={styles.page}>
      <nav style={styles.nav}>
        <span style={styles.logo}>TrustID</span>
        <div style={styles.navLinks}>
          <Link href="/" style={styles.navLink}>Dashboard</Link>
          <Link href="/register" style={styles.navLink}>Register DID</Link>
          <Link href="/issuer" style={styles.navLink}>Issuer Portal</Link>
          <Link href="/loan" style={styles.navLink}>Apply for Loan</Link>
        </div>
      </nav>

      <div style={styles.container}>
        <div style={styles.hero}>
          <h1 style={styles.h1}>Decentralized Identity</h1>
          <p style={styles.subtitle}>Behavioral trust scores — built from verified on-chain activity</p>
        </div>

        {/* Search */}
        <div style={styles.searchRow}>
          <input
            value={didInput}
            onChange={e => setDidInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && lookup()}
            placeholder="Enter DID (e.g. did:trustid:alice)"
            style={styles.input}
          />
          <button onClick={() => lookup()} style={styles.btnPrimary} disabled={loading}>
            {loading ? 'Loading...' : 'Lookup'}
          </button>
          <Link href="/register" style={styles.btnSecondary}>+ Register DID</Link>
        </div>

        {/* Quick demo buttons */}
        <div style={styles.demoRow}>
          <span style={styles.demoLabel}>Quick demo:</span>
          {['did:trustid:alice','did:trustid:bob','did:trustid:fraud1'].map(d => (
            <button key={d} onClick={() => { setDidInput(d); lookup(d); }} style={styles.demoBtn}>
              {d.split(':')[2]}
            </button>
          ))}
        </div>

        {error && <div style={styles.error}>{error}</div>}
        {msg   && <div style={styles.success}>{msg}</div>}

        {did && (
          <div style={styles.card}>
            {/* Identity header */}
            <div style={styles.idHeader}>
              <div>
                <div style={styles.label}>Decentralized Identifier</div>
                <div style={styles.didText}>{did.id}</div>
                <div style={styles.meta}>
                  Owner: {did.owner} &nbsp;·&nbsp;
                  Active since {new Date(did.createdAt).toLocaleDateString('en-SG')} &nbsp;·&nbsp;
                  {did.txCount || 0} transactions
                </div>
              </div>
              <div style={styles.scoreBox}>
                <div style={{ fontSize: 52, fontWeight: 700, color: scoreColor(did.behaviorScore), lineHeight: 1 }}>
                  {did.behaviorScore}
                </div>
                <div style={styles.scoreLabel}>TRUST SCORE</div>
                {did.scoreTier && did.scoreTier !== 'Unscored' && (
                  <span style={{ ...styles.tier, background: tierBg(did.scoreTier), color: tierColor(did.scoreTier) }}>
                    {did.scoreTier}
                  </span>
                )}
              </div>
            </div>

            {/* Score bar */}
            <div style={styles.barWrap}>
              <div style={{ ...styles.bar, width: `${did.behaviorScore}%`, background: scoreColor(did.behaviorScore) }} />
            </div>
            {did.lastScored && (
              <div style={styles.scoredAt}>Last scored: {new Date(did.lastScored).toLocaleString('en-SG')}</div>
            )}

            {/* Oracle button */}
            <button onClick={triggerScore} style={styles.oracleBtn} disabled={scoring}>
              {scoring ? '⏳ Scoring...' : '🔄 Trigger AI Score Update'}
            </button>

            {/* Attestations */}
            <div style={styles.section}>
              <div style={styles.sectionTitle}>
                Attestations ({did.attestations?.length || 0})
                <Link href="/issuer" style={styles.sectionLink}>+ Add Attestation</Link>
              </div>
              {!did.attestations?.length && (
                <div style={styles.empty}>No attestations yet. Visit the Issuer Portal.</div>
              )}
              {did.attestations?.map((a, i) => (
                <div key={i} style={{ ...styles.attestRow, borderColor: a.valid ? '#9FE1CB' : '#F7C1C1', background: a.valid ? '#F0FDF8' : '#FFF8F8' }}>
                  <div>
                    <span style={styles.issuer}>{a.issuerOrg}</span>
                    <span style={styles.claimType}>{a.claimType}</span>
                  </div>
                  <div style={styles.attestRight}>
                    <span style={styles.claimVal}>{a.claimValue}</span>
                    <span style={{ ...styles.badge, background: a.valid ? '#E1F5EE' : '#FCEBEB', color: a.valid ? '#085041' : '#A32D2D' }}>
                      {a.valid ? 'Valid' : 'Revoked'}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Loan eligibility */}
            {elig && (
              <div style={styles.section}>
                <div style={styles.sectionTitle}>Loan Eligibility</div>
                {elig.eligible ? (
                  <>
                    <div style={styles.eligGrid}>
                      {[
                        { label: 'TIER',          value: elig.tier },
                        { label: 'INTEREST RATE', value: `${elig.interestRate}% p.a.` },
                        { label: 'MAX LOAN',       value: `S$${elig.maxAmountSGD?.toLocaleString()}` },
                      ].map(({ label, value }) => (
                        <div key={label} style={styles.eligBox}>
                          <div style={styles.eligVal}>{value}</div>
                          <div style={styles.eligLabel}>{label}</div>
                        </div>
                      ))}
                    </div>
                    <Link href={`/loan?did=${did.id}`} style={styles.applyBtn}>Apply for Loan →</Link>
                  </>
                ) : (
                  <div style={styles.notElig}>
                    Not eligible — trust score {did.behaviorScore}/100 is below threshold.
                    Build more on-chain history and trigger a rescore.
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  page:        { fontFamily: 'system-ui,sans-serif', minHeight: '100vh', background: '#fafafa' },
  nav:         { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: 56, background: '#fff', borderBottom: '1px solid #eee' },
  logo:        { fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px' },
  navLinks:    { display: 'flex', gap: 24 },
  navLink:     { fontSize: 14, color: '#444', textDecoration: 'none' },
  container:   { maxWidth: 800, margin: '0 auto', padding: '40px 20px' },
  hero:        { textAlign: 'center', marginBottom: 32 },
  h1:          { fontSize: 32, fontWeight: 700, margin: '0 0 8px' },
  subtitle:    { fontSize: 15, color: '#666', margin: 0 },
  searchRow:   { display: 'flex', gap: 10, marginBottom: 12 },
  input:       { flex: 1, padding: '11px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, outline: 'none' },
  btnPrimary:  { padding: '11px 24px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500, whiteSpace: 'nowrap' },
  btnSecondary:{ padding: '11px 18px', background: '#fff', color: '#111', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap' },
  demoRow:     { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 24 },
  demoLabel:   { fontSize: 12, color: '#999' },
  demoBtn:     { fontSize: 12, padding: '4px 12px', border: '1px solid #ddd', borderRadius: 20, background: '#fff', cursor: 'pointer', color: '#444' },
  error:       { background: '#FFF8F8', border: '1px solid #F7C1C1', borderRadius: 8, padding: '12px 16px', color: '#A32D2D', marginBottom: 16, fontSize: 14 },
  success:     { background: '#F0FDF8', border: '1px solid #9FE1CB', borderRadius: 8, padding: '12px 16px', color: '#085041', marginBottom: 16, fontSize: 14 },
  card:        { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 28 },
  idHeader:    { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 },
  label:       { fontSize: 11, color: '#999', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 },
  didText:     { fontSize: 16, fontWeight: 600, marginBottom: 6 },
  meta:        { fontSize: 13, color: '#666' },
  scoreBox:    { textAlign: 'center', background: '#f9f9f9', borderRadius: 12, padding: '16px 24px', minWidth: 120 },
  scoreLabel:  { fontSize: 10, color: '#999', marginTop: 4, letterSpacing: '0.05em' },
  tier:        { display: 'inline-block', marginTop: 8, fontSize: 12, fontWeight: 500, padding: '3px 10px', borderRadius: 20 },
  barWrap:     { height: 6, background: '#f0f0f0', borderRadius: 3, marginBottom: 8 },
  bar:         { height: '100%', borderRadius: 3, transition: 'width 0.5s ease' },
  scoredAt:    { fontSize: 12, color: '#999', marginBottom: 16 },
  oracleBtn:   { width: '100%', padding: '10px', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13, marginBottom: 24 },
  section:     { borderTop: '1px solid #f0f0f0', paddingTop: 20, marginTop: 4 },
  sectionTitle:{ fontSize: 14, fontWeight: 600, marginBottom: 14, display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  sectionLink: { fontSize: 12, color: '#666', textDecoration: 'none' },
  empty:       { color: '#999', fontSize: 13 },
  attestRow:   { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 8, border: '1px solid', marginBottom: 8 },
  issuer:      { fontSize: 13, fontWeight: 500 },
  claimType:   { fontSize: 12, color: '#666', marginLeft: 10 },
  attestRight: { display: 'flex', gap: 10, alignItems: 'center' },
  claimVal:    { fontSize: 12, color: '#555' },
  badge:       { fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 500 },
  eligGrid:    { display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 16 },
  eligBox:     { background: '#f9f9f9', borderRadius: 8, padding: '14px 16px', textAlign: 'center' },
  eligVal:     { fontSize: 20, fontWeight: 600, marginBottom: 4 },
  eligLabel:   { fontSize: 11, color: '#999' },
  applyBtn:    { display: 'block', textAlign: 'center', padding: '12px', background: '#111', color: '#fff', borderRadius: 8, textDecoration: 'none', fontSize: 14, fontWeight: 500 },
  notElig:     { background: '#FFF8F8', borderRadius: 8, padding: '12px 16px', color: '#A32D2D', fontSize: 13 },
};
