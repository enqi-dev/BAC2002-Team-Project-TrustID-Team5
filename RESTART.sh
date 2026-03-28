#!/bin/bash
cd ~/trustid-v2
export PATH="$HOME/fabric/bin:$HOME/.local/bin:$PATH"
export FABRIC_CFG_PATH="$HOME/fabric/config"
export CORE_PEER_TLS_ENABLED=true

# Start containers
cd network && docker compose up -d && cd ..
sleep 20
echo "Containers up"

# Rejoin orderer
export ORDERER_CA=$(pwd)/network/organizations/ordererOrganizations/trustid.com/orderers/orderer.trustid.com/msp/tlscacerts/tlsca.trustid.com-cert.pem
osnadmin channel join \
  --channelID trustid-channel \
  --config-block ./network/channel-artifacts/trustid-channel.block \
  -o orderer.trustid.com:7053 \
  --ca-file "$ORDERER_CA" \
  --client-cert $(pwd)/network/organizations/ordererOrganizations/trustid.com/orderers/orderer.trustid.com/tls/server.crt \
  --client-key $(pwd)/network/organizations/ordererOrganizations/trustid.com/orderers/orderer.trustid.com/tls/server.key
echo "Orderer joined"

# Rejoin 4 peers
export DBS_TLS=$(pwd)/network/organizations/peerOrganizations/dbs.trustid.com/peers/peer0.dbs.trustid.com/tls/ca.crt
export GRAB_TLS=$(pwd)/network/organizations/peerOrganizations/grab.trustid.com/peers/peer0.grab.trustid.com/tls/ca.crt
export SINGTEL_TLS=$(pwd)/network/organizations/peerOrganizations/singtel.trustid.com/peers/peer0.singtel.trustid.com/tls/ca.crt
export SINGPASS_TLS=$(pwd)/network/organizations/peerOrganizations/singpass.trustid.com/peers/peer0.singpass.trustid.com/tls/ca.crt

for ORG in dbs grab singtel singpass; do
  case $ORG in
    dbs)      MSP=DBSMSP;      PORT=7051 ;;
    grab)     MSP=GrabMSP;     PORT=8051 ;;
    singtel)  MSP=SingtelMSP;  PORT=9051 ;;
    singpass) MSP=SingpassMSP; PORT=10051 ;;
  esac
  export CORE_PEER_LOCALMSPID="$MSP"
  export CORE_PEER_ADDRESS="peer0.${ORG}.trustid.com:${PORT}"
  export CORE_PEER_TLS_ROOTCERT_FILE=$(pwd)/network/organizations/peerOrganizations/${ORG}.trustid.com/peers/peer0.${ORG}.trustid.com/tls/ca.crt
  export CORE_PEER_MSPCONFIGPATH=$(pwd)/network/organizations/peerOrganizations/${ORG}.trustid.com/users/Admin@${ORG}.trustid.com/msp
  peer channel join -b ./network/channel-artifacts/trustid-channel.block
  echo "$ORG joined"
done

# Redeploy chaincodes
export FABRIC_CFG_PATH="$HOME/fabric/config"
export CORE_PEER_LOCALMSPID="DBSMSP"
export CORE_PEER_ADDRESS="peer0.dbs.trustid.com:7051"
export CORE_PEER_TLS_ROOTCERT_FILE=$DBS_TLS
export CORE_PEER_MSPCONFIGPATH=$(pwd)/network/organizations/peerOrganizations/dbs.trustid.com/users/Admin@dbs.trustid.com/msp

set_dbs()      { export CORE_PEER_LOCALMSPID="DBSMSP";      export CORE_PEER_ADDRESS="peer0.dbs.trustid.com:7051";       export CORE_PEER_TLS_ROOTCERT_FILE=$DBS_TLS;      export CORE_PEER_MSPCONFIGPATH=$(pwd)/network/organizations/peerOrganizations/dbs.trustid.com/users/Admin@dbs.trustid.com/msp; }
set_grab()     { export CORE_PEER_LOCALMSPID="GrabMSP";     export CORE_PEER_ADDRESS="peer0.grab.trustid.com:8051";      export CORE_PEER_TLS_ROOTCERT_FILE=$GRAB_TLS;     export CORE_PEER_MSPCONFIGPATH=$(pwd)/network/organizations/peerOrganizations/grab.trustid.com/users/Admin@grab.trustid.com/msp; }
set_singtel()  { export CORE_PEER_LOCALMSPID="SingtelMSP";  export CORE_PEER_ADDRESS="peer0.singtel.trustid.com:9051";   export CORE_PEER_TLS_ROOTCERT_FILE=$SINGTEL_TLS;  export CORE_PEER_MSPCONFIGPATH=$(pwd)/network/organizations/peerOrganizations/singtel.trustid.com/users/Admin@singtel.trustid.com/msp; }
set_singpass() { export CORE_PEER_LOCALMSPID="SingpassMSP"; export CORE_PEER_ADDRESS="peer0.singpass.trustid.com:10051"; export CORE_PEER_TLS_ROOTCERT_FILE=$SINGPASS_TLS; export CORE_PEER_MSPCONFIGPATH=$(pwd)/network/organizations/peerOrganizations/singpass.trustid.com/users/Admin@singpass.trustid.com/msp; }

for NAME in identityregistry lenderdapp; do
  set_dbs; peer lifecycle chaincode install ${NAME}.tar.gz
  set_grab; peer lifecycle chaincode install ${NAME}.tar.gz
  set_singtel; peer lifecycle chaincode install ${NAME}.tar.gz
  set_singpass; peer lifecycle chaincode install ${NAME}.tar.gz

  set_dbs
  PKGID=$(peer lifecycle chaincode queryinstalled | grep "${NAME}_1" | awk '{print $3}' | tr -d ',')

  for ORG in dbs grab singtel singpass; do
    set_${ORG}
    peer lifecycle chaincode approveformyorg \
      -o orderer.trustid.com:7050 --ordererTLSHostnameOverride orderer.trustid.com \
      --channelID trustid-channel --name $NAME --version 1.0 \
      --package-id "$PKGID" --sequence 1 --tls --cafile "$ORDERER_CA"
  done

  set_dbs
  peer lifecycle chaincode commit \
    -o orderer.trustid.com:7050 --ordererTLSHostnameOverride orderer.trustid.com \
    --channelID trustid-channel --name $NAME --version 1.0 --sequence 1 \
    --tls --cafile "$ORDERER_CA" \
    --peerAddresses peer0.dbs.trustid.com:7051      --tlsRootCertFiles $DBS_TLS \
    --peerAddresses peer0.grab.trustid.com:8051     --tlsRootCertFiles $GRAB_TLS \
    --peerAddresses peer0.singtel.trustid.com:9051  --tlsRootCertFiles $SINGTEL_TLS \
    --peerAddresses peer0.singpass.trustid.com:10051 --tlsRootCertFiles $SINGPASS_TLS
  echo "$NAME deployed"
done

# Start services
python3 ~/trustid-v2/ai-scorer/scorer.py > ~/trustid-v2/logs/scorer.log 2>&1 &
node ~/trustid-v2/oracle/oracle.js > ~/trustid-v2/logs/oracle.log 2>&1 &
cd ~/trustid-v2/frontend && npm run dev > ~/trustid-v2/logs/frontend.log 2>&1 &
sleep 8
grep "Local:" ~/trustid-v2/logs/frontend.log
echo "ALL SERVICES UP — open browser"

# Re-add /etc/hosts entries (WSL wipes these on restart)
grep -q "peer0.dbs.trustid.com" /etc/hosts || echo "127.0.0.1 peer0.dbs.trustid.com peer0.grab.trustid.com peer0.singtel.trustid.com peer0.singpass.trustid.com orderer.trustid.com" | sudo tee -a /etc/hosts
