#!/bin/bash
# ============================================================
# TrustID — Restart Script
# Run this every time you reopen your laptop
# Usage: bash restart.sh
# ============================================================
set -e

export PATH="$HOME/fabric/bin:$PATH"
export FABRIC_CFG_PATH=$HOME/fabric/config

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }

BASE="$(cd "$(dirname "$0")" && pwd)"
cd "$BASE"

export ORDERER_CA="$BASE/network/organizations/ordererOrganizations/trustid.com/orderers/orderer.trustid.com/msp/tlscacerts/tlsca.trustid.com-cert.pem"
export CORE_PEER_TLS_ENABLED=true

PKGID_IR="identityregistry_1:1947506e2b8eab59ca2c46f662414e72c877923b44a94204c422a9a037004d60"
PKGID_LD="lenderdapp_1:8366dccd853cb23e1daa0a7eb292d6f74d976e1add9fd5242d74823fa511aeea"

set_dbs() {
  export CORE_PEER_LOCALMSPID="DBSMSP"
  export CORE_PEER_ADDRESS=peer0.dbs.trustid.com:7051
  export CORE_PEER_TLS_ROOTCERT_FILE="$BASE/network/organizations/peerOrganizations/dbs.trustid.com/peers/peer0.dbs.trustid.com/tls/ca.crt"
  export CORE_PEER_MSPCONFIGPATH="$BASE/network/organizations/peerOrganizations/dbs.trustid.com/users/Admin@dbs.trustid.com/msp"
}
set_grab() {
  export CORE_PEER_LOCALMSPID="GrabMSP"
  export CORE_PEER_ADDRESS=peer0.grab.trustid.com:8051
  export CORE_PEER_TLS_ROOTCERT_FILE="$BASE/network/organizations/peerOrganizations/grab.trustid.com/peers/peer0.grab.trustid.com/tls/ca.crt"
  export CORE_PEER_MSPCONFIGPATH="$BASE/network/organizations/peerOrganizations/grab.trustid.com/users/Admin@grab.trustid.com/msp"
}
set_singtel() {
  export CORE_PEER_LOCALMSPID="SingtelMSP"
  export CORE_PEER_ADDRESS=peer0.singtel.trustid.com:9051
  export CORE_PEER_TLS_ROOTCERT_FILE="$BASE/network/organizations/peerOrganizations/singtel.trustid.com/peers/peer0.singtel.trustid.com/tls/ca.crt"
  export CORE_PEER_MSPCONFIGPATH="$BASE/network/organizations/peerOrganizations/singtel.trustid.com/users/Admin@singtel.trustid.com/msp"
}

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  TrustID — Restart                           ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Step 1: Start Docker containers ──────────────────────────
echo "▶ Step 1: Starting Docker containers..."
cd network
docker-compose up -d
cd ..
echo "  Waiting 15 seconds for containers to stabilize..."
sleep 15
ok "Containers started"

# ── Step 2: Rejoin orderer ────────────────────────────────────
echo ""
echo "▶ Step 2: Rejoining orderer to channel..."
osnadmin channel join \
  --channelID trustid-channel \
  --config-block ./network/channel-artifacts/trustid-channel.block \
  -o orderer.trustid.com:7053 \
  --ca-file "$ORDERER_CA" \
  --client-cert ./network/organizations/ordererOrganizations/trustid.com/orderers/orderer.trustid.com/tls/server.crt \
  --client-key ./network/organizations/ordererOrganizations/trustid.com/orderers/orderer.trustid.com/tls/server.key \
  2>/dev/null && ok "Orderer joined" || warn "Orderer already joined (ok)"

# ── Step 3: Rejoin peers ──────────────────────────────────────
echo ""
echo "▶ Step 3: Rejoining peers to channel..."
set_dbs;    peer channel join -b ./network/channel-artifacts/trustid-channel.block 2>/dev/null && ok "DBS peer joined"    || warn "DBS already joined (ok)"
set_grab;   peer channel join -b ./network/channel-artifacts/trustid-channel.block 2>/dev/null && ok "Grab peer joined"   || warn "Grab already joined (ok)"
set_singtel; peer channel join -b ./network/channel-artifacts/trustid-channel.block 2>/dev/null && ok "Singtel peer joined" || warn "Singtel already joined (ok)"

# ── Step 4: Reinstall chaincodes ─────────────────────────────
echo ""
echo "▶ Step 4: Reinstalling chaincodes..."

for CC in identityregistry lenderdapp; do
  set_dbs;    peer lifecycle chaincode install ${CC}.tar.gz 2>/dev/null || true
  set_grab;   peer lifecycle chaincode install ${CC}.tar.gz 2>/dev/null || true
  set_singtel; peer lifecycle chaincode install ${CC}.tar.gz 2>/dev/null || true
done
ok "Chaincodes reinstalled"

# ── Step 5: Approve chaincodes ───────────────────────────────
echo ""
echo "▶ Step 5: Approving chaincodes..."

for ORG in dbs grab singtel; do
  set_${ORG}
  peer lifecycle chaincode approveformyorg \
    -o orderer.trustid.com:7050 --ordererTLSHostnameOverride orderer.trustid.com \
    --channelID trustid-channel --name identityregistry --version 1.0 \
    --package-id "$PKGID_IR" --sequence 1 --tls --cafile "$ORDERER_CA" 2>/dev/null || true

  peer lifecycle chaincode approveformyorg \
    -o orderer.trustid.com:7050 --ordererTLSHostnameOverride orderer.trustid.com \
    --channelID trustid-channel --name lenderdapp --version 1.0 \
    --package-id "$PKGID_LD" --sequence 1 --tls --cafile "$ORDERER_CA" 2>/dev/null || true
done
ok "Chaincodes approved"

# ── Step 6: Commit chaincodes ─────────────────────────────────
echo ""
echo "▶ Step 6: Committing chaincodes..."

set_dbs
for CC in identityregistry lenderdapp; do
  PKGID=$( [ "$CC" = "identityregistry" ] && echo "$PKGID_IR" || echo "$PKGID_LD" )
  peer lifecycle chaincode commit \
    -o orderer.trustid.com:7050 --ordererTLSHostnameOverride orderer.trustid.com \
    --channelID trustid-channel --name $CC --version 1.0 --sequence 1 \
    --tls --cafile "$ORDERER_CA" \
    --peerAddresses peer0.dbs.trustid.com:7051 \
    --tlsRootCertFiles "$BASE/network/organizations/peerOrganizations/dbs.trustid.com/peers/peer0.dbs.trustid.com/tls/ca.crt" \
    --peerAddresses peer0.grab.trustid.com:8051 \
    --tlsRootCertFiles "$BASE/network/organizations/peerOrganizations/grab.trustid.com/peers/peer0.grab.trustid.com/tls/ca.crt" \
    --peerAddresses peer0.singtel.trustid.com:9051 \
    --tlsRootCertFiles "$BASE/network/organizations/peerOrganizations/singtel.trustid.com/peers/peer0.singtel.trustid.com/tls/ca.crt" \
    2>/dev/null && ok "$CC committed" || warn "$CC already committed (ok)"
done

# ── Step 7: Start services ────────────────────────────────────
echo ""
echo "▶ Step 7: Starting services..."

pkill -f "scorer.py" 2>/dev/null || true
pkill -f "oracle.js" 2>/dev/null || true
pkill -f "next dev"  2>/dev/null || true
sleep 1

mkdir -p logs

cd ai-scorer && python3 scorer.py > ../logs/scorer.log 2>&1 &
sleep 3 && ok "AI scorer running on :5001"

cd ../oracle && node oracle.js > ../logs/oracle.log 2>&1 &
sleep 2 && ok "Oracle running"

cd ../frontend && npm run dev > ../logs/frontend.log 2>&1 &
sleep 5 && ok "Frontend running on :3000"

cd ..

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  TrustID is ready!                           ║"
echo "║                                              ║"
echo "║  Frontend  →  http://localhost:3000          ║"
echo "║  AI Scorer →  http://localhost:5001/health   ║"
echo "║                                              ║"
echo "║  Now run: bash scripts/4-demo-seed.sh        ║"
echo "╚══════════════════════════════════════════════╝"
