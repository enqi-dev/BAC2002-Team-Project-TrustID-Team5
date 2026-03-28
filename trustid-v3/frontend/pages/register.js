import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Register() {
  const router = useRouter();
  const [owner,   setOwner]   = useState('');
  const [didID,   setDidID]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [success, setSuccess] = useState('');

  const autoGen = () => {
    const slug = owner.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '') || 'user';
    setDidID(`did:trustid:${slug}-${Date.now().toString(36)}`);
  };

  const register = async () => {
    if (!owner || !didID) return setError('Fill in both fields');
    setLoading(true); setError(''); setSuccess('');
    try {
      // Step 1 — Register DID on Fabric
      const r = await fetch('/api/identity/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ didID, owner, publicKeyMultibase: 'z6Mk' + Math.random().toString(36).slice(2,18) })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);

      // Step 2 — Auto-issue Singpass KYC attestation (simulated for POC)
      await fetch('/api/issuer/attest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          didID,
          claimType:  'singpass_kyc',
          claimValue: 'identity_verified',
          org:        'dbs'   // DBS org signs on behalf of Singpass for POC
        })
      });

      setSuccess(`DID registered + Singpass KYC verified: ${didID}`);
      setTimeout(() => router.push(`/?did=${encodeURIComponent(didID)}`), 2000);
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
        </div>
      </nav>
      <div style={S.container}>
        <h1 style={S.h1}>Register Decentralized Identity</h1>
        <p style={S.sub}>Create your on-chain DID. Once registered, issuers can start attesting your credentials.</p>

        <div style={S.card}>
          <div style={S.field}>
            <label style={S.label}>Full Name</label>
            <input value={owner} onChange={e => setOwner(e.target.value)}
              placeholder="e.g. Alice Tan" style={S.input} />
          </div>
          <div style={S.field}>
            <label style={S.label}>DID (Decentralized Identifier)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={didID} onChange={e => setDidID(e.target.value)}
                placeholder="did:trustid:..." style={{ ...S.input, flex: 1 }} />
              <button onClick={autoGen} style={S.genBtn}>Auto-generate</button>
            </div>
            <div style={S.hint}>Format: did:trustid:&lt;your-identifier&gt;</div>
          </div>

          {error   && <div style={S.error}>{error}</div>}
          {success && <div style={S.success}>{success} — redirecting...</div>}

          <button onClick={register} disabled={loading} style={S.submitBtn}>
            {loading ? 'Registering on Fabric...' : 'Register DID on Blockchain'}
          </button>
        </div>

        <div style={S.infoBox}>
          <div style={S.infoTitle}>What happens after registration?</div>
          <div style={S.infoStep}>1. Your DID is written to the Hyperledger Fabric ledger</div>
          <div style={S.infoStep}>2. Issuers (DBS, Grab, Singtel) can attest your credentials</div>
          <div style={S.infoStep}>3. The AI oracle scores your behavioral identity</div>
          <div style={S.infoStep}>4. Apply for loans — no documents needed</div>
        </div>
      </div>
    </div>
  );
}

const S = {
  page:      { fontFamily: 'system-ui,sans-serif', minHeight: '100vh', background: '#fafafa' },
  nav:       { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 32px', height: 56, background: '#fff', borderBottom: '1px solid #eee' },
  logo:      { fontSize: 18, fontWeight: 700, textDecoration: 'none', color: '#111' },
  navLinks:  { display: 'flex', gap: 24 },
  navLink:   { fontSize: 14, color: '#444', textDecoration: 'none' },
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
  success:   { background: '#F0FDF8', border: '1px solid #9FE1CB', borderRadius: 8, padding: '10px 14px', color: '#085041', marginBottom: 16, fontSize: 13 },
  submitBtn: { width: '100%', padding: 13, background: '#111', color: '#fff', border: 'none', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 },
  infoBox:   { background: '#fff', border: '1px solid #eee', borderRadius: 12, padding: 24 },
  infoTitle: { fontSize: 14, fontWeight: 600, marginBottom: 14 },
  infoStep:  { fontSize: 13, color: '#555', padding: '6px 0', borderBottom: '1px solid #f5f5f5' },
};
