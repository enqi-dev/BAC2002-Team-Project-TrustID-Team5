#!/bin/bash
# ============================================================
# Script 3: Start AI Scorer + Oracle + Frontend
# Run: bash scripts/3-start-services.sh
# ============================================================
cd "$(dirname "$0")/.."

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo ""
echo "▶ Starting TrustID services..."
echo ""

# Kill any existing services
pkill -f "scorer.py" 2>/dev/null || true
pkill -f "oracle.js" 2>/dev/null || true
pkill -f "next dev"  2>/dev/null || true
sleep 1

# AI Scorer
echo "  Starting AI scorer on :5001..."
cd ai-scorer && python3 scorer.py > ../logs/scorer.log 2>&1 &
SCORER_PID=$!
cd ..
sleep 3
if kill -0 $SCORER_PID 2>/dev/null; then
  echo -e "${GREEN}  ✓ AI Scorer running (PID $SCORER_PID)${NC}"
else
  echo -e "${YELLOW}  ⚠ AI Scorer failed — check logs/scorer.log${NC}"
fi

# Oracle
echo "  Starting Oracle service..."
mkdir -p logs
cd oracle && node oracle.js > ../logs/oracle.log 2>&1 &
ORACLE_PID=$!
cd ..
sleep 2
echo -e "${GREEN}  ✓ Oracle running (PID $ORACLE_PID)${NC}"

# Frontend
echo "  Starting Frontend on :3000..."
cd frontend && npm run dev > ../logs/frontend.log 2>&1 &
FRONT_PID=$!
cd ..
sleep 4
echo -e "${GREEN}  ✓ Frontend running (PID $FRONT_PID)${NC}"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║  All services running!                       ║"
echo "║                                              ║"
echo "║  Frontend  →  http://localhost:3000          ║"
echo "║  AI Scorer →  http://localhost:5001/health   ║"
echo "║  Explorer  →  http://localhost:8080          ║"
echo "║                                              ║"
echo "║  Logs in: ./logs/                            ║"
echo "╚══════════════════════════════════════════════╝"
echo ""
echo "Press Ctrl+C to stop all services"

trap "kill $SCORER_PID $ORACLE_PID $FRONT_PID 2>/dev/null; echo 'Stopped.'" EXIT
wait
