#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start.sh — Start backend and frontend in parallel
# Stop with Ctrl+C.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# Verify .env exists and has an API key
if [ ! -f backend/.env ]; then
  echo "❌  backend/.env not found. Run ./setup.sh first."
  exit 1
fi

if grep -q "your_api_key_here" backend/.env; then
  echo "❌  Please set your GOOGLE_API_KEY in backend/.env"
  echo "    Get a free key at: https://aistudio.google.com/apikey"
  exit 1
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Interactive Story — Starting"
echo ""
echo "  Backend  → http://localhost:8080"
echo "  Frontend → http://localhost:5173"
echo ""
echo "  Press Ctrl+C to stop both."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

cleanup() {
  echo ""
  echo "Shutting down…"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  echo "Done."
}
trap cleanup EXIT INT TERM

# ── Find the right Python in the venv ─────────────────────────────────────
# Windows Git Bash uses Scripts/, Linux/macOS uses bin/
if [ -f "backend/.venv/Scripts/python.exe" ]; then
  PYTHON="backend/.venv/Scripts/python.exe"
elif [ -f "backend/.venv/bin/python" ]; then
  PYTHON="backend/.venv/bin/python"
else
  echo "❌  Virtual environment not found. Run ./setup.sh first."
  exit 1
fi

# ── Start backend ──────────────────────────────────────────────────────────
cd "$SCRIPT_DIR/backend"
"$SCRIPT_DIR/$PYTHON" -m story_agent &
BACKEND_PID=$!
echo "[backend] Started (PID $BACKEND_PID)"

sleep 2

# ── Start frontend ─────────────────────────────────────────────────────────
cd "$SCRIPT_DIR/frontend"
node node_modules/vite/bin/vite.js &
FRONTEND_PID=$!
echo "[frontend] Started (PID $FRONTEND_PID)"

echo ""
echo "  Open http://localhost:5173 in your browser"
echo ""

# Open browser (best-effort)
sleep 2
if command -v explorer.exe &>/dev/null; then
  explorer.exe "http://localhost:5173" 2>/dev/null || true
elif command -v xdg-open &>/dev/null; then
  xdg-open http://localhost:5173 2>/dev/null || true
elif command -v open &>/dev/null; then
  open http://localhost:5173 2>/dev/null || true
fi

wait -n "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || wait
