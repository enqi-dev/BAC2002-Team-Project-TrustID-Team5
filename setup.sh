#!/bin/bash
# ============================================================
# TrustID — Full Setup Script
# Run this ONCE on WSL2 Ubuntu
# Usage: bash setup.sh
# ============================================================
set -e

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓ $1${NC}"; }
warn() { echo -e "${YELLOW}⚠ $1${NC}"; }
err()  { echo -e "${RED}✗ $1${NC}"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  TrustID — BAC2002 Team Project Setup        ║"
echo "║  Decentralized Behavioral Identity DApp      ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

# ── Prerequisites ─────────────────────────────────────────────
echo "▶ Checking prerequisites..."

command -v docker   &>/dev/null || err "Docker not found. Install Docker Desktop + enable WSL2 integration."
command -v node     &>/dev/null || err "Node.js not found. Run: curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash - && sudo apt install nodejs"
command -v go       &>/dev/null || err "Go not found. Run: sudo apt install golang-go"
command -v python3  &>/dev/null || err "Python3 not found. Run: sudo apt install python3 python3-pip"
command -v curl     &>/dev/null || err "curl not found. Run: sudo apt install curl"

ok "Docker found: $(docker --version | cut -d' ' -f3)"
ok "Node found: $(node --version)"
ok "Go found: $(go version | cut -d' ' -f3)"
ok "Python found: $(python3 --version)"
echo ""

# ── Install Fabric binaries ────────────────────────────────────
echo "▶ Installing Hyperledger Fabric 2.5 binaries..."
if [ ! -f "$HOME/fabric/bin/peer" ]; then
  mkdir -p "$HOME/fabric"
  cd "$HOME/fabric"
  curl -sSLO https://raw.githubusercontent.com/hyperledger/fabric/main/scripts/install-fabric.sh
  chmod +x install-fabric.sh
  ./install-fabric.sh --fabric-version 2.5.0 --ca-version 1.5.7 binary docker
  ok "Fabric binaries installed"
else
  ok "Fabric binaries already installed"
fi
export PATH="$HOME/fabric/bin:$PATH"
echo 'export PATH="$HOME/fabric/bin:$PATH"' >> ~/.bashrc
cd - > /dev/null
echo ""

# ── Python deps ────────────────────────────────────────────────
echo "▶ Installing Python dependencies..."
pip3 install -q scikit-learn imbalanced-learn flask flask-cors pandas numpy joblib
ok "Python deps installed"
echo ""

# ── Node deps ─────────────────────────────────────────────────
echo "▶ Installing Oracle dependencies..."
cd oracle && npm install --silent && cd ..
ok "Oracle deps installed"
echo ""

# ── Frontend deps ──────────────────────────────────────────────
echo "▶ Installing Frontend dependencies..."
cd frontend && npm install --silent && cd ..
ok "Frontend deps installed"
echo ""

# ── Train AI model ─────────────────────────────────────────────
echo "▶ Training AI behavioral scorer..."
cd ai-scorer && python3 train.py && cd ..
ok "AI model trained"
echo ""

# ── Pull Docker images ─────────────────────────────────────────
echo "▶ Pulling Hyperledger Fabric Docker images..."
docker pull hyperledger/fabric-peer:2.5   -q && ok "fabric-peer pulled"
docker pull hyperledger/fabric-orderer:2.5 -q && ok "fabric-orderer pulled"
docker pull hyperledger/fabric-ca:1.5.7   -q && ok "fabric-ca pulled"
docker pull couchdb:3.3                   -q && ok "couchdb pulled"
echo ""

echo "╔══════════════════════════════════════════════╗"
echo "║  Setup complete! Now run:                    ║"
echo "║                                              ║"
echo "║  bash scripts/1-start-network.sh             ║"
echo "║  bash scripts/2-deploy-chaincode.sh          ║"
echo "║  bash scripts/3-start-services.sh            ║"
echo "╚══════════════════════════════════════════════╝"
