#!/bin/bash

echo "🤖 Discord Email Forwarder Bot - Setup Script"
echo "=============================================="
echo ""

# Check if .env exists
if [ -f ".env" ]; then
    echo "⚠️  .env file already exists"
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Setup cancelled."
        exit 1
    fi
fi

# Copy template to .env
cp env.template .env
echo "✅ Created .env file from template"
echo ""

echo "📝 Please edit the .env file with your credentials:"
echo "   1. Add your Discord bot token (DISCORD_BOT_TOKEN)"
echo "   2. Add your Discord channel ID (DISCORD_CHANNEL_ID)"
echo "   3. Add your email credentials (EMAIL_USER, EMAIL_PASSWORD)"
echo "   4. Adjust EMAIL_HOST if not using Gmail"
echo ""

# Install dependencies
echo "📦 Installing dependencies..."
npm install

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Setup complete!"
    echo ""
    echo "Next steps:"
    echo "   1. Edit .env file with your credentials"
    echo "   2. Run 'npm run dev' to start in development mode"
    echo "   3. Or run 'npm run build && npm start' for production"
    echo ""
else
    echo ""
    echo "⚠️  npm install failed. You may need to run:"
    echo "   sudo chown -R $(id -u):$(id -g) ~/.npm"
    echo "   Then run: npm install"
    echo ""
fi
