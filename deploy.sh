#!/bin/bash
# ==============================================================================
# CA Buddy — Build & Package for Hostinger Deployment
# Usage: ./deploy.sh
# ==============================================================================

set -e

echo "🔨 Building React frontend..."
cd frontend
npm install
npm run build
cd ..

echo ""
echo "📦 Packaging backend/ into cabuddy_hostinger.zip..."
cd backend
zip -r ../cabuddy_hostinger.zip . -x "*.DS_Store"
cd ..

echo ""
echo "✅ Done! Upload cabuddy_hostinger.zip to Hostinger File Manager → public_html/ → Extract"
echo ""
echo "📋 Deployment Checklist:"
echo "  1. Import schema.sql into phpMyAdmin (database: u110415653_cabuddy)"
echo "  2. Upload cabuddy_hostinger.zip to public_html/ and extract"
echo "  3. Test: https://yourdomain.com/api/test_db.php"
echo "  4. Login: https://yourdomain.com/ with cabuddy@gmail.com / 12345678"
