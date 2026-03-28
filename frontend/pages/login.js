import { useState } from 'react';
import { useRouter } from 'next/router';

export default function Login() {
  const router = useRouter();
  const [id,      setId]      = useState('');
  const [pw,      setPw]      = useState('');
  const [logs,    setLogs]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [done,    setDone]    = useState(false);

  const w = (msg, type='info') => {
    const ts = new Date().toLocaleTimeString('en-SG', { hour12: false });
    setLogs(prev => [...prev, { ts, msg, type }]);
  };

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  const doLogin = async () => {
    if (!id || !pw) { w('ERROR: Singpass ID and password required.', 'err'); return; }
    setLoading(true);
    setLogs([]);

    w(`Initiating Singpass OIDC request for ${id.toUpperCase()}...`, 'info');
    await sleep(600);
    w('Connecting to SingpassMSP → peer0.singpass.trustid.com:10051', 'info');
    await sleep(700);
    w('TLS handshake complete. Certificate chain verified.', 'info');
    await sleep(500);
    w('Querying identityregistry chaincode for DID binding...', 'info');
    await sleep(900);

    const valid = /^[STFG]\d{7}[A-Z]$/i.test(id);

    if (valid) {
      w(`SingpassMSP: Identity record found on ledger.`, 'ok');
      await sleep(400);
      w(`MSP certificate APPROVED for ${id.toUpperCase()}.`, 'ok');
      await sleep(300);
      w(`Endorsement confirmed. DID: did:trustid:${id.toLowerCase()}.`, 'ok');
      await sleep(300);
      w('Session token issued. Redirecting to dashboard...', 'ok');
      setDone(true);
      sessionStorage.setItem('trustid_auth', id.toUpperCase());
      await sleep(1200);
      router.push('/');
    } else {
      w('SingpassMSP: Identity not found on ledger.', 'err');
      await sleep(300);
      w('ERROR: NRIC format invalid or DID not registered.', 'err');
      w('Tip: Use format S1234567A and register DID first.', 'warn');
      setLoading(false);
    }
  };

  const logColor = t => t === 'ok' ? '#4ade80' : t === 'err' ? '#f87171' : t === 'warn' ? '#fbbf24' : '#7dd3fc';

  return (
    <div style={s.page}>
      <div style={s.card}>
        {/* Singpass logo */}
        <div style={s.logoRow}>
          <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
            <circle cx="16" cy="16" r="15" fill="#E8192C"/>
            <rect x="14" y="6" width="4" height="11" rx="2" fill="white"/>
            <circle cx="16" cy="22" r="3" fill="white"/>
          </svg>
          <span style={s.logoText}>singpass</span>
        </div>

        <div style={s.heading}>Log in</div>

        <div style={s.label}>Singpass ID</div>
        <input
          style={s.input}
          type="text"
          placeholder="e.g. S1234567A"
          value={id}
          onChange={e => setId(e.target.value)}
          autoComplete="off"
        />

        <div style={s.label}>Password</div>
        <input
          style={s.input}
          type="password"
          placeholder="Enter password"
          value={pw}
          onChange={e => setPw(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !loading && doLogin()}
        />

        <button
          style={{ ...s.btn, background: done ? '#16a34a' : loading ? '#f0a0a6' : '#E8192C' }}
          onClick={doLogin}
          disabled={loading}
        >
          {done ? '✓ Authenticated' : loading ? 'Authenticating...' : 'Log in'}
        </button>

        <div style={s.forgot}>Forgot password?</div>

        {/* Activity log */}
        {logs.length > 0 && (
          <div style={s.logBox}>
            {logs.map((l, i) => (
              <div key={i} style={{ ...s.logLine, color: logColor(l.type) }}>
                [{l.ts}] {l.msg}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const s = {
  page:     { minHeight: '100vh', background: '#f5f5f5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'system-ui,sans-serif' },
  card:     { background: '#fff', borderRadius: 12, padding: '36px 40px', width: 380, boxShadow: '0 2px 16px rgba(0,0,0,0.08)' },
  logoRow:  { display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 },
  logoText: { fontSize: 26, fontWeight: 800, color: '#E8192C', letterSpacing: '-0.5px' },
  heading:  { fontSize: 22, fontWeight: 500, color: '#111', marginBottom: 22 },
  label:    { fontSize: 13, color: '#555', marginBottom: 5, marginTop: 14 },
  input:    { width: '100%', padding: '11px 13px', border: '1.5px solid #ddd', borderRadius: 6, fontSize: 15, outline: 'none', boxSizing: 'border-box' },
  btn:      { width: '100%', marginTop: 20, padding: 13, color: '#fff', border: 'none', borderRadius: 6, fontSize: 15, fontWeight: 600, cursor: 'pointer', transition: 'background 0.15s' },
  forgot:   { textAlign: 'center', marginTop: 12, fontSize: 13, color: '#E8192C', cursor: 'pointer' },
  logBox:   { marginTop: 16, background: '#0d1117', borderRadius: 8, padding: '10px 12px', maxHeight: 160, overflowY: 'auto' },
  logLine:  { fontFamily: 'monospace', fontSize: 11, marginBottom: 2, lineHeight: 1.5 },
};
