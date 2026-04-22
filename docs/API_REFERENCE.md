# 📡 API Reference — Student Project Portal

Base URL (local): `http://localhost:5000/api`
Base URL (OCI):   `https://your-api-gateway.oci.customer-oci.com/api`

All protected routes require:
```
Authorization: Bearer <JWT_TOKEN>
```

---

## Auth Endpoints

### POST /auth/register
Create a new user account.

**Request Body:**
```json
{
  "name": "Ayush Sharma",
  "email": "ayush@university.edu",
  "password": "mysecretpassword"
}
```

**Response 201:**
```json
{
  "message": "Account created successfully",
  "token": "eyJhbGci...",
  "user": {
    "user_id": "uuid",
    "name": "Ayush Sharma",
    "email": "ayush@university.edu"
  }
}
```

**Errors:** `400` (missing fields), `409` (email taken)

---

### POST /auth/login
Login and receive a JWT token.

**Request Body:**
```json
{
  "email": "ayush@university.edu",
  "password": "mysecretpassword"
}
```

**Response 200:**
```json
{
  "message": "Login successful",
  "token": "eyJhbGci...",
  "user": { "user_id": "...", "name": "...", "email": "..." }
}
```

**Errors:** `401` (invalid credentials)

---

### GET /auth/me 🔒
Get currently logged-in user's profile.

**Response 200:**
```json
{
  "user": {
    "user_id": "uuid",
    "name": "Ayush Sharma",
    "email": "ayush@university.edu",
    "created_at": "2025-01-15T12:00:00Z"
  }
}
```

---

## Project Endpoints

### POST /projects 🔒
Submit a new project.

**Request Body:**
```json
{
  "title": "OCI Scalable Portal",
  "description": "Student project submission system on Oracle Cloud",
  "tech_stack": "Node.js, OCI Compute, Object Storage, ATP"
}
```

**Response 201:**
```json
{
  "message": "Project submitted successfully",
  "project": {
    "project_id": "uuid",
    "user_id": "uuid",
    "title": "OCI Scalable Portal",
    "description": "...",
    "tech_stack": "...",
    "status": "submitted",
    "created_at": "2025-01-15T12:05:00Z"
  }
}
```

---

### GET /projects 🔒
List all projects for the authenticated user.

**Response 200:**
```json
{
  "projects": [
    {
      "project_id": "uuid",
      "title": "OCI Scalable Portal",
      "status": "submitted",
      "file_count": 2,
      "created_at": "2025-01-15T12:05:00Z"
    }
  ]
}
```

---

### GET /projects/:id 🔒
Get a single project with all its files.

**Response 200:**
```json
{
  "project": { "project_id": "...", "title": "...", ... },
  "files": [
    {
      "file_id": "uuid",
      "original_name": "report.pdf",
      "object_name": "abc123.pdf",
      "bucket_name": "student-portal-files",
      "file_size": 204800,
      "mime_type": "application/pdf",
      "uploaded_at": "2025-01-15T12:10:00Z",
      "url": "http://localhost:5000/uploads/abc123.pdf"
    }
  ]
}
```

---

### PUT /projects/:id 🔒
Update a project (owner only).

**Request Body (any field optional):**
```json
{
  "title": "Updated Title",
  "description": "New description",
  "tech_stack": "React, Node.js, OCI"
}
```

**Response 200:**
```json
{ "message": "Project updated", "project": { ... } }
```

---

### DELETE /projects/:id 🔒
Delete a project and all its files.

**Response 200:**
```json
{ "message": "Project deleted successfully" }
```

---

## File Endpoints

### POST /files/upload/:projectId 🔒
Upload a file to a project.

**Content-Type:** `multipart/form-data`
**Form field:** `file` (the file to upload)

**Allowed types:** PDF, ZIP, PNG, JPG, GIF, TXT, DOC, DOCX
**Max size:** 20 MB

**Response 201:**
```json
{
  "message": "File uploaded successfully",
  "file": {
    "file_id": "uuid",
    "project_id": "uuid",
    "original_name": "project_report.pdf",
    "object_name": "abc123-uuid.pdf",
    "bucket_name": "local",
    "file_size": 102400,
    "mime_type": "application/pdf",
    "uploaded_at": "2025-01-15T12:10:00Z"
  },
  "url": "http://localhost:5000/uploads/abc123-uuid.pdf",
  "note": "In production, this will be an OCI Object Storage PAR URL"
}
```

**Errors:** `400` (no file / wrong type), `404` (project not found)

---

### GET /files/:projectId 🔒
List all files for a project.

**Response 200:**
```json
{
  "files": [
    {
      "file_id": "uuid",
      "original_name": "report.pdf",
      "url": "http://localhost:5000/uploads/abc.pdf",
      ...
    }
  ]
}
```

---

### DELETE /files/:fileId 🔒
Delete a file (removes from DB and local disk; in OCI removes from Object Storage).

**Response 200:**
```json
{ "message": "File deleted successfully" }
```

---

## Health Check

### GET /health
Used by OCI Load Balancer as a health probe. No auth required.

**Response 200:**
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T12:00:00.000Z",
  "service": "student-portal-backend",
  "environment": "development"
}
```

> The OCI Load Balancer polls this endpoint every 30 seconds. If it returns non-200, the instance is removed from rotation until healthy again.

---

## Error Response Format

All errors return:
```json
{
  "error": "Human-readable error message"
}
```

| Status | Meaning |
|--------|---------|
| 400 | Bad Request — missing or invalid fields |
| 401 | Unauthorized — no or invalid token |
| 403 | Forbidden — token expired or tampered |
| 404 | Not Found — resource doesn't exist |
| 409 | Conflict — e.g., email already exists |
| 500 | Internal Server Error |
