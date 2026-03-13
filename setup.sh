#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup.sh — One-time project setup
#
# Run this once before starting the app for the first time.
# Requires: Python 3.10+, uv, Node.js 18+, npm, git
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Interactive Story — Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# ── Check prerequisites ────────────────────────────────────────────────────
check_cmd() {
  if ! command -v "$1" &>/dev/null; then
    echo "❌  '$1' not found. Please install it and re-run setup."
    echo "    $2"
    exit 1
  fi
}

# uv may be installed via pip but not on PATH — try to find it
if ! command -v uv &>/dev/null; then
  # Check common pip install locations on Windows
  UV_SCRIPTS="$HOME/AppData/Local/Programs/Python/Python311/Scripts/uv.exe"
  if [ -f "$UV_SCRIPTS" ]; then
    export PATH="$(dirname "$UV_SCRIPTS"):$PATH"
  else
    echo "⚠  uv not found in PATH. Attempting to install via pip..."
    pip install uv || python3 -m pip install uv || { echo "❌ Could not install uv"; exit 1; }
    # Refresh PATH search
    hash -r 2>/dev/null || true
  fi
fi

check_cmd python3  "https://www.python.org/downloads/"
check_cmd uv       "pip install uv"
check_cmd node     "https://nodejs.org/"
check_cmd npm      "https://nodejs.org/"
check_cmd git      "https://git-scm.com/"

echo "✓ Prerequisites OK"
echo ""

# ── Backend ────────────────────────────────────────────────────────────────
echo "▶ Setting up backend..."
cd "$SCRIPT_DIR/backend"

# Create virtual environment and install dependencies
uv venv --python python3
uv pip install -e ".[dev]" 2>/dev/null || uv pip install -e .

# Copy env file if not present
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "⚠  Created backend/.env  — EDIT IT NOW and add your GOOGLE_API_KEY"
  echo "   Get a free key at: https://aistudio.google.com/apikey"
  echo ""
fi

echo "✓ Backend ready"
echo ""

# ── A2UI Library (optional — for future official renderer integration) ─────
echo "▶ Cloning A2UI library (for reference & future integration)..."
cd "$SCRIPT_DIR"

if [ ! -d "a2ui-lib" ]; then
  git clone --depth=1 https://github.com/google/A2UI.git a2ui-lib
  echo "✓ A2UI library cloned to a2ui-lib/"
else
  echo "  a2ui-lib/ already exists — skipping clone"
fi
echo ""

# ── Frontend ───────────────────────────────────────────────────────────────
echo "▶ Setting up frontend..."
cd "$SCRIPT_DIR/frontend"

npm install

# Copy env file if not present
if [ ! -f .env ]; then
  cp .env.example .env
fi

echo "✓ Frontend ready"
echo ""

# ── Done ───────────────────────────────────────────────────────────────────
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  Setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Edit backend/.env and add your GOOGLE_API_KEY"
echo "  2. Run: ./start.sh"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
