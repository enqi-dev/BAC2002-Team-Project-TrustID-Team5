import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Register() {
  const router = useRouter();
  const [owner,   setOwner]   = useState('');
  const [didID,   setDidID]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');
  const [locked,  setLocked]  = useState(false);
  const [nric,    setNric]    = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const auth = sessionStorage.getItem('trustid_auth');
    if (!auth) { router.push('/login'); return; }
    setNric(auth);

    // Check sessionStorage first
    const storedDID = sessionStorage.getItem('trustid_did_' + auth);
    if (storedDID) {
      setDidID(storedDID);
      setLocked(true);
      setError('You already have a registered DID: ' + storedDID + '. One Singpass account = one DID.');
      return;
    }

    // Check ledger via registry
    const checkLedger = async () => {
      const registryRaw = sessionStorage.getItem('trustid_registry_' + auth);
      const registry = registryRaw ? JSON.parse(registryRaw) : [];
      for (const did of registry) {
        try {
          const r = await fetch('/api/identity/' + encodeURIComponent(did));
          if (r.ok) {
            sessionStorage.setItem('trustid_did_' + auth, did);
            setDidID(did);
            setLocked(true);
            setError('You already have a registered DID: ' + did + '. One Singpass account = one DID.');
            return;
          }
        } catch(e) {}
      }
    };
    checkLedger();
  }, []);

  const autoGen = () => {
    const slug = owner.toLowerCase().replace(/\s+/g,'-').replace(/[^a-z0-9-]/g,'') || 'user';
    setDidID('did:trustid:' + slug + '-' + Date.now().toString(36));
  };

  const logout = () => {
    sessionStorage.clear();
    router.push('/login');
  };

  const register = async () => {
    if (locked) return setError('You already have a registered DID. One Singpass account = one DID.');
    if (!owner || !didID) return setError('Fill in both fields');
    setLoading(true); setError(''); setSuccess('');
    try {
      const r = await fetch('/api/identity/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ didID, owner, publicKeyMultibase: 'z6Mk' + Math.random().toString(36).slice(2,18) })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);

      // Store DID mapping
      sessionStorage.setItem('trustid_did_' + nric, didID);
      sessionStorage.setItem('trustid_current_did', didID);

      // Store in registry for cross-session lookup
      const registryRaw = sessionStorage.getItem('trustid_registry_' + nric);
      const registry = registryRaw ? JSON.parse(registryRaw) : [];
      if (!registry.includes(didID)) registry.push(didID);
      sessionStorage.setItem('trustid_registry_' + nric, JSON.stringify(registry));

      setLocked(true);
      setSuccess('DID registered: ' + didID + ' — now go to Issuer Portal to add attestations');
      setTimeout(() => router.push('/?did=' + encodeURIComponent(didID)), 2500);
    } catch(e) { setError(e.message); }
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
          {nric && <span style={S.nricBadge}>🔐 {nric}</span>}
          <button onClick={logout} style={S.logoutBtn}>Logout</button>
        </div>
      </nav>
      <div style={S.container}>
        <h1 style={S.h1}>Register Decentralized Identity</h1>
        <p style={S.sub}>Create your on-chain DID. Once registered, visit the Issuer Portal to get attestations from Singpass, DBS, Grab and Singtel.</p>
        <div style={S.card}>
          <div style={S.field}>
            <label style={S.label}>Full Name</label>
            <input value={owner} onChange={e => setOwner(e.target.value)}
              placeholder="e.g. Alice Tan" style={S.input} disabled={locked}/>
          </div>
          <div style={S.field}>
            <label style={S.label}>DID (Decentralized Identifier)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={didID} onChange={e => setDidID(e.target.value)}
                placeholder="did:trustid:..." style={{ ...S.input, flex: 1 }} disabled={locked}/>
              {!locked && <button onClick={autoGen} style={S.genBtn}>Auto-generate</button>}
            </div>
            <div style={S.hint}>Format: did:trustid:your-identifier · One DID per Singpass account</div>
          </div>
          {error   && <div style={locked ? S.warn : S.error}>{error}</div>}
          {success && <div style={S.success}>{success}</div>}
          {!locked && (
            <button onClick={register} disabled={loading} style={S.submitBtn}>
              {loading ? 'Registering on Fabric...' : 'Register DID on Blockchain'}
            </button>
          )}
          {locked && (
            <button onClick={() => router.push('/?did=' + encodeURIComponent(didID))} style={S.viewBtn}>
              View My Identity →
            </button>
          )}
        </div>
        <div style={S.infoBox}>
          <div style={S.infoTitle}>What happens next?</div>
          <div style={S.infoStep}>1. Your DID is written to the Hyperledger Fabric ledger</div>
          <div style={S.infoStep}>2. Go to Issuer Portal — get Singpass to verify your NRIC</div>
          <div style={S.infoStep}>3. DBS, Grab, Singtel each independently attest your behaviour</div>
          <div style={S.infoStep}>4. Trigger AI scoring — trust score 0-100 computed on-chain</div>
          <div style={S.infoStep}>5. Apply for loan — auto-approved based on trust score</div>
        </div>
      </div>
    </div>
  );
}

const S = {
  page:      { fontFamily: 'system-ui,sans-serif', minHeight: '100vh', background: '#fafafa' },
  nav:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: 56, background: '#fff', borderBottom: '1px solid #eee' },
  logo:      { fontSize: 18, fontWeight: 700, textDecoration: 'none', color: '#111' },
  navLinks:  { display: 'flex', gap: 16, alignItems: 'center' },
  navLink:   { fontSize: 14, color: '#444', textDecoration: 'none' },
  nricBadge: { fontSize: 12, color: '#666', background: '#f5f5f5', padding: '4px 10px', borderRadius: 20 },
  logoutBtn: { fontSize: 13, color: '#E8192C', background: 'none', border: '1px solid #E8192C', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' },
  container: { maxWidth: 600, margin: '0 auto', padding: '40px 20px' },
  h1:        { fontSize: 28, fontWeight: 700, margin: '0 0 8px' },
  sub:       { color: '#666', fontSize: 15, marginBottom: 32 },
  card:      { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 28, marginBottom: 24 },
  field:     { marginBottom: 20 },
  label:     { display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 },
  input:     { width: '100%', padding: '10px 14px', border: '1px solid #ddd', borderRadius: 8, fontSize: 14, outline: 'none', boxSizing: 'border-box' },
  genBtn:    { padding: '10px 16px', background: '#f5f5f5', border: '1px solid #ddd', borderRadius: 8, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' },
  hint:      { fontSize: 12, color: '#999', marginTop: 6 },
  error:     { background: '#FFF8F8', border: '1px solid #F7C1C1', borderRadius: 8, padding: '10px 14px', color: '#A32D2D', marginBottom: 16, fontSize: 13 },
  warn:      { background: '#FAEEDA', border: '1px solid #FAC775', borderRadius: 8, padding: '10px 14px', color: '#633806', marginBottom: 16, fontSize: 13 },
  success:   { background: '#F0FDF8', border: '1px solid #9FE1CB', borderRadius: 8, padding: '10px 14px', color: '#085041', marginBottom: 16, fontSize: 13 },
  submitBtn: { width: '100%', padding: 13, background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 },
  viewBtn:   { width: '100%', padding: 13, background: '#1d9e75', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 },
  infoBox:   { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 24 },
  infoTitle: { fontSize: 14, fontWeight: 600, marginBottom: 14 },
  infoStep:  { fontSize: 13, color: '#555', padding: '6px 0', borderBottom: '1px solid #f5f5f5' },
};
