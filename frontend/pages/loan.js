import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';

export default function Loan() {
  const router = useRouter();
  const [didID,    setDidID]    = useState('');
  const [elig,     setElig]     = useState(null);
  const [amount,   setAmount]   = useState('');
  const [term,     setTerm]     = useState('12');
  const [loading,  setLoading]  = useState(false);
  const [checking, setChecking] = useState(false);
  const [result,   setResult]   = useState(null);
  const [error,    setError]    = useState('');

  useEffect(() => {
    if (router.query.did) {
      setDidID(router.query.did);
      checkEligibility(router.query.did);
    }
  }, [router.query.did]);

  const checkEligibility = async (id) => {
    const target = id || didID;
    if (!target) return;
    setChecking(true); setError(''); setElig(null); setResult(null);
    try {
      const r = await fetch(`/api/loan/eligibility?action=eligibility&did=${encodeURIComponent(target)}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setElig(d);
    } catch(e) { setError(e.message); }
    finally { setChecking(false); }
  };

  const apply = async () => {
    if (!elig?.eligible) return;
    if (!amount || isNaN(amount) || +amount <= 0) return setError('Enter a valid loan amount');
    if (+amount > elig.maxAmountSGD) return setError(`Max loan for your tier is S$${elig.maxAmountSGD.toLocaleString()}`);
    setLoading(true); setError('');
    const loanID = `LOAN-${Date.now()}`;
    try {
      const r = await fetch('/api/loan/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ loanID, applicantDID: didID, amountSGD: +amount, termMonths: +term })
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setResult(d);
    } catch(e) { setError(e.message); }
    finally { setLoading(false); }
  };

  const monthly = elig && amount ? calcMonthly(+amount, elig.interestRate, +term) : 0;

  const tierColor = t => t === 'Prime' ? '#1d9e75' : t === 'Standard' ? '#f5a623' : t === 'Subprime' ? '#e05c2a' : '#e24b4a';

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
        <h1 style={S.h1}>Apply for Loan</h1>
        <p style={S.sub}>Loan terms set automatically from your trust score. No documents needed.</p>

        {/* DID input */}
        <div style={S.card}>
          <div style={S.field}>
            <label style={S.label}>Your DID</label>
            <div style={{ display: 'flex', gap: 10 }}>
              <input value={didID} onChange={e => setDidID(e.target.value)}
                placeholder="did:trustid:alice" style={{ ...S.input, flex: 1 }} />
              <button onClick={() => checkEligibility()} style={S.checkBtn} disabled={checking}>
                {checking ? 'Checking...' : 'Check Eligibility'}
              </button>
            </div>
          </div>

          {error && <div style={S.error}>{error}</div>}

          {/* Eligibility result */}
          {elig && !result && (
            <>
              <div style={S.eligHeader}>
                <span style={{ fontSize: 14, fontWeight: 600 }}>Eligibility Result</span>
                <span style={{ fontSize: 13, color: tierColor(elig.tier), fontWeight: 600 }}>
                  Score: {elig.behaviorScore}/100 — {elig.tier}
                </span>
              </div>

              {elig.eligible ? (
                <>
                  <div style={S.eligGrid}>
                    <div style={S.eligBox}><div style={S.eligVal}>{elig.interestRate}%</div><div style={S.eligLabel}>Interest p.a.</div></div>
                    <div style={S.eligBox}><div style={S.eligVal}>S${elig.maxAmountSGD?.toLocaleString()}</div><div style={S.eligLabel}>Max Loan</div></div>
                    <div style={S.eligBox}><div style={{ ...S.eligVal, color: tierColor(elig.tier) }}>{elig.tier}</div><div style={S.eligLabel}>Tier</div></div>
                  </div>

                  <div style={S.loanForm}>
                    <div style={S.fieldRow}>
                      <div style={{ flex: 1 }}>
                        <label style={S.label}>Loan Amount (SGD)</label>
                        <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
                          placeholder="e.g. 10000" min="100" max={elig.maxAmountSGD} style={S.input} />
                      </div>
                      <div style={{ flex: 1 }}>
                        <label style={S.label}>Loan Term</label>
                        <select value={term} onChange={e => setTerm(e.target.value)} style={S.select}>
                          {[6,12,24,36].map(m => <option key={m} value={m}>{m} months</option>)}
                        </select>
                      </div>
                    </div>
                    {amount && monthly > 0 && (
                      <div style={S.calc}>
                        Estimated monthly payment: <strong>S${monthly.toFixed(2)}</strong>
                        &nbsp;·&nbsp; Total repayment: <strong>S${(monthly * +term).toFixed(2)}</strong>
                      </div>
                    )}
                    <button onClick={apply} disabled={loading} style={S.submitBtn}>
                      {loading ? 'Processing on Blockchain...' : 'Submit Loan Application'}
                    </button>
                  </div>
                </>
              ) : (
                <div style={S.notElig}>
                  Trust score {elig.behaviorScore}/100 is below the minimum threshold.
                  <br/>Build more on-chain history and get your score updated.
                  <Link href={`/?did=${didID}`} style={S.goBack}>View your identity →</Link>
                </div>
              )}
            </>
          )}

          {/* Loan result */}
          {result && (
            <div style={{ ...S.resultBox, borderColor: result.status === 'APPROVED' ? '#9FE1CB' : '#F7C1C1', background: result.status === 'APPROVED' ? '#F0FDF8' : '#FFF8F8' }}>
              <div style={{ fontSize: 22, fontWeight: 700, color: result.status === 'APPROVED' ? '#085041' : '#A32D2D', marginBottom: 12 }}>
                {result.status === 'APPROVED' ? '✓ Loan Approved' : '✗ Loan Rejected'}
              </div>
              {result.status === 'APPROVED' ? (
                <>
                  <div style={S.resultGrid}>
                    <div style={S.resultItem}><div style={S.rVal}>S${result.amountSGD?.toLocaleString()}</div><div style={S.rLabel}>Amount</div></div>
                    <div style={S.resultItem}><div style={S.rVal}>{result.interestRate}%</div><div style={S.rLabel}>Interest</div></div>
                    <div style={S.resultItem}><div style={S.rVal}>{result.termMonths}mo</div><div style={S.rLabel}>Term</div></div>
                    <div style={S.resultItem}><div style={S.rVal}>S${result.monthlyPayment?.toFixed(2)}</div><div style={S.rLabel}>Monthly</div></div>
                  </div>
                  <div style={{ fontSize: 12, color: '#666', marginTop: 12 }}>Loan ID: {result.id}</div>
                  <div style={{ marginTop: 16, padding: '14px 18px', background: '#0f172a', borderRadius: 8, display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span style={{ fontSize: 20 }}>🏦</span>
                    <div>
                      <div style={{ fontSize: 13, color: '#4ade80', fontWeight: 600 }}>SGD {result.amountSGD?.toLocaleString()}.00 disbursed</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>Transferred to account ending 4521 · {new Date().toLocaleString('en-SG')}</div>
                      <div style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>Loan committed to Hyperledger Fabric · Block endorsed by DBS · Grab · Singtel</div>
                    </div>
                  </div>
                </>
              ) : (
                <div style={{ fontSize: 14, color: '#A32D2D' }}>{result.rejectionReason}</div>
              )}
            </div>
          )}
        </div>

        {/* Tier table */}
        <div style={S.tierCard}>
          <div style={S.tierTitle}>Loan Tiers by Trust Score</div>
          {[
            { tier: 'Prime',    range: '80–100', rate: '3.5%',  max: 'S$50,000' },
            { tier: 'Standard', range: '65–79',  rate: '6.0%',  max: 'S$20,000' },
            { tier: 'Subprime', range: '50–64',  rate: '9.5%',  max: 'S$8,000'  },
            { tier: 'Rejected', range: '0–49',   rate: '—',     max: 'Not eligible' },
          ].map(r => (
            <div key={r.tier} style={S.tierRow}>
              <span style={{ ...S.tierName, color: tierColor(r.tier) }}>{r.tier}</span>
              <span style={S.tierCell}>Score {r.range}</span>
              <span style={S.tierCell}>{r.rate} p.a.</span>
              <span style={S.tierCell}>{r.max}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function calcMonthly(p, r, n) {
  if (!r || !p || !n) return 0;
  const mr = r/100/12;
  return p * mr * Math.pow(1+mr,n) / (Math.pow(1+mr,n)-1);
}

const S = {
  page:       { fontFamily:'system-ui,sans-serif', minHeight:'100vh', background:'#fafafa' },
  nav:        { display:'flex', alignItems:'center', justifyContent:'space-between', padding:'0 32px', height:56, background:'#fff', borderBottom:'1px solid #eee' },
  logo:       { fontSize:18, fontWeight:700, textDecoration:'none', color:'#111' },
  navLinks:   { display:'flex', gap:24 },
  navLink:    { fontSize:14, color:'#444', textDecoration:'none' },
  container:  { maxWidth:700, margin:'0 auto', padding:'40px 20px' },
  h1:         { fontSize:28, fontWeight:700, margin:'0 0 8px' },
  sub:        { color:'#666', fontSize:15, marginBottom:28 },
  card:       { background:'#fff', border:'1px solid #eee', borderRadius:12, padding:28, marginBottom:20 },
  field:      { marginBottom:18 },
  fieldRow:   { display:'flex', gap:16, marginBottom:16 },
  label:      { display:'block', fontSize:13, fontWeight:500, marginBottom:6 },
  input:      { width:'100%', padding:'10px 14px', border:'1px solid #ddd', borderRadius:8, fontSize:14, outline:'none', boxSizing:'border-box' },
  select:     { width:'100%', padding:'10px 14px', border:'1px solid #ddd', borderRadius:8, fontSize:14, outline:'none', background:'#fff' },
  checkBtn:   { padding:'10px 18px', background:'#111', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:13, whiteSpace:'nowrap' },
  error:      { background:'#FFF8F8', border:'1px solid #F7C1C1', borderRadius:8, padding:'10px 14px', color:'#A32D2D', marginBottom:16, fontSize:13 },
  eligHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 },
  eligGrid:   { display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 },
  eligBox:    { background:'#f9f9f9', borderRadius:8, padding:'14px 16px', textAlign:'center' },
  eligVal:    { fontSize:20, fontWeight:600, marginBottom:4 },
  eligLabel:  { fontSize:11, color:'#999' },
  loanForm:   { borderTop:'1px solid #f0f0f0', paddingTop:20 },
  calc:       { fontSize:13, color:'#555', marginBottom:16, padding:'10px 14px', background:'#f9f9f9', borderRadius:8 },
  submitBtn:  { width:'100%', padding:13, background:'#111', color:'#fff', border:'none', borderRadius:8, cursor:'pointer', fontSize:14, fontWeight:500 },
  notElig:    { background:'#FFF8F8', borderRadius:8, padding:'16px', color:'#A32D2D', fontSize:14 },
  goBack:     { display:'block', marginTop:10, color:'#A32D2D', fontSize:13 },
  resultBox:  { border:'2px solid', borderRadius:12, padding:24, marginTop:20 },
  resultGrid: { display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12 },
  resultItem: { textAlign:'center' },
  rVal:       { fontSize:18, fontWeight:600, marginBottom:4 },
  rLabel:     { fontSize:11, color:'#666' },
  tierCard:   { background:'#fff', border:'1px solid #eee', borderRadius:12, padding:24 },
  tierTitle:  { fontSize:14, fontWeight:600, marginBottom:14 },
  tierRow:    { display:'flex', gap:16, padding:'10px 0', borderBottom:'1px solid #f5f5f5', alignItems:'center' },
  tierName:   { fontWeight:600, fontSize:13, minWidth:80 },
  tierCell:   { fontSize:13, color:'#555', flex:1 },
};
