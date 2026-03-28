/**
 * TrustID Fabric Gateway connection helper
 * 4 independent MSP organisations: DBS, Grab, Singtel, Singpass
 * Each org has its own peer, MSP identity, and signs independently.
 */

import { connect, hash, signers } from '@hyperledger/fabric-gateway';
import * as grpc from '@grpc/grpc-js';
import { promises as fs } from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const NETWORK_DIR = path.resolve(process.cwd(), '..', 'network', 'organizations');

export const PEERS = {
  dbs: {
    endpoint:  'peer0.dbs.trustid.com:7051',
    hostname:  'peer0.dbs.trustid.com',
    mspId:     'DBSMSP',
    orgName:   'DBS Bank',
    color:     '#e8002d',
    tlsCert:   `${NETWORK_DIR}/peerOrganizations/dbs.trustid.com/peers/peer0.dbs.trustid.com/tls/ca.crt`,
    certPath:  `${NETWORK_DIR}/peerOrganizations/dbs.trustid.com/users/Admin@dbs.trustid.com/msp/signcerts/Admin@dbs.trustid.com-cert.pem`,
    keyDir:    `${NETWORK_DIR}/peerOrganizations/dbs.trustid.com/users/Admin@dbs.trustid.com/msp/keystore`,
  },
  grab: {
    endpoint:  'peer0.grab.trustid.com:8051',
    hostname:  'peer0.grab.trustid.com',
    mspId:     'GrabMSP',
    orgName:   'Grab',
    color:     '#00b14f',
    tlsCert:   `${NETWORK_DIR}/peerOrganizations/grab.trustid.com/peers/peer0.grab.trustid.com/tls/ca.crt`,
    certPath:  `${NETWORK_DIR}/peerOrganizations/grab.trustid.com/users/Admin@grab.trustid.com/msp/signcerts/Admin@grab.trustid.com-cert.pem`,
    keyDir:    `${NETWORK_DIR}/peerOrganizations/grab.trustid.com/users/Admin@grab.trustid.com/msp/keystore`,
  },
  singtel: {
    endpoint:  'peer0.singtel.trustid.com:9051',
    hostname:  'peer0.singtel.trustid.com',
    mspId:     'SingtelMSP',
    orgName:   'Singtel',
    color:     '#cc0000',
    tlsCert:   `${NETWORK_DIR}/peerOrganizations/singtel.trustid.com/peers/peer0.singtel.trustid.com/tls/ca.crt`,
    certPath:  `${NETWORK_DIR}/peerOrganizations/singtel.trustid.com/users/Admin@singtel.trustid.com/msp/signcerts/Admin@singtel.trustid.com-cert.pem`,
    keyDir:    `${NETWORK_DIR}/peerOrganizations/singtel.trustid.com/users/Admin@singtel.trustid.com/msp/keystore`,
  },
  singpass: {
    endpoint:  'peer0.singpass.trustid.com:10051',
    hostname:  'peer0.singpass.trustid.com',
    mspId:     'SingpassMSP',
    orgName:   'Singpass',
    color:     '#B2102F',
    tlsCert:   `${NETWORK_DIR}/peerOrganizations/singpass.trustid.com/peers/peer0.singpass.trustid.com/tls/ca.crt`,
    certPath:  `${NETWORK_DIR}/peerOrganizations/singpass.trustid.com/users/Admin@singpass.trustid.com/msp/signcerts/Admin@singpass.trustid.com-cert.pem`,
    keyDir:    `${NETWORK_DIR}/peerOrganizations/singpass.trustid.com/users/Admin@singpass.trustid.com/msp/keystore`,
  },
};

export async function getGateway(org = 'dbs') {
  const peer = PEERS[org];
  if (!peer) throw new Error(`Unknown org: ${org}. Valid: dbs, grab, singtel, singpass`);

  const tlsCert = await fs.readFile(peer.tlsCert);
  const client  = new grpc.Client(
    peer.endpoint,
    grpc.credentials.createSsl(tlsCert),
    { 'grpc.ssl_target_name_override': peer.hostname }
  );
  const certPem  = await fs.readFile(peer.certPath);
  const keyFiles = await fs.readdir(peer.keyDir);
  const keyPem   = await fs.readFile(path.join(peer.keyDir, keyFiles[0]));
  const gateway  = connect({
    client,
    identity: { mspId: peer.mspId, credentials: certPem },
    signer:   signers.newPrivateKeySigner(crypto.createPrivateKey(keyPem)),
    hash:     hash.sha256,
  });
  return { gateway, client };
}

export function getContract(gateway, chaincode) {
  return gateway.getNetwork('trustid-channel').getContract(chaincode);
}

export function decode(bytes) {
  return JSON.parse(new TextDecoder().decode(bytes));
}
