# ☁️ Oracle Cloud Infrastructure Setup Guide

## Overview

This guide walks you through setting up all OCI services for production deployment.
Follow each step in order — each service depends on the previous.

---

## Step 9.1 — Create a Compartment

A **Compartment** is a logical container for all your OCI resources.

1. Go to **OCI Console** → **Identity & Security** → **Compartments**
2. Click **Create Compartment**
3. Name: `ScalableHostingProject`
4. Description: `Student Portal Project Resources`
5. Click **Create**

> 💡 All resources (Compute, Object Storage, ATP, etc.) will be created inside this compartment.

---

## Step 9.2 — Create a Virtual Cloud Network (VCN)

A **VCN** is your private network in Oracle Cloud, like an AWS VPC.

1. Go to **Networking** → **Virtual Cloud Networks**
2. Click **Start VCN Wizard** → **Create VCN with Internet Connectivity**
3. Settings:
   - VCN Name: `portal-vcn`
   - Compartment: `ScalableHostingProject`
   - VCN CIDR: `10.0.0.0/16`
   - Public subnet CIDR: `10.0.0.0/24`
   - Private subnet CIDR: `10.0.1.0/24`
4. Click **Create**

This creates:
- 1 VCN
- 1 Public subnet (for Load Balancer and Compute)
- 1 Private subnet (for ATP Database)
- Internet Gateway
- Route Tables + Security Lists

---

## Step 9.3 — Configure Security Rules

Security Lists control which ports are open.

Navigate to your VCN → **Security Lists** → **Default Security List**

Add **Ingress Rules**:

| Source CIDR | Protocol | Port | Purpose |
|-------------|----------|------|---------|
| 0.0.0.0/0 | TCP | 22 | SSH access |
| 0.0.0.0/0 | TCP | 80 | HTTP |
| 0.0.0.0/0 | TCP | 443 | HTTPS |
| 0.0.0.0/0 | TCP | 5000 | Node.js app (dev/test) |

---

## Step 9.4 — Create Compute Instance (VM)

This is the server that runs your Node.js backend.

1. Go to **Compute** → **Instances** → **Create Instance**
2. Settings:
   - Name: `portal-backend-vm`
   - Compartment: `ScalableHostingProject`
   - Image: **Oracle Linux 8** or **Ubuntu 22.04**
   - Shape: `VM.Standard.E4.Flex` (1 OCPU, 6GB RAM — enough for demo)
   - VCN: `portal-vcn`
   - Subnet: **Public subnet**
   - Public IP: **Assign**
3. Add your **SSH public key** (for remote login)
4. Click **Create**

### Deploy App on VM (SSH in):
```bash
ssh opc@<your-vm-public-ip>

# Install Node.js
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Clone your project
git clone https://github.com/yourusername/oracle-cloud-project.git
cd oracle-cloud-project/backend
npm install --production

# Copy .env and fill in OCI values
cp .env.example .env
nano .env

# Start with PM2 (process manager)
sudo npm install -g pm2
pm2 start server.js --name portal
pm2 startup
pm2 save
```

---

## Step 9.5 — Create Object Storage Bucket

**Object Storage** stores uploaded files (PDFs, ZIPs, images).

1. Go to **Storage** → **Object Storage & Archive Storage** → **Buckets**
2. Click **Create Bucket**
3. Settings:
   - Bucket Name: `student-portal-files`
   - Compartment: `ScalableHostingProject`
   - Storage Tier: **Standard**
   - Versioning: **Disabled** (for simplicity)
4. Click **Create**

### Pre-Authenticated Requests (PAR)
To allow users to download files securely without exposing bucket credentials:
1. Click the bucket → **Pre-Authenticated Requests** → **Create**
2. Set expiration and object prefix
3. Use the PAR URL in your API response

---

## Step 9.6 — Create Autonomous Database (ATP)

**Oracle Autonomous Database** manages your Users, Projects, and Files metadata.

1. Go to **Oracle Database** → **Autonomous Database** → **Create Autonomous Database**
2. Settings:
   - Display Name: `PortalDB`
   - Database Name: `PORTALDB`
   - Workload Type: **Transaction Processing (ATP)**
   - Deployment: **Serverless**
   - OCPU count: 1
   - Storage: 1 TB
   - Password: Set a strong password (≥12 chars, mixed case, number, special)
3. Click **Create**

### Connect Node.js to ATP:
```bash
# Install Oracle DB driver
npm install oracledb

# Download ATP Wallet from OCI Console
# ATP Instance → DB Connection → Download Wallet
```

In `backend/db/database.js` (production):
```js
const oracledb = require('oracledb');

async function getDB() {
  return oracledb.getConnection({
    user: process.env.ORACLE_USER,
    password: process.env.ORACLE_PASSWORD,
    connectString: process.env.ORACLE_DSN,
    walletLocation: './wallet',
    walletPassword: process.env.WALLET_PASSWORD
  });
}
```

---

## Step 9.7 — Set Up OCI API Gateway

**API Gateway** provides a governed HTTPS endpoint with authentication, CORS, and rate limiting.

1. Go to **Developer Services** → **API Management** → **Gateways**
2. Click **Create Gateway**
   - Name: `portal-api-gateway`
   - Type: **Public**
   - VCN + Public Subnet
3. Create a **Deployment**:
   - Path prefix: `/api`
   - Route all `/api/*` to backend VM `http://<vm-ip>:5000/api/*`

Benefits over direct VM access:
- TLS termination (HTTPS)
- Request authentication
- Usage plans and rate limiting
- Request/response transformation

---

## Step 9.8 — Set Up Load Balancer

**Load Balancer** distributes requests across multiple backend VMs for scalability.

1. Go to **Networking** → **Load Balancers** → **Create Load Balancer**
2. Settings:
   - Name: `portal-lb`
   - Shape: `Flexible` — min 10 Mbps, max 100 Mbps
   - VCN + Public subnet
3. **Backend Set**:
   - Policy: **Round Robin**
   - Add backend: `portal-backend-vm:5000`
4. **Listener**:
   - Protocol: HTTP, Port 80
   - (Add HTTPS listener on port 443 with SSL certificate)
5. **Health Check**:
   - URL: `/api/health`
   - HTTP 200 = healthy

### Scaling:
Add more VMs and add them to the backend set. The LB automatically distributes traffic.

```
[Client] → [Load Balancer :80] → [VM-1 :5000]
                               → [VM-2 :5000]
                               → [VM-3 :5000]
```

---

## Step 9.9 — OCI Monitoring & Logging

1. Go to **Observability & Management** → **Monitoring**
2. Create **Alarms**:
   - CPU > 80% for 10 min → Email alert
   - Memory > 85% → PagerDuty
3. **Logging**:
   - Enable VCN Flow Logs
   - Enable Application Logs (from Compute)
4. **Dashboards**:
   - Create metrics chart: requests/second, error rate, latency

---

## OCI Services Cost Estimate (Free Tier)

| Service | Free Tier |
|---------|-----------|
| Compute | 2× `VM.Standard.E2.1.Micro` always free |
| Object Storage | 20 GB always free |
| Autonomous DB | 1 ATP (20 GB) always free |
| Load Balancer | 10 Mbps always free |
| API Gateway | 1M API calls/month free |

> Start with **Always Free** resources — sufficient for demo/assignment.
