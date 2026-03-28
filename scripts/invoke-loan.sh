#!/bin/bash
cd /home/enqi3/trustid-v2
export PATH="$HOME/fabric/bin:$HOME/.local/bin:$PATH"
export FABRIC_CFG_PATH="$HOME/fabric/config"
export CORE_PEER_TLS_ENABLED=true
export ORDERER_CA=$(pwd)/network/organizations/ordererOrganizations/trustid.com/orderers/orderer.trustid.com/msp/tlscacerts/tlsca.trustid.com-cert.pem
export DBS_TLS=$(pwd)/network/organizations/peerOrganizations/dbs.trustid.com/peers/peer0.dbs.trustid.com/tls/ca.crt
export GRAB_TLS=$(pwd)/network/organizations/peerOrganizations/grab.trustid.com/peers/peer0.grab.trustid.com/tls/ca.crt
export SINGTEL_TLS=$(pwd)/network/organizations/peerOrganizations/singtel.trustid.com/peers/peer0.singtel.trustid.com/tls/ca.crt
export CORE_PEER_LOCALMSPID="DBSMSP"
export CORE_PEER_ADDRESS="peer0.dbs.trustid.com:7051"
export CORE_PEER_TLS_ROOTCERT_FILE=$DBS_TLS
export CORE_PEER_MSPCONFIGPATH=$(pwd)/network/organizations/peerOrganizations/dbs.trustid.com/users/Admin@dbs.trustid.com/msp

LOAN_ID="$1"
DID="$2"
AMOUNT="$3"
TERM="$4"

peer chaincode invoke \
  -o orderer.trustid.com:7050 \
  --ordererTLSHostnameOverride orderer.trustid.com \
  --tls --cafile "$ORDERER_CA" \
  -C trustid-channel -n lenderdapp \
  --peerAddresses peer0.dbs.trustid.com:7051     --tlsRootCertFiles $DBS_TLS \
  --peerAddresses peer0.grab.trustid.com:8051    --tlsRootCertFiles $GRAB_TLS \
  --peerAddresses peer0.singtel.trustid.com:9051 --tlsRootCertFiles $SINGTEL_TLS \
  -c "{\"Args\":[\"ApplyForLoan\",\"${LOAN_ID}\",\"${DID}\",\"${AMOUNT}\",\"${TERM}\"]}" 2>&1

sleep 2
