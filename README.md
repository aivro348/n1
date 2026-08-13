# CA Buddy — Enterprise Audit & Robot Vault

## Project Structure

```
cabuddy/
├── frontend/          ← React + Vite (development)
│   ├── src/           ← App.jsx, main.jsx, index.css
│   ├── public/        ← Static assets (logo, icons, PWA manifest)
│   ├── index.html     ← HTML entry point
│   ├── package.json   ← Frontend dependencies only
│   └── vite.config.js ← Builds into ../backend/
│
├── backend/           ← Deployable to Hostinger public_html/
│   ├── api/
│   │   ├── config.php   ← DB credentials
│   │   ├── index.php    ← All REST API endpoints
│   │   ├── test_db.php  ← DB connectivity test
│   │   └── .htaccess    ← API routing
│   ├── .htaccess        ← Root SPA + API routing
│   ├── index.html       ← Built React SPA (after npm run build)
│   └── assets/          ← Built JS/CSS (after npm run build)
│
├── schema.sql         ← Database schema (import in phpMyAdmin)
├── deploy.sh          ← Build + zip script
└── README.md
```

## Local Development

```bash
# 1. Install frontend dependencies
cd frontend && npm install

# 2. Start PHP backend (requires PHP installed)
cd ../backend && php -S localhost:8080 &

# 3. Start React dev server (proxies /api to PHP)
cd ../frontend && npm run dev
```

## Build for Production

```bash
# From project root
./deploy.sh
```

This creates `cabuddy_hostinger.zip` ready for upload.

## Hostinger Deployment

### Step 1: Create Database
1. Go to **Hostinger hPanel → Databases → MySQL Databases**
2. Database: `u110415653_cabuddy`, User: `u110415653_admin2`

### Step 2: Import Schema
1. Go to **phpMyAdmin** → Select your database
2. Click **Import** → Upload `schema.sql` → Execute

### Step 3: Upload Files
1. Go to **File Manager** → `public_html/`
2. Upload `cabuddy_hostinger.zip`
3. Right-click → **Extract**

### Step 4: Verify
1. Test DB: `https://yourdomain.com/api/test_db.php`
2. Login: `https://yourdomain.com/` → `cabuddy@gmail.com` / `12345678`

## Credentials

- **Admin**: cabuddy@gmail.com / 12345678
- **DB Host**: localhost
- **DB Name**: u110415653_cabuddy
- **DB User**: u110415653_admin2
