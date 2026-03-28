#!/bin/bash
# ============================================================
# Script 2: Deploy Chaincodes (4-org endorsement)
# ============================================================
set -e
cd "$(dirname "$0")/.."

export PATH="$HOME/fabric/bin:$PATH"
export FABRIC_CFG_PATH="$HOME/fabric/config"
export CORE_PEER_TLS_ENABLED=true
export ORDERER_CA="$(pwd)/network/organizations/ordererOrganizations/trustid.com/orderers/orderer.trustid.com/msp/tlscacerts/tlsca.trustid.com-cert.pem"

GREEN='\033[0;32m'; NC='\033[0m'
ok() { echo -e "${GREEN}✓ $1${NC}"; }

DBS_TLS="$(pwd)/network/organizations/peerOrganizations/dbs.trustid.com/peers/peer0.dbs.trustid.com/tls/ca.crt"
GRAB_TLS="$(pwd)/network/organizations/peerOrganizations/grab.trustid.com/peers/peer0.grab.trustid.com/tls/ca.crt"
SINGTEL_TLS="$(pwd)/network/organizations/peerOrganizations/singtel.trustid.com/peers/peer0.singtel.trustid.com/tls/ca.crt"
SINGPASS_TLS="$(pwd)/network/organizations/peerOrganizations/singpass.trustid.com/peers/peer0.singpass.trustid.com/tls/ca.crt"

set_dbs()      { export CORE_PEER_LOCALMSPID="DBSMSP";      export CORE_PEER_ADDRESS="peer0.dbs.trustid.com:7051";      export CORE_PEER_TLS_ROOTCERT_FILE="$DBS_TLS";      export CORE_PEER_MSPCONFIGPATH="$(pwd)/network/organizations/peerOrganizations/dbs.trustid.com/users/Admin@dbs.trustid.com/msp"; }
set_grab()     { export CORE_PEER_LOCALMSPID="GrabMSP";     export CORE_PEER_ADDRESS="peer0.grab.trustid.com:8051";     export CORE_PEER_TLS_ROOTCERT_FILE="$GRAB_TLS";     export CORE_PEER_MSPCONFIGPATH="$(pwd)/network/organizations/peerOrganizations/grab.trustid.com/users/Admin@grab.trustid.com/msp"; }
set_singtel()  { export CORE_PEER_LOCALMSPID="SingtelMSP";  export CORE_PEER_ADDRESS="peer0.singtel.trustid.com:9051";  export CORE_PEER_TLS_ROOTCERT_FILE="$SINGTEL_TLS";  export CORE_PEER_MSPCONFIGPATH="$(pwd)/network/organizations/peerOrganizations/singtel.trustid.com/users/Admin@singtel.trustid.com/msp"; }
set_singpass() { export CORE_PEER_LOCALMSPID="SingpassMSP"; export CORE_PEER_ADDRESS="peer0.singpass.trustid.com:10051"; export CORE_PEER_TLS_ROOTCERT_FILE="$SINGPASS_TLS"; export CORE_PEER_MSPCONFIGPATH="$(pwd)/network/organizations/peerOrganizations/singpass.trustid.com/users/Admin@singpass.trustid.com/msp"; }

deploy_chaincode() {
  local NAME=$1; local CC_PATH=$2; local SEQ=$3

  echo ""; echo "▶ Deploying: $NAME"

  # Init Go module
  cd "$CC_PATH"
  [ ! -f "go.mod" ] && go mod init "github.com/trustid/$NAME" && go get github.com/hyperledger/fabric-contract-api-go/contractapi && go mod tidy
  cd - > /dev/null

  # Package
  set_dbs
  peer lifecycle chaincode package "${NAME}.tar.gz" --path "$CC_PATH" --lang golang --label "${NAME}_1"
  ok "$NAME packaged"

  # Install on all 4 peers
  set_dbs;      peer lifecycle chaincode install "${NAME}.tar.gz"
  set_grab;     peer lifecycle chaincode install "${NAME}.tar.gz"
  set_singtel;  peer lifecycle chaincode install "${NAME}.tar.gz"
  set_singpass; peer lifecycle chaincode install "${NAME}.tar.gz"
  ok "$NAME installed on all 4 peers"

  # Get package ID
  set_dbs
  PKGID=$(peer lifecycle chaincode queryinstalled | grep "${NAME}_1" | awk '{print $3}' | tr -d ',')
  echo "  Package ID: $PKGID"

  # Approve from all 4 orgs
  for ORG in dbs grab singtel singpass; do
    set_${ORG}
    peer lifecycle chaincode approveformyorg \
      -o orderer.trustid.com:7050 --ordererTLSHostnameOverride orderer.trustid.com \
      --channelID trustid-channel --name "$NAME" --version 1.0 \
      --package-id "$PKGID" --sequence "$SEQ" --tls --cafile "$ORDERER_CA"
  done
  ok "$NAME approved by all 4 orgs"

  # Commit (send to all 4 peer addresses)
  set_dbs
  peer lifecycle chaincode commit \
    -o orderer.trustid.com:7050 --ordererTLSHostnameOverride orderer.trustid.com \
    --channelID trustid-channel --name "$NAME" --version 1.0 --sequence "$SEQ" \
    --tls --cafile "$ORDERER_CA" \
    --peerAddresses peer0.dbs.trustid.com:7051      --tlsRootCertFiles "$DBS_TLS" \
    --peerAddresses peer0.grab.trustid.com:8051     --tlsRootCertFiles "$GRAB_TLS" \
    --peerAddresses peer0.singtel.trustid.com:9051  --tlsRootCertFiles "$SINGTEL_TLS" \
    --peerAddresses peer0.singpass.trustid.com:10051 --tlsRootCertFiles "$SINGPASS_TLS"
  ok "$NAME committed"
}

deploy_chaincode "identityregistry" "$(pwd)/chaincode/identityregistry" 1
deploy_chaincode "lenderdapp"       "$(pwd)/chaincode/lenderdapp"       1

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Both chaincodes deployed on 4-org channel!         ║"
echo "║  Next: bash scripts/3-start-services.sh             ║"
echo "╚══════════════════════════════════════════════════════╝"
