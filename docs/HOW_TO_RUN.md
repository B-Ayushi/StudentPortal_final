# 🚀 How to Run — Student Portal (Render + Supabase)

## Architecture Overview

```
Frontend (HTML/CSS/JS)
        │
        ▼
Backend API (Node.js + Express)
  Hosted on: Render (Free Web Service)
        │
        ├──► Supabase PostgreSQL (Database)
        └──► Supabase Storage    (File Storage)
```

---

## STEP 1 — Set Up Supabase (Database + Storage)

### 1.1 Create a Supabase Project
1. Go to [https://supabase.com](https://supabase.com) → Sign Up (free)
2. Click **New Project**
3. Fill in:
   - **Name**: `student-portal`
   - **Database Password**: Choose a strong password (save it!)
   - **Region**: Choose nearest to you (e.g., South Asia)
4. Click **Create new project** — wait ~2 minutes

### 1.2 Get Your API Keys
1. In your project dashboard → **Project Settings** (gear icon)
2. Click **API** tab
3. Copy these values (you'll need them later):
   - **Project URL** → `SUPABASE_URL`
   - **anon / public key** → `SUPABASE_ANON_KEY`
   - **service_role / secret key** → `SUPABASE_SERVICE_KEY`

### 1.3 Get Your Database Connection String
1. **Project Settings** → **Database** tab
2. Scroll to **Connection string** → select **URI** tab
3. Copy the string (replace `[YOUR-PASSWORD]` with your DB password)
   → This is your `DATABASE_URL`

### 1.4 Create Supabase Storage Bucket
1. In your project → Left sidebar → **Storage**
2. Click **New bucket**
3. Name it: `project-files`
4. Toggle **Public bucket** → ON (so files have public URLs)
5. Click **Create bucket**

---

## STEP 2 — Run Locally (Development)

### 2.1 Clone / Extract the Project
```bash
# If you have the zip file, extract it:
unzip StudentPortal-Render-Supabase.zip
cd StudentPortal-Render-Supabase
```

### 2.2 Install Dependencies
```bash
cd backend
npm install
```

### 2.3 Create Your .env File
```bash
cp .env.example .env
```
Now open `.env` and fill in your Supabase values:
```
NODE_ENV=development
PORT=5000
JWT_SECRET=any_long_random_string_here

SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_ANON_KEY=eyJhbGci...
SUPABASE_SERVICE_KEY=eyJhbGci...
DATABASE_URL=postgresql://postgres:yourpassword@db.your-project-id.supabase.co:5432/postgres
```

### 2.4 Start the Server
```bash
npm run dev
```
You should see:
```
✅ Connected to Supabase PostgreSQL
✅ Database schema initialized
🚀 Student Portal running on http://localhost:5000
```

### 2.5 Open the App
Open your browser → [http://localhost:5000](http://localhost:5000)

---

## STEP 3 — Deploy to Render

### 3.1 Push Your Code to GitHub
```bash
git init
git add .
git commit -m "Student Portal - Render + Supabase"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/student-portal.git
git push -u origin main
```

### 3.2 Create a Render Web Service
1. Go to [https://render.com](https://render.com) → Sign Up (free)
2. Click **New +** → **Web Service**
3. Connect your GitHub account → Select your repository
4. Fill in the settings:
   - **Name**: `student-portal`
   - **Region**: Oregon (US West) or nearest
   - **Branch**: `main`
   - **Root Directory**: `backend`
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Free

### 3.3 Add Environment Variables in Render
In the Render dashboard → Your service → **Environment** tab:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `JWT_SECRET` | (a long random string) |
| `SUPABASE_URL` | (from Supabase dashboard) |
| `SUPABASE_ANON_KEY` | (from Supabase dashboard) |
| `SUPABASE_SERVICE_KEY` | (from Supabase dashboard) |
| `DATABASE_URL` | (from Supabase → Settings → Database) |

### 3.4 Deploy
1. Click **Create Web Service**
2. Render will build and deploy automatically (~3-5 minutes)
3. Your app URL will be: `https://student-portal-xxxx.onrender.com`

---

## STEP 4 — Test Your Deployment

Open your Render URL in a browser. Then test the API:

```bash
# Health check
curl https://your-app.onrender.com/api/health

# Register a user
curl -X POST https://your-app.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@test.com","password":"pass123"}'
```

---

## Project Structure

```
StudentPortal-Render-Supabase/
├── backend/
│   ├── db/
│   │   └── database.js       ← Supabase PostgreSQL connection
│   ├── middleware/
│   │   └── auth.js           ← JWT authentication middleware
│   ├── routes/
│   │   ├── auth.js           ← Register/Login endpoints
│   │   ├── projects.js       ← CRUD for projects
│   │   └── files.js          ← Upload to Supabase Storage
│   ├── .env.example          ← Copy to .env with your values
│   ├── package.json
│   └── server.js             ← Main Express app
├── frontend/
│   ├── index.html            ← Main UI
│   ├── app.js                ← Frontend JavaScript
│   └── style.css             ← Styling
├── render.yaml               ← Render deployment config
└── docs/
    ├── HOW_TO_RUN.md         ← This file
    └── API_REFERENCE.md      ← Full API documentation
```

---

## Common Issues

| Problem | Solution |
|---------|----------|
| `SSL error` connecting to DB | Make sure `ssl: { rejectUnauthorized: false }` is in database.js |
| `Cannot find module 'pg'` | Run `npm install` in the `backend/` folder |
| Files not uploading | Check that your Supabase bucket is named exactly `project-files` and is set to Public |
| Render app sleeping | Free tier sleeps after 15 min inactivity — first request takes ~30s to wake |
| `JWT_SECRET` error | Make sure `.env` has `JWT_SECRET` set |
