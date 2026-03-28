#!/bin/bash
# ============================================================
# Script 1: Start TrustID Network (4-Org: DBS, Grab, Singtel, Singpass)
# Run from: ~/trustid-v2/   (WSL2 native path)
# ============================================================
set -e
cd "$(dirname "$0")/.."

export PATH="$HOME/fabric/bin:$PATH"
export FABRIC_CFG_PATH=$HOME/fabric/config

GREEN='\033[0;32m'; NC='\033[0m'
ok() { echo -e "${GREEN}✓ $1${NC}"; }

echo ""
echo "▶ Step 1: Add /etc/hosts entries..."
grep -q "orderer.trustid.com" /etc/hosts || echo "127.0.0.1 orderer.trustid.com
127.0.0.1 peer0.dbs.trustid.com
127.0.0.1 peer0.grab.trustid.com
127.0.0.1 peer0.singtel.trustid.com
127.0.0.1 peer0.singpass.trustid.com" | sudo tee -a /etc/hosts
ok "Hosts entries set"

echo ""
echo "▶ Step 2: Generating crypto materials for 4 orgs..."
rm -rf ./network/organizations/ordererOrganizations ./network/organizations/peerOrganizations
cryptogen generate \
  --config=./network/configtx/crypto-config.yaml \
  --output=./network/organizations
ok "Crypto materials generated (DBS, Grab, Singtel, Singpass, Orderer)"

echo ""
echo "▶ Step 3: Generating channel genesis block..."
mkdir -p network/channel-artifacts
configtxgen \
  -profile TrustIDChannel \
  -outputBlock ./network/channel-artifacts/trustid-channel.block \
  -channelID trustid-channel
ok "Channel block created"

echo ""
echo "▶ Step 4: Starting Docker containers (9 containers)..."
cd network
docker compose down -v --remove-orphans 2>/dev/null || true
docker compose up -d
cd ..
echo "  Waiting 20 seconds for containers to stabilise..."
sleep 20
ok "Containers started"

echo ""
echo "▶ Step 5: Joining orderer to channel via osnadmin..."
export ORDERER_CA=$(pwd)/network/organizations/ordererOrganizations/trustid.com/orderers/orderer.trustid.com/msp/tlscacerts/tlsca.trustid.com-cert.pem
export ORDERER_ADMIN_TLS_SIGN_CERT=$(pwd)/network/organizations/ordererOrganizations/trustid.com/orderers/orderer.trustid.com/tls/server.crt
export ORDERER_ADMIN_TLS_PRIVATE_KEY=$(pwd)/network/organizations/ordererOrganizations/trustid.com/orderers/orderer.trustid.com/tls/server.key

osnadmin channel join \
  --channelID trustid-channel \
  --config-block ./network/channel-artifacts/trustid-channel.block \
  -o orderer.trustid.com:7053 \
  --ca-file "$ORDERER_CA" \
  --client-cert "$ORDERER_ADMIN_TLS_SIGN_CERT" \
  --client-key "$ORDERER_ADMIN_TLS_PRIVATE_KEY"
ok "Orderer joined channel"

echo ""
echo "▶ Step 6: Joining all 4 peers to channel..."
export CORE_PEER_TLS_ENABLED=true

join_peer() {
  local MSP=$1; local ADDR=$2; local CERT=$3; local MSPPATH=$4
  export CORE_PEER_LOCALMSPID="$MSP"
  export CORE_PEER_ADDRESS="$ADDR"
  export CORE_PEER_TLS_ROOTCERT_FILE="$CERT"
  export CORE_PEER_MSPCONFIGPATH="$MSPPATH"
  peer channel join -b ./network/channel-artifacts/trustid-channel.block
}

join_peer "DBSMSP"      "peer0.dbs.trustid.com:7051"     "$(pwd)/network/organizations/peerOrganizations/dbs.trustid.com/peers/peer0.dbs.trustid.com/tls/ca.crt"      "$(pwd)/network/organizations/peerOrganizations/dbs.trustid.com/users/Admin@dbs.trustid.com/msp"
ok "DBS peer joined"

join_peer "GrabMSP"     "peer0.grab.trustid.com:8051"    "$(pwd)/network/organizations/peerOrganizations/grab.trustid.com/peers/peer0.grab.trustid.com/tls/ca.crt"    "$(pwd)/network/organizations/peerOrganizations/grab.trustid.com/users/Admin@grab.trustid.com/msp"
ok "Grab peer joined"

join_peer "SingtelMSP"  "peer0.singtel.trustid.com:9051" "$(pwd)/network/organizations/peerOrganizations/singtel.trustid.com/peers/peer0.singtel.trustid.com/tls/ca.crt" "$(pwd)/network/organizations/peerOrganizations/singtel.trustid.com/users/Admin@singtel.trustid.com/msp"
ok "Singtel peer joined"

join_peer "SingpassMSP" "peer0.singpass.trustid.com:10051" "$(pwd)/network/organizations/peerOrganizations/singpass.trustid.com/peers/peer0.singpass.trustid.com/tls/ca.crt" "$(pwd)/network/organizations/peerOrganizations/singpass.trustid.com/users/Admin@singpass.trustid.com/msp"
ok "Singpass peer joined"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Network is UP — 4 orgs on trustid-channel          ║"
echo "║  Next: bash scripts/2-deploy-chaincode.sh           ║"
echo "╚══════════════════════════════════════════════════════╝"
