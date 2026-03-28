#!/bin/bash
# ============================================================
# Demo seed: alice (high trust), bob (borderline), fraud1 (synthetic)
# Uses all 4 independent orgs for attestations
# ============================================================
cd "$(dirname "$0")/.."

export PATH="$HOME/fabric/bin:$PATH"
export CORE_PEER_TLS_ENABLED=true
export ORDERER_CA="$(pwd)/network/organizations/ordererOrganizations/trustid.com/orderers/orderer.trustid.com/msp/tlscacerts/tlsca.trustid.com-cert.pem"

DBS_TLS="$(pwd)/network/organizations/peerOrganizations/dbs.trustid.com/peers/peer0.dbs.trustid.com/tls/ca.crt"
GRAB_TLS="$(pwd)/network/organizations/peerOrganizations/grab.trustid.com/peers/peer0.grab.trustid.com/tls/ca.crt"
SINGTEL_TLS="$(pwd)/network/organizations/peerOrganizations/singtel.trustid.com/peers/peer0.singtel.trustid.com/tls/ca.crt"
SINGPASS_TLS="$(pwd)/network/organizations/peerOrganizations/singpass.trustid.com/peers/peer0.singpass.trustid.com/tls/ca.crt"

set_dbs()      { export CORE_PEER_LOCALMSPID="DBSMSP";      export CORE_PEER_ADDRESS="peer0.dbs.trustid.com:7051";       export CORE_PEER_TLS_ROOTCERT_FILE="$DBS_TLS";      export CORE_PEER_MSPCONFIGPATH="$(pwd)/network/organizations/peerOrganizations/dbs.trustid.com/users/Admin@dbs.trustid.com/msp"; }
set_grab()     { export CORE_PEER_LOCALMSPID="GrabMSP";     export CORE_PEER_ADDRESS="peer0.grab.trustid.com:8051";      export CORE_PEER_TLS_ROOTCERT_FILE="$GRAB_TLS";     export CORE_PEER_MSPCONFIGPATH="$(pwd)/network/organizations/peerOrganizations/grab.trustid.com/users/Admin@grab.trustid.com/msp"; }
set_singtel()  { export CORE_PEER_LOCALMSPID="SingtelMSP";  export CORE_PEER_ADDRESS="peer0.singtel.trustid.com:9051";   export CORE_PEER_TLS_ROOTCERT_FILE="$SINGTEL_TLS";  export CORE_PEER_MSPCONFIGPATH="$(pwd)/network/organizations/peerOrganizations/singtel.trustid.com/users/Admin@singtel.trustid.com/msp"; }
set_singpass() { export CORE_PEER_LOCALMSPID="SingpassMSP"; export CORE_PEER_ADDRESS="peer0.singpass.trustid.com:10051"; export CORE_PEER_TLS_ROOTCERT_FILE="$SINGPASS_TLS"; export CORE_PEER_MSPCONFIGPATH="$(pwd)/network/organizations/peerOrganizations/singpass.trustid.com/users/Admin@singpass.trustid.com/msp"; }

# invoke: sends to DBS+Grab (2 endorsers for MAJORITY policy)
invoke() {
  set_dbs
  peer chaincode invoke -o orderer.trustid.com:7050 --ordererTLSHostnameOverride orderer.trustid.com \
    --tls --cafile "$ORDERER_CA" -C trustid-channel -n "$1" \
    --peerAddresses peer0.dbs.trustid.com:7051  --tlsRootCertFiles "$DBS_TLS" \
    --peerAddresses peer0.grab.trustid.com:8051 --tlsRootCertFiles "$GRAB_TLS" \
    -c "$2" 2>/dev/null && sleep 1
}

invoke_as() {
  local ORG=$1; local CC=$2; local ARGS=$3
  set_${ORG}
  local PEER_ADDR PEER_TLS PEER2_ADDR PEER2_TLS
  case $ORG in
    dbs)      PEER_ADDR="peer0.dbs.trustid.com:7051";       PEER_TLS="$DBS_TLS";      PEER2_ADDR="peer0.grab.trustid.com:8051";     PEER2_TLS="$GRAB_TLS" ;;
    grab)     PEER_ADDR="peer0.grab.trustid.com:8051";      PEER_TLS="$GRAB_TLS";     PEER2_ADDR="peer0.dbs.trustid.com:7051";      PEER2_TLS="$DBS_TLS" ;;
    singtel)  PEER_ADDR="peer0.singtel.trustid.com:9051";   PEER_TLS="$SINGTEL_TLS";  PEER2_ADDR="peer0.dbs.trustid.com:7051";      PEER2_TLS="$DBS_TLS" ;;
    singpass) PEER_ADDR="peer0.singpass.trustid.com:10051"; PEER_TLS="$SINGPASS_TLS"; PEER2_ADDR="peer0.dbs.trustid.com:7051";      PEER2_TLS="$DBS_TLS" ;;
  esac
  peer chaincode invoke -o orderer.trustid.com:7050 --ordererTLSHostnameOverride orderer.trustid.com \
    --tls --cafile "$ORDERER_CA" -C trustid-channel -n "$CC" \
    --peerAddresses "$PEER_ADDR"  --tlsRootCertFiles "$PEER_TLS" \
    --peerAddresses "$PEER2_ADDR" --tlsRootCertFiles "$PEER2_TLS" \
    -c "$ARGS" 2>/dev/null && sleep 1
}

GREEN='\033[0;32m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
step() { echo -e "\n${BLUE}▶ $1${NC}"; }

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║  TrustID — Seeding Demo Data (4-Org Consortium)      ║"
echo "╚═══════════════════════════════════════════════════════╝"

# Register DIDs
step "Registering DIDs..."
invoke identityregistry '{"function":"RegisterDID","Args":["did:trustid:alice","Alice Tan","z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK"]}'
ok "did:trustid:alice (high-trust human)"
invoke identityregistry '{"function":"RegisterDID","Args":["did:trustid:bob","Bob Lee","z6MkhbZ8DvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK2"]}'
ok "did:trustid:bob (borderline)"
invoke identityregistry '{"function":"RegisterDID","Args":["did:trustid:fraud1","Fraudster","z6MkfraudDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK3"]}'
ok "did:trustid:fraud1 (synthetic identity)"

# Alice — attested by all 4 independent orgs
step "Singpass attesting Alice (via SingpassMSP — independent peer)..."
invoke_as singpass identityregistry '{"function":"IssueCredential","Args":["did:trustid:alice","identity_verified","singpass_myinfo_confirmed","2027-12-31","sp_proof_alice"]}'
ok "Singpass → Alice: identity verified (SingpassMSP signed)"

step "DBS attesting Alice..."
invoke_as dbs identityregistry '{"function":"IssueCredential","Args":["did:trustid:alice","loan_repayment_12mo","perfect_repayment","2027-12-31","dbs_proof_alice"]}'
ok "DBS → Alice: 12 months perfect repayment (DBSMSP signed)"

step "Grab attesting Alice..."
invoke_as grab identityregistry '{"function":"IssueCredential","Args":["did:trustid:alice","income_verified","SGD_3500_monthly","2027-12-31","grab_proof_alice"]}'
ok "Grab → Alice: SGD 3500/month income (GrabMSP signed)"

step "Singtel attesting Alice..."
invoke_as singtel identityregistry '{"function":"IssueCredential","Args":["did:trustid:alice","telco_bills_paid_24mo","on_time","2027-12-31","singtel_proof_alice"]}'
ok "Singtel → Alice: 24 months on-time bills (SingtelMSP signed)"

# Alice behavior events
step "Logging Alice behavior history..."
invoke_as dbs identityregistry '{"function":"LogBehaviorEvent","Args":["did:trustid:alice","loan_issued","5000"]}'
invoke_as dbs identityregistry '{"function":"LogBehaviorEvent","Args":["did:trustid:alice","loan_repaid","5000"]}'
invoke_as dbs identityregistry '{"function":"LogBehaviorEvent","Args":["did:trustid:alice","loan_issued","3000"]}'
invoke_as dbs identityregistry '{"function":"LogBehaviorEvent","Args":["did:trustid:alice","loan_repaid","3000"]}'
invoke_as grab identityregistry '{"function":"LogBehaviorEvent","Args":["did:trustid:alice","transfer","500"]}'
ok "Alice: 2 loans repaid, transfers logged"

# Bob — attested by 2 orgs only
step "Seeding Bob (2 attestations — borderline)..."
invoke_as singpass identityregistry '{"function":"IssueCredential","Args":["did:trustid:bob","identity_verified","singpass_basic","2027-12-31","sp_proof_bob"]}'
invoke_as dbs identityregistry '{"function":"IssueCredential","Args":["did:trustid:bob","account_verified","active","2027-12-31","dbs_proof_bob"]}'
invoke_as dbs identityregistry '{"function":"LogBehaviorEvent","Args":["did:trustid:bob","loan_issued","2000"]}'
ok "Bob: 2 attestations, 1 loan (borderline score expected)"

# Fraud1 — only 1 attestation, no history
step "Seeding fraud1 (1 attestation, minimal history — low score expected)..."
invoke_as singpass identityregistry '{"function":"IssueCredential","Args":["did:trustid:fraud1","identity_verified","unverified_submission","2027-12-31","sp_proof_fraud"]}'
ok "fraud1: sparse profile seeded"

echo ""
echo "╔═══════════════════════════════════════════════════════╗"
echo "║  Demo data seeded!                                    ║"
echo "║  Open: http://localhost:3000                          ║"
echo "║  Try:  did:trustid:alice  (should score ~85+)        ║"
echo "║        did:trustid:fraud1 (should score <40)         ║"
echo "╚═══════════════════════════════════════════════════════╝"
