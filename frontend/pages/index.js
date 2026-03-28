import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

const scoreColor = s => s >= 80 ? '#1d9e75' : s >= 65 ? '#f5a623' : s >= 50 ? '#e05c2a' : '#e24b4a';
const tierBg     = t => t === 'Prime' ? '#E1F5EE' : t === 'Standard' ? '#FAEEDA' : t === 'Subprime' ? '#FAECE7' : '#FCEBEB';
const tierColor  = t => t === 'Prime' ? '#085041' : t === 'Standard' ? '#633806' : t === 'Subprime' ? '#712B13' : '#A32D2D';

export default function Home() {
  // Auth guard — redirect to login if not authenticated
  useEffect(() => {
    if (typeof window !== 'undefined' && !sessionStorage.getItem('trustid_auth')) {
      window.location.href = '/login';
    }
  }, []);

  const [didInput, setDidInput] = useState('');
  const [nric, setNric] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setNric(sessionStorage.getItem('trustid_auth') || '');
    }
  }, []);

  const logout = () => {
    if (typeof window !== 'undefined') sessionStorage.clear();
    window.location.href = '/login';
  };
  const [did,      setDid]      = useState(null);
  const [elig,     setElig]     = useState(null);
  const [loading,  setLoading]  = useState(false);
  const [scoring,  setScoring]  = useState(false);
  const [training, setTraining] = useState(false);
  const [error,    setError]    = useState('');
  const [msg,      setMsg]      = useState('');
  const [logs,     setLogs]     = useState([]);
  const [metrics,  setMetrics]  = useState(null);
  const logRef = useRef(null);

  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/activity-log?since=0&flaskSince=0');
        const d = await r.json();
        const localLogs = d.logs || [];
        const flaskLogs = d.flaskLogs || [];
        // Reset if file shrank (cleared)
        if (localLogs.length < localCount.current) localCount.current = 0;
        if (flaskLogs.length < flaskCount.current) flaskCount.current = 0;
        const newLocal = localCount.current === 0 && localLogs.length > 3 ? [] : localLogs.slice(localCount.current); if (localCount.current === 0) localCount.current = localLogs.length;
        const newFlask = flaskLogs.slice(flaskCount.current);
        const newOnes = [...newLocal, ...newFlask];
        if (newOnes.length > 0) {
          localCount.current = localLogs.length;
          flaskCount.current = flaskLogs.length;
          setLogs(prev => [...prev, ...newOnes].slice(-200));
        }
      } catch(e) {}
    };
    poll();
    const iv = setInterval(poll, 3000);
    return () => clearInterval(iv);
  }, []);

  // Activity log polling — local file only, show all logs
  const localCount = useRef(0);
  useEffect(() => {
    const poll = async () => {
      try {
        const r = await fetch('/api/activity-log?since=0');
        const d = await r.json();
        const logs = d.logs || [];
        if (logs.length < localCount.current) localCount.current = 0;
        const newOnes = logs.slice(localCount.current);
        if (newOnes.length > 0) {
          localCount.current = logs.length;
          setLogs(prev => [...prev, ...newOnes].slice(-200));
        }
      } catch(e) {}
    };
    poll();
    const iv = setInterval(poll, 2000);
    return () => clearInterval(iv);
  }, []);

  // Auto scroll log panel
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Load metrics on mount
  useEffect(() => {
    fetch('/api/metrics')
      .then(r => r.json())
      .then(d => setMetrics(d))
      .catch(() => {});
  }, []);

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

  const triggerTraining = async () => {
    setTraining(true); setMsg('');
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString('en-SG')}] Training round initiated — requesting endorsement from DBS, Grab, Singtel...`]);
    try {
      const r = await fetch('/api/oracle/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roundID: `round-${Date.now()}` })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setMsg('Training round complete. Metrics committed to chain.');
      const mr = await fetch('/api/metrics');
      const md = await mr.json();
      setMetrics(md);
    } catch(e) { setError(e.message); }
    finally { setTraining(false); }
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
          {nric && <span style={{fontSize:12,color:'#666',background:'#f5f5f5',padding:'4px 10px',borderRadius:20}}>🔐 {nric}</span>}
          <button onClick={logout} style={{fontSize:13,color:'#E8192C',background:'none',border:'1px solid #E8192C',borderRadius:6,padding:'4px 12px',cursor:'pointer'}}>Logout</button>
        </div>
      </nav>

      <div style={styles.outer}>
        {/* LEFT: main content */}
        <div style={styles.main}>
          <div style={styles.hero}>
            <h1 style={styles.h1}>Decentralized Identity</h1>
            <p style={styles.subtitle}>Behavioral trust scores — built from verified on-chain activity</p>
          </div>

          {/* Training round panel */}
          <div style={styles.trainPanel}>
            <div style={styles.trainLeft}>
              <div style={styles.trainTitle}>AI Training Round</div>
              <div style={styles.trainSub}>Endorses round on-chain, retrains both models, commits metrics to Fabric</div>
              
            </div>
            <button onClick={triggerTraining} style={styles.trainBtn} disabled={training}>
              {training ? '⏳ Training...' : '🚀 Start Training Round'}
            </button>
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

              <div style={styles.barWrap}>
                <div style={{ ...styles.bar, width: `${did.behaviorScore}%`, background: scoreColor(did.behaviorScore) }} />
              </div>
              {did.lastScored && (
                <div style={styles.scoredAt}>Last scored: {new Date(did.lastScored).toLocaleString('en-SG')}</div>
              )}

              <button onClick={triggerScore} style={styles.oracleBtn} disabled={scoring}>
                {scoring ? '⏳ Scoring...' : '🔄 Trigger AI Score Update'}
              </button>

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
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* RIGHT: activity log */}
        <div style={styles.sidebar}>
          <div style={styles.logHeader}>
            <span style={styles.logTitle}>Activity Log</span>
            <span style={styles.logDot} />
            <span style={styles.logLive}>LIVE</span>
            <button onClick={async () => { await fetch('/api/activity-log', {method:'DELETE'}); setLogs([]); localCount.current=0; flaskCount.current=0; setLogs([]); }} style={styles.clearBtn}>Clear</button>
          </div>
          <div style={styles.logBox} ref={logRef}>
            {logs.length === 0 && (
              <div style={styles.logEmpty}>Waiting for activity...</div>
            )}
            {logs.map((line, i) => {
              const isSuccess = line.includes('✓') || line.includes('committed') || line.includes('APPROVED') || line.includes('complete');
              const isError   = line.includes('ERROR') || line.includes('failed');
              const isWarn    = line.includes('Training round') || line.includes('Proposing') || line.includes('Triggering');
              const color = isError ? '#f87171' : isSuccess ? '#4ade80' : isWarn ? '#fbbf24' : '#7dd3fc';
              return <div key={i} style={{ ...styles.logLine, color }}>{line}</div>;
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  page:        { fontFamily: 'system-ui,sans-serif', minHeight: '100vh', background: '#fafafa' },
  nav:         { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: 56, background: '#fff', borderBottom: '1px solid #eee' },
  logo:        { fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px' },
  navLinks:    { display: 'flex', gap: 24, alignItems: 'center' },
  navLink:     { fontSize: 14, color: '#444', textDecoration: 'none' },
  navLinkSingpass: { fontSize: 14, color: '#E8192C', textDecoration: 'none', fontWeight: 500 },
  outer:       { display: 'flex', gap: 24, maxWidth: 1200, margin: '0 auto', padding: '32px 20px', alignItems: 'flex-start' },
  main:        { flex: 1, minWidth: 0 },
  sidebar:     { width: 320, flexShrink: 0, position: 'sticky', top: 24 },
  hero:        { textAlign: 'center', marginBottom: 24 },
  h1:          { fontSize: 28, fontWeight: 700, margin: '0 0 8px' },
  subtitle:    { fontSize: 14, color: '#666', margin: 0 },
  trainPanel:  { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16 },
  trainLeft:   { flex: 1 },
  trainTitle:  { fontSize: 14, fontWeight: 600, marginBottom: 4 },
  trainSub:    { fontSize: 12, color: '#888', marginBottom: 10 },
  metricsRow:  { display: 'flex', gap: 10 },
  metricBox:   { background: '#f5f5f5', borderRadius: 6, padding: '6px 10px', textAlign: 'center' },
  metricVal:   { fontSize: 16, fontWeight: 700, color: '#111' },
  metricLabel: { fontSize: 10, color: '#888' },
  trainBtn:    { padding: '10px 18px', background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' },
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
  logHeader:   { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 },
  logTitle:    { fontSize: 13, fontWeight: 600 },
  logDot:      { width: 6, height: 6, borderRadius: '50%', background: '#4ade80', animation: 'pulse 2s infinite' },
  logLive:     { fontSize: 10, color: '#4ade80', fontWeight: 600 },
  clearBtn:    { marginLeft: 'auto', fontSize: 11, color: '#999', background: 'none', border: 'none', cursor: 'pointer' },
  logBox:      { background: '#0d1117', borderRadius: 8, padding: '10px 12px', height: 320, overflowY: 'auto', fontFamily: 'monospace', fontSize: 11 },
  logEmpty:    { color: '#444', fontSize: 11 },
  logLine:     { marginBottom: 3, lineHeight: 1.5, wordBreak: 'break-all' },
  metricsPanel:{ background: '#fff', border: '1px solid #eee', borderRadius: 8, padding: '12px 14px', marginTop: 12 },
  metricsPanelTitle: { fontSize: 12, fontWeight: 600, marginBottom: 8, color: '#333' },
  modelRow:    { display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 },
  modelName:   { fontSize: 11, fontWeight: 600, color: '#555', minWidth: 60 },
  modelStat:   { fontSize: 11, color: '#333', background: '#f5f5f5', padding: '2px 6px', borderRadius: 4 },
  endorsedBy:  { fontSize: 10, color: '#999', marginTop: 6 },
};
