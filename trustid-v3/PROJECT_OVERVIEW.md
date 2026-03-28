# TrustID — Project Overview
### BAC2002 Blockchain & Cryptocurrency · SIT Team Project

---

## What is TrustID?

TrustID is a **decentralised behavioural identity DApp** built on Hyperledger Fabric. Its goal is to solve **synthetic identity fraud** — the problem where fraudsters create fake identities using stolen or fabricated documents to take out loans they never repay.

Traditional KYC (Know Your Customer) checks a document (e.g. NRIC, passport). A synthetic fraudster can pass document KYC because the document may be technically valid. TrustID instead asks: **"Has this identity demonstrated real behaviour over time, verified independently by multiple trusted organisations?"**

---

## How TrustID is Different from eKYC

Most eKYC systems (like the `uncle-gdev/eKYC` reference) store **document hashes** on-chain — a SHA256 of a PDF or image proves the document existed at a point in time. TrustID deliberately does NOT do this.

| Feature | Traditional eKYC | TrustID |
|---|---|---|
| What's stored | Hash of identity document | Behavioural claims (actions over time) |
| Who attests | Single KYC provider | 4 independent consortium orgs |
| Proof type | Document hash | BehaviouralAttestation-v1 proof chain |
| Fraud resistance | Fails against synthetic IDs with valid docs | Detects synthetic IDs via behaviour gaps |
| DID format | Random UUID or document-linked | `did:trustid:<org>:<fingerprint>` (org-scoped) |
| Trust source | Document validity | Multi-party on-chain behaviour history |

### TrustID's Distinctive DID Design

TrustID uses a **ProofChain** — an append-only log of cryptographic endorsements embedded in every DID Document. Each entry is:

```
SHA256(didID + claimType + claimValue + issuerMSP + txID)
```

This means each proof is:
- Tied to a **specific behaviour claim** (not a document)
- Signed by a **named MSP organisation** (not a generic issuer)
- Anchored to a **specific blockchain transaction** (immutable, auditable)
- Contributed by an **independent consortium member** (DBS, Grab, Singtel, or Singpass)

A synthetic identity cannot accumulate a convincing ProofChain because it would need to forge behaviour across 4 independent, uncoordinated organisations over time.

---

## The 4-Org Consortium

Each organisation runs its **own Hyperledger Fabric peer node** with its own **MSP (Membership Service Provider)** identity. They sign attestations independently — no single org can manufacture trust alone.

| Organisation | MSP ID | Port | Role |
|---|---|---|---|
| **Singpass** | SingpassMSP | 10051 | Government identity authority — simulates MyInfo OIDC national identity verification |
| **DBS Bank** | DBSMSP | 7051 | Financial institution — attests loan repayment history, savings behaviour |
| **Grab** | GrabMSP | 8051 | Platform economy — attests gig income, GrabPay activity |
| **Singtel** | SingtelMSP | 9051 | Telco operator — attests bill payment history, SIM KYC |

**Why 4 orgs matters:** The Fabric channel uses `MAJORITY Endorsement` policy, meaning any transaction must be endorsed by at least 3 of 4 peers. A single compromised organisation cannot write fraudulent state.

### Singpass Integration (Simulated)

In production, Singpass uses the [MyInfo OIDC flow](https://github.com/GovTechSG/singpass-myinfo-oidc-helper):
1. User authenticates via Singpass OIDC
2. Server retrieves verified MyInfo attributes (NRIC, name, address)
3. These attributes become behavioural claims on the TrustID ledger

For this POC, we simulate this: the Singpass peer (SingpassMSP) signs a `identity_verified` claim directly on-chain, using the same behavioural proof mechanism as other orgs. This is architecturally accurate — Singpass has its **own independent MSP and peer node**, not sharing infrastructure with DBS.

---

## How the DApp Works — End to End

### Step 1: User Registers a DID

The user visits `http://localhost:3000/register` and enters their name. The frontend calls `/api/identity/register`, which:
1. Generates a public key and DID in the format `did:trustid:<identifier>`
2. Calls `RegisterDID` on the `identityregistry` chaincode via DBS peer
3. The chaincode creates a W3C DID Document on-chain with a **genesis proof entry**
4. The DID is now anchored to the Hyperledger Fabric ledger permanently

### Step 2: Consortium Orgs Issue Verifiable Credentials

Each org visits the **Issuer Portal** (`/issuer`) and issues claims from their own MSP peer:
- **Singpass** signs: `identity_verified = singpass_myinfo_confirmed`
- **DBS** signs: `loan_repayment_12mo = perfect_repayment`
- **Grab** signs: `income_verified = SGD_3500_monthly`
- **Singtel** signs: `telco_bills_paid_24mo = on_time`

Each attestation:
- Calls `IssueCredential` chaincode function
- Appends a `BehaviouralAttestation-v1` proof to the DID's **ProofChain**
- Records which MSP signed it (auditable, immutable)
- Requires MAJORITY endorsement (3 of 4 peers must agree)

### Step 3: Oracle Reads Behaviour and Computes Trust Score

When "Trigger AI Score Update" is clicked:
1. The **oracle** (`oracle/oracle.js`) reads the DID's behaviour events and attestations from the ledger
2. It computes 6 behavioural features:
   - `repayment_rate` — loans repaid / loans issued
   - `did_age_days` — how old is the identity
   - `tx_per_day` — transaction frequency
   - `attestation_count` — how many independent orgs attested
   - `tx_interval_cv` — regularity of transactions (synthetic IDs are irregular)
   - `loan_to_repay_ratio` — total repaid / total borrowed
3. These features are sent to the **AI Scorer** (Python Flask on port 5001)
4. The scorer runs a Logistic Regression model (trained on synthetic vs real identity patterns) to compute a `fraud_probability`
5. Trust score = `(1 - fraud_probability) × 100`
6. The oracle calls `UpdateTrustScore` on-chain — the score is now part of the immutable DID Document

### Step 4: LenderDApp Auto-Approves Loans

The user visits `/loan`, enters their DID, and clicks "Check Eligibility":
1. Frontend calls `CheckEligibility` on the `lenderdapp` chaincode
2. Chaincode reads the DID's `behaviorScore` from `identityregistry`
3. Returns loan tier and maximum amount based on score:
   - **Prime (80-100):** 3.5% p.a., up to S$50,000
   - **Standard (65-79):** 6.0% p.a., up to S$20,000
   - **Subprime (50-64):** 9.5% p.a., up to S$8,000
   - **Rejected (<50):** Not eligible
4. User submits application → `ApplyForLoan` chaincode auto-approves or rejects based on score

---

## System Architecture

```
User Browser
     │
     ▼
Next.js Frontend (port 3000)
     │  REST API calls
     ▼
/api/identity/*  /api/issuer/*  /api/loan/*  /api/oracle/*
     │                                              │
     │  Fabric Gateway SDK (@hyperledger/fabric-gateway)
     │                                              │
     ▼                                              ▼
┌─────────────────────────────────────┐    Node.js Oracle
│      Hyperledger Fabric Network      │         │
│  trustid-channel                     │    Python Flask
│                                      │    AI Scorer (port 5001)
│  peer0.dbs.trustid.com:7051 (DBSMSP) │
│  peer0.grab.trustid.com:8051         │
│  peer0.singtel.trustid.com:9051      │
│  peer0.singpass.trustid.com:10051    │
│                                      │
│  orderer.trustid.com:7050 (etcdraft) │
│                                      │
│  Chaincode: identityregistry         │
│  Chaincode: lenderdapp               │
│                                      │
│  State DB: CouchDB (per peer)        │
└─────────────────────────────────────┘
```

---

## How to Deploy — Step by Step (For Beginners)

### What You Need
- Windows laptop with WSL2 Ubuntu installed
- Docker Desktop running
- Hyperledger Fabric 2.5 binaries at `~/fabric/bin/`
- Node.js 18+ and Python 3.9+ in WSL2

### Important: Always work in WSL2 native filesystem
Never run from `/mnt/c/...` — Docker Desktop cannot mount Windows paths reliably for Fabric crypto.

### Step 1: Copy project to WSL2 home
```bash
cp -r /mnt/c/Users/<you>/Downloads/trustid-v2 ~/trustid-v2
cd ~/trustid-v2
```

### Step 2: Add hostnames to /etc/hosts (one-time)
```bash
echo "127.0.0.1 orderer.trustid.com
127.0.0.1 peer0.dbs.trustid.com
127.0.0.1 peer0.grab.trustid.com
127.0.0.1 peer0.singtel.trustid.com
127.0.0.1 peer0.singpass.trustid.com" | sudo tee -a /etc/hosts
```

### Step 3: Start the Fabric network (script does everything)
```bash
bash scripts/1-start-network.sh
```
This script: generates crypto → creates channel block → starts 9 Docker containers → joins orderer → joins all 4 peers.

### Step 4: Deploy both chaincodes
```bash
bash scripts/2-deploy-chaincode.sh
```
This script: initialises Go modules → packages chaincodes → installs on all 4 peers → approves from all 4 orgs → commits.

### Step 5: Start backend services
```bash
bash scripts/3-start-services.sh
```
Starts: AI Scorer (Flask on :5001) → Oracle (Node.js) → Frontend (Next.js on :3000)

### Step 6: Seed demo data
```bash
bash scripts/4-demo-seed.sh
```
Seeds: alice (4 attestations, high score), bob (2 attestations, borderline), fraud1 (sparse, low score)

### Step 7: Open the app
Visit `http://localhost:3000` and search for `did:trustid:alice`

---

## Demo Flow for Presentation

1. **Register a new identity** → `/register` → enter name → click Register
2. **Issue attestations from each org** → `/issuer` → switch between Singpass, DBS, Grab, Singtel → issue claims
3. **Trigger AI scoring** → Dashboard → "Trigger AI Score Update" → watch score appear
4. **Apply for loan** → `/loan` → check eligibility → submit application → see auto-approval
5. **Compare fraud profile** → search `did:trustid:fraud1` → observe low score, rejection

---

## Key Files Reference

| File | Purpose |
|---|---|
| `network/configtx.yaml` | Defines 4 organisations and channel policy |
| `network/crypto-config.yaml` | Defines crypto identities for all 4 orgs |
| `network/docker-compose.yaml` | 9 Docker containers (orderer + 4 peers + 4 CouchDBs) |
| `chaincode/identityregistry/main.go` | W3C DID + VC + ProofChain chaincode |
| `chaincode/lenderdapp/main.go` | Auto loan approval chaincode |
| `ai-scorer/scorer.py` | Python Flask ML scoring service |
| `oracle/oracle.js` | Reads ledger → scores → writes back |
| `frontend/lib/fabric.js` | Fabric Gateway connections for all 4 orgs |
| `frontend/pages/issuer.js` | Issuer portal (4 independent org signers) |
| `scripts/1-start-network.sh` | Full network bootstrap |
| `scripts/2-deploy-chaincode.sh` | Chaincode lifecycle |
| `scripts/4-demo-seed.sh` | Demo data seeding |
