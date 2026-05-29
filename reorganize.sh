#!/bin/bash

# ============================================================
#  Tunga Chickens Ltd - Project Reorganization Script
#  Run this from the ROOT of your project:
#  bash reorganize.sh
# ============================================================

set -e  # Stop on any error

echo "🚀 Starting project reorganization..."
echo "📁 Working in: $(pwd)"
echo ""

# ------------------------------------------------------------
# SAFETY CHECK — make sure we're in the right folder
# ------------------------------------------------------------
if [ ! -f "vite.config.ts" ] || [ ! -f "App.tsx" ]; then
  echo "❌ ERROR: Please run this script from the root of your tunga-chickens project."
  exit 1
fi

# ------------------------------------------------------------
# STEP 1 — Create all target folders
# ------------------------------------------------------------
echo "📂 Creating folder structure..."

mkdir -p frontend/src/components
mkdir -p frontend/src/pages
mkdir -p frontend/src/contexts
mkdir -p frontend/src/utils
mkdir -p frontend/public
mkdir -p ml/notebooks
mkdir -p ml/data
mkdir -p ml/src
mkdir -p iot/firmware
mkdir -p database

echo "✅ Folders created."
echo ""

# ------------------------------------------------------------
# STEP 2 — FRONTEND: Move React source files
# ------------------------------------------------------------
echo "⚛️  Moving frontend files..."

# Core React files
for f in App.tsx api.ts auth.ts firebase.ts index.tsx index.css vite-env.d.ts; do
  [ -f "$f" ] && mv "$f" frontend/src/ && echo "  moved $f → frontend/src/"
done

# HTML entry point and config
[ -f "index.html" ]        && mv index.html frontend/        && echo "  moved index.html → frontend/"
[ -f "vite.config.ts" ]    && mv vite.config.ts frontend/    && echo "  moved vite.config.ts → frontend/"
[ -f "tsconfig.json" ]     && mv tsconfig.json frontend/     && echo "  moved tsconfig.json → frontend/"

# package.json — only move if backend/ already has its own
if [ -f "backend/package.json" ] && [ -f "package.json" ]; then
  mv package.json frontend/         && echo "  moved package.json → frontend/"
  mv package-lock.json frontend/    && echo "  moved package-lock.json → frontend/"
fi

# Folders
[ -d "components" ] && mv components frontend/src/  && echo "  moved components/ → frontend/src/"
[ -d "pages" ]      && mv pages frontend/src/       && echo "  moved pages/ → frontend/src/"
[ -d "contexts" ]   && mv contexts frontend/src/    && echo "  moved contexts/ → frontend/src/"
[ -d "utils" ]      && mv utils frontend/src/       && echo "  moved utils/ → frontend/src/"
[ -d "public" ]     && mv public frontend/          && echo "  moved public/ → frontend/"

echo "✅ Frontend files moved."
echo ""

# ------------------------------------------------------------
# STEP 3 — BACKEND: Move loose backend files
# ------------------------------------------------------------
echo "🖥️  Moving backend files..."

[ -f "auth.js" ]         && mv auth.js backend/          && echo "  moved auth.js → backend/"
[ -f "index.js" ]        && mv index.js backend/         && echo "  moved index.js → backend/"
[ -f "inspect_db.cjs" ]  && mv inspect_db.cjs backend/scripts/ 2>/dev/null || \
                            (mkdir -p backend/scripts && mv inspect_db.cjs backend/scripts/ && echo "  moved inspect_db.cjs → backend/scripts/")
[ -f "script.js" ]       && mv script.js backend/scripts/ && echo "  moved script.js → backend/scripts/"

echo "✅ Backend files moved."
echo ""

# ------------------------------------------------------------
# STEP 4 — ML: Move machine learning files
# ------------------------------------------------------------
echo "🤖 Moving ML files..."

[ -f "Random forest.ipynb" ]          && mv "Random forest.ipynb" ml/notebooks/          && echo "  moved Random forest.ipynb → ml/notebooks/"
[ -f "smart_poultry_dataset.csv" ]    && mv smart_poultry_dataset.csv ml/data/           && echo "  moved smart_poultry_dataset.csv → ml/data/"
[ -f "check_feature_importance.py" ]  && mv check_feature_importance.py ml/src/          && echo "  moved check_feature_importance.py → ml/src/"

echo "✅ ML files moved."
echo ""

# ------------------------------------------------------------
# STEP 5 — IoT: Move firmware
# ------------------------------------------------------------
echo "📡 Moving IoT/firmware files..."

[ -d "firmware" ] && mv firmware iot/ && echo "  moved firmware/ → iot/"

echo "✅ IoT files moved."
echo ""

# ------------------------------------------------------------
# STEP 6 — DATABASE: Move database reference files
# ------------------------------------------------------------
echo "🗄️  Moving database files..."

[ -f "database-structure.json" ] && mv database-structure.json database/ && echo "  moved database-structure.json → database/"
[ -f "metadata.json" ]           && mv metadata.json database/           && echo "  moved metadata.json → database/"
[ -f "firebase-rules.json" ]     && mv firebase-rules.json database/     && echo "  moved firebase-rules.json → database/"

echo "✅ Database files moved."
echo ""

# ------------------------------------------------------------
# STEP 7 — Delete old HTML files (replaced by React pages)
# ------------------------------------------------------------
echo "🗑️  Removing old HTML files (replaced by React)..."

for f in about.html announcements.html buy.html contact.html dashboard.html login.html register.html sell.html style.css; do
  [ -f "$f" ] && rm "$f" && echo "  deleted $f"
done

echo "✅ Old files removed."
echo ""

# ------------------------------------------------------------
# STEP 8 — Keep root-level docs
# ------------------------------------------------------------
echo "📄 Root-level files kept in place:"
[ -f "README.md" ]                          && echo "  ✔ README.md"
[ -f "DEVICE_BLOCKING_IMPLEMENTATION.md" ]  && echo "  ✔ DEVICE_BLOCKING_IMPLEMENTATION.md"
[ -f "TEMP_EDIT_NOTE.txt" ]                 && echo "  ⚠️  TEMP_EDIT_NOTE.txt — review and delete manually"
echo ""

# ------------------------------------------------------------
# DONE
# ------------------------------------------------------------
echo "🎉 Reorganization complete! Here's your new structure:"
echo ""
find . -maxdepth 3 \
  -not -path '*/node_modules/*' \
  -not -path '*/.git/*' \
  -not -path '*/\.*' \
  | sort | sed 's|[^/]*/|  |g'