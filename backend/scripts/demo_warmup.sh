#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# Elastic Travel Orchestrator — Demo Warmup Script
# Starts the stack, seeds data, pre-caches routes, and runs tests.
# ─────────────────────────────────────────────────────────────────────
set -e  # abort on any error

echo ""
echo "🚀 Starting Elastic demo warmup..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# ── 1. Start stack ──────────────────────────────────────────────────
echo ""
echo "📦 Step 1/5: Starting Docker stack..."
docker compose up -d --build
echo "⏳ Waiting for services to stabilize..."
sleep 10

# ── 2. Health check ─────────────────────────────────────────────────
echo ""
echo "🏥 Step 2/5: Checking backend health..."
HEALTH=$(curl -sf http://localhost:8000/api/health 2>&1) || {
    echo "❌ Backend not healthy"
    echo "   Response: $HEALTH"
    echo "   Logs:"
    docker compose logs backend --tail=20
    exit 1
}
echo "   $HEALTH"
echo "   ✓ Backend is responding"

# ── 3. Seed Maya's itinerary ─────────────────────────────────────────
echo ""
echo "🌱 Step 3/5: Seeding Maya's demo itinerary..."
python backend/scripts/seed_maya.py || {
    echo "❌ Seed failed"
    exit 1
}
echo "   ✓ Maya's itinerary seeded"

# ── 4. Pre-cache OSRM routes ─────────────────────────────────────────
echo ""
echo "🗺  Step 4/5: Pre-caching OSRM/demo routes..."
python -m api.demo_cache || python backend/api/demo_cache.py || {
    echo "❌ Route cache failed"
    exit 1
}
echo "   ✓ Routes cached"

# ── 5. Run test suite ────────────────────────────────────────────────
echo ""
echo "🧪 Step 5/5: Running test suite..."
cd backend
pytest tests/ -v --tb=short || {
    echo ""
    echo "❌ Tests failed — DO NOT PRESENT"
    exit 1
}
cd ..

# ── Done ──────────────────────────────────────────────────────────────
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ ELASTIC IS DEMO-READY — GO WIN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "   Frontend: http://localhost:5173"
echo "   Backend:  http://localhost:8000"
echo "   Health:   http://localhost:8000/api/health"
echo ""
