# TrustID — BAC2002 Team 5

Decentralised identity and behavioural fraud detection DApp built on Hyperledger Fabric.

## What this does

TrustID lets consortium members (Singpass, DBS, Grab, Singtel) register decentralised identities, issue verifiable credentials, and score users based on their on-chain behaviour using a Random Forest AI model. Loan eligibility is determined by the smart contract based on the trust score. All transactions require 3-of-4 peer endorsement.

## Prerequisites

- Ubuntu 22.04 / WSL2
- Docker + Docker Compose
- Go 1.21+
- Node.js 18+ and npm
- Python 3.10+ and pip
- Hyperledger Fabric 2.5 binaries in `~/fabric/bin`

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/enqi-dev/BAC2002-Team-Project-TrustID-Team5.git
cd BAC2002-Team-Project-TrustID-Team5
```

### 2. Install dependencies
```bash
# Frontend
cd frontend && npm install && cd ..

# Oracle
cd oracle && npm install && cd ..

# AI scorer
pip install flask scikit-learn imbalanced-learn pandas numpy --break-system-packages
```

### 3. Set environment variables
```bash
export PATH="$HOME/fabric/bin:$HOME/.local/bin:$PATH"
export FABRIC_CFG_PATH="$HOME/fabric/config"
export CORE_PEER_TLS_ENABLED=true
export ORDERER_CA=$(pwd)/network/organizations/ordererOrganizations/trustid.com/orderers/orderer.trustid.com/msp/tlscacerts/tlsca.trustid.com-cert.pem
export DBS_TLS=$(pwd)/network/organizations/peerOrganizations/dbs.trustid.com/peers/peer0.dbs.trustid.com/tls/ca.crt
export GRAB_TLS=$(pwd)/network/organizations/peerOrganizations/grab.trustid.com/peers/peer0.grab.trustid.com/tls/ca.crt
export SINGTEL_TLS=$(pwd)/network/organizations/peerOrganizations/singtel.trustid.com/peers/peer0.singtel.trustid.com/tls/ca.crt
export SINGPASS_TLS=$(pwd)/network/organizations/peerOrganizations/singpass.trustid.com/peers/peer0.singpass.trustid.com/tls/ca.crt
export CORE_PEER_LOCALMSPID="DBSMSP"
export CORE_PEER_ADDRESS="peer0.dbs.trustid.com:7051"
export CORE_PEER_TLS_ROOTCERT_FILE=$DBS_TLS
export CORE_PEER_MSPCONFIGPATH=$(pwd)/network/organizations/peerOrganizations/dbs.trustid.com/users/Admin@dbs.trustid.com/msp
```

### 4. Add DNS entries
```bash
echo "127.0.0.1 peer0.dbs.trustid.com peer0.grab.trustid.com peer0.singtel.trustid.com peer0.singpass.trustid.com orderer.trustid.com" | sudo tee -a /etc/hosts
```

### 5. Start the Docker network
```bash
cd network
docker-compose up -d
cd ..
```

Check all 9 containers are running (4 peers, 4 CouchDB, 1 orderer):
```bash
docker ps --format "table {{.Names}}\t{{.Status}}"
```

## Deploying the chaincodes

Both chaincodes (`identityregistry` and `lenderdapp`) are written in Go and deployed at sequence 2.

### Build
```bash
cd chaincode/identityregistry && go build ./... && cd ../..
cd chaincode/lenderdapp && go build ./... && cd ../..
```

### Package and install
```bash
peer lifecycle chaincode package /tmp/identityregistry.tar.gz \
  --path chaincode/identityregistry --lang golang --label identityregistry_v2

peer lifecycle chaincode install /tmp/identityregistry.tar.gz
```

Repeat the install step for each org by switching the `CORE_PEER_*` environment variables to point at each peer (Grab port 8051, Singtel port 9051, Singpass port 10051).

### Approve and commit
```bash
PKGID=$(peer lifecycle chaincode queryinstalled 2>&1 | grep identityregistry_v2 | awk '{print $3}' | tr -d ',')

# Run for each org
peer lifecycle chaincode approveformyorg \
  -o orderer.trustid.com:7050 --ordererTLSHostnameOverride orderer.trustid.com \
  --channelID trustid-channel --name identityregistry --version 2.0 \
  --package-id "$PKGID" --sequence 2 --tls --cafile "$ORDERER_CA"

# Commit once all 4 orgs have approved
peer lifecycle chaincode commit \
  -o orderer.trustid.com:7050 --ordererTLSHostnameOverride orderer.trustid.com \
  --channelID trustid-channel --name identityregistry --version 2.0 --sequence 2 \
  --tls --cafile "$ORDERER_CA" \
  --peerAddresses peer0.dbs.trustid.com:7051      --tlsRootCertFiles $DBS_TLS \
  --peerAddresses peer0.grab.trustid.com:8051     --tlsRootCertFiles $GRAB_TLS \
  --peerAddresses peer0.singtel.trustid.com:9051  --tlsRootCertFiles $SINGTEL_TLS \
  --peerAddresses peer0.singpass.trustid.com:10051 --tlsRootCertFiles $SINGPASS_TLS
```

Repeat the same steps for `lenderdapp`.

Verify both are committed:
```bash
peer lifecycle chaincode querycommitted -C trustid-channel
```

## Starting the services

### AI scorer

Download `creditcard.csv` from Kaggle (Credit Card Fraud Detection dataset) and update the path in `ai-scorer/scorer.py` if needed. Then:
```bash
python3 ai-scorer/scorer.py > logs/scorer.log 2>&1 &
curl http://localhost:5001/health
```

### Frontend
```bash
mkdir -p frontend/logs
touch frontend/logs/activity.log
chmod 666 frontend/logs/activity.log
cd frontend && npm run dev > ../logs/frontend.log 2>&1 &
cd ..
```

Open http://localhost:3000

### Oracle

The oracle reads behaviour events from the ledger and calls the AI scorer.
```bash
# Score a specific DID
node oracle/oracle.js score did:trustid:alice

# Run a training round (commits model metrics on-chain)
node oracle/oracle.js train round-kaggle-1
```

## Smart contracts

### identityregistry

| Function | Description |
|---|---|
| RegisterDID | Creates a W3C DID document on-chain |
| GetDID | Queries a DID document |
| IssueCredential | Issues a verifiable credential |
| GetProofChain | Returns the SHA-256 linked attestation chain |
| UpdateTrustScore | Updates the behavioural trust score (requires 3-of-4 endorsement) |
| LogBehaviorEvent | Records a loan or transfer event |
| StartTrainingRound | Initiates a federated AI training round on-chain |
| LogModelMetrics | Commits model performance metrics to the ledger |
| GetModelMetrics | Queries committed model metrics |
| LogVerification | Appends a scoring event to the audit trail |
| GetVerificationHistory | Returns the full verification history for a DID |

### lenderdapp

| Function | Description |
|---|---|
| CheckEligibility | Returns loan eligibility based on trust score |
| ApplyForLoan | Submits a loan application |
| RepayLoan | Records a repayment |
| GetLoan | Queries a loan record |

## Project structure
```
trustid-v2/
├── chaincode/
│   ├── identityregistry/   # DID registry and trust scoring (Go)
│   └── lenderdapp/         # Loan eligibility (Go)
├── network/                # Docker compose and crypto material
├── frontend/               # Next.js 14 frontend
├── oracle/                 # Node.js scoring oracle
├── ai-scorer/              # Python Flask + Random Forest models
└── scripts/                # Deployment helper scripts
```

## Consortium

- **SingpassMSP** — identity issuer (port 10051)
- **DBSMSP** — anchor peer and lender (port 7051)
- **GrabMSP** — behaviour attestor (port 8051)
- **SingtelMSP** — behaviour attestor (port 9051)

Endorsement policy: MAJORITY (3 of 4 peers must sign every transaction)
