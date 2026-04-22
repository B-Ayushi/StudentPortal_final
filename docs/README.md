# 📘 Student Project Submission Portal
### Built on Oracle Cloud Infrastructure (OCI)

A full-stack scalable web application demonstrating core OCI services:
**OCI Compute** • **Object Storage** • **Autonomous Database** • **API Gateway** • **Load Balancer**

---

## 🗂 Project Structure

```
oracle-cloud-project/
├── frontend/               ← HTML + CSS + JavaScript (SPA)
│   ├── index.html
│   ├── style.css
│   └── app.js
├── backend/                ← Node.js Express REST API
│   ├── server.js           ← Entry point
│   ├── package.json
│   ├── .env                ← Environment config (local dev)
│   ├── .env.example        ← Template for OCI prod
│   ├── db/
│   │   └── database.js     ← SQLite (dev) / Oracle ATP (prod)
│   ├── middleware/
│   │   └── auth.js         ← JWT verification
│   ├── routes/
│   │   ├── auth.js         ← Register / Login / Me
│   │   ├── projects.js     ← CRUD for submissions
│   │   └── files.js        ← Upload / List / Delete files
│   └── uploads/            ← Local file storage (dev only)
├── docs/
│   ├── README.md           ← This file
│   ├── HOW_TO_RUN.md       ← Run locally step by step
│   ├── OCI_SETUP.md        ← Oracle Cloud setup guide
│   └── API_REFERENCE.md    ← All REST endpoints documented
└── architecture/           ← Diagrams and OCI reference
```

---

## 🚀 Quick Start (Local)

```bash
cd oracle-cloud-project/backend
npm install
npm run dev
```
Open browser at **http://localhost:5000**

---

## 🏗️ Architecture Overview

```
[Browser]
    │
    ▼
[OCI Load Balancer]          ← Distributes traffic (scaling)
    │
    ├──▶ [VM Instance #1]
    ├──▶ [VM Instance #2]    ← Horizontal scale
    └──▶ [VM Instance #N]
              │
              ├──▶ [OCI API Gateway]         ← Auth, rate limit, CORS
              │
              ├──▶ [Oracle Autonomous DB]    ← Users, Projects, Files metadata
              │
              └──▶ [OCI Object Storage]      ← Uploaded files (PDF, ZIP, images)
```

---

## 🔌 REST API Summary

| Method | Endpoint | Description | Auth |
|--------|----------|-------------|------|
| POST | /api/auth/register | Create account | ❌ |
| POST | /api/auth/login | Login, get JWT | ❌ |
| GET | /api/auth/me | My profile | ✅ |
| POST | /api/projects | Submit project | ✅ |
| GET | /api/projects | My submissions | ✅ |
| GET | /api/projects/:id | Single project + files | ✅ |
| PUT | /api/projects/:id | Update project | ✅ |
| DELETE | /api/projects/:id | Delete project | ✅ |
| POST | /api/files/upload/:projectId | Upload file | ✅ |
| GET | /api/files/:projectId | List files | ✅ |
| DELETE | /api/files/:fileId | Delete file | ✅ |
| GET | /api/health | Health check (LB probe) | ❌ |

---

## 🗄️ Database Schema

```sql
-- Users Table
CREATE TABLE users (
  user_id      TEXT PRIMARY KEY,
  name         TEXT NOT NULL,
  email        TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Projects Table
CREATE TABLE projects (
  project_id  TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(user_id),
  title       TEXT NOT NULL,
  description TEXT,
  tech_stack  TEXT,
  status      TEXT DEFAULT 'submitted',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Files Table (metadata only — actual file in Object Storage)
CREATE TABLE files (
  file_id       TEXT PRIMARY KEY,
  project_id    TEXT NOT NULL REFERENCES projects(project_id),
  original_name TEXT NOT NULL,
  object_name   TEXT NOT NULL,   -- OCI Object key
  bucket_name   TEXT NOT NULL,   -- OCI Bucket name
  file_size     INTEGER,
  mime_type     TEXT,
  uploaded_at   DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

---

## 🌩️ OCI Migration Path

| Component | Local (Dev) | Production (OCI) |
|-----------|-------------|-----------------|
| Database | SQLite file (portal.sqlite) | Oracle Autonomous Database |
| File Storage | `/backend/uploads/` folder | OCI Object Storage bucket |
| Hosting | localhost:5000 | OCI Compute Instance VM |
| API Security | None | OCI API Gateway |
| Scaling | Single process | OCI Load Balancer + multiple VMs |
| Auth | JWT (self-managed) | OCI IAM / Identity Domains |
| Monitoring | Console logs | OCI Monitoring + Logging |

---

## 👥 Tech Stack

- **Frontend**: Vanilla HTML5, CSS3, JavaScript (ES2020)
- **Backend**: Node.js 18+, Express 4
- **Database (local)**: better-sqlite3
- **Database (cloud)**: Oracle Autonomous Transaction Processing (ATP)
- **Auth**: bcryptjs + JSON Web Tokens
- **File Upload**: multer
- **OCI Services**: Compute, Object Storage, ATP, API Gateway, Load Balancer
