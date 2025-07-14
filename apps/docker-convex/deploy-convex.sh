#!/bin/bash
set -e

echo "🚀 Starting Convex function deployment..."

# Wait for backend to be ready
echo "⏳ Waiting for Convex backend to be ready..."
until curl -f http://convex-backend:3210/version > /dev/null 2>&1; do
  echo "Waiting for backend..."
  sleep 2
done

echo "✅ Backend is ready, deploying functions..."

# Create .env.local with the backend URL for Convex CLI
echo "📝 Setting up Convex environment..."
cat > .env.local << EOF
CONVEX_URL=${CONVEX_URL}
EOF

# Clear CONVEX_DEPLOYMENT to avoid login prompts for self-hosted
unset CONVEX_DEPLOYMENT

# Deploy functions using convex dev --once directly with proper flags
echo "🚀 Deploying functions to self-hosted backend..."
npx convex dev --once --url ${CONVEX_URL}

echo "📁 Copying generated files to shared volume..."
# Copy generated files to shared volume
cp -r convex/_generated/* /app/convex/_generated/ 2>/dev/null || true

echo "🔑 Generating admin key for Convex dashboard..."
# Generate admin key by calling the backend directly
ADMIN_KEY=$(curl -s -X POST http://convex-backend:3210/api/generate_admin_key 2>/dev/null || echo "")

if [ -n "$ADMIN_KEY" ]; then
    echo ""
    echo "🎉 =================================="
    echo "🔐 CONVEX ADMIN KEY GENERATED:"
    echo "🔐 $ADMIN_KEY"
    echo "🎉 =================================="
    echo ""
    echo "📋 Use this key to access the Convex Dashboard at:"
    echo "📋 http://your-server-ip:6791"
    echo ""
else
    echo "⚠️  Could not generate admin key automatically."
    echo "💡 You can generate it manually with:"
    echo "💡 docker exec -it <convex-backend-container> ./generate_admin_key.sh"
fi

echo "✅ Convex deployment complete!"
