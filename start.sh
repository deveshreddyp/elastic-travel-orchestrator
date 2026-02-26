#!/bin/bash

echo "Starting mock API..."
cd /app/mock-api && node server.js &

echo "Seeding Maya's itinerary..."
cd /app && python backend/scripts/seed_maya.py

echo "Starting backend..."
cd /app && uvicorn backend.api.routes:app \
  --host 0.0.0.0 \
  --port 8000 &

echo "Starting frontend..."
npx serve /app/frontend/dist \
  --listen 7860 \
  --single
```

---

## Step 3 — Add Hugging Face secrets

Go to your Hugging Face Space → **Settings** → **Repository secrets** → add all of these one by one:
```
OPENWEATHER_API_KEY  = your_key
REDIS_URL            = your_upstash_url
DEMO_MODE            = true
DEMO_SESSION_ID      = demo-maya-001
