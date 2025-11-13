# MCP Inspector Wrapper

A production-ready wrapper for `@modelcontextprotocol/inspector` with Kubernetes-compatible health check endpoint.

## 🎯 Overview

This wrapper runs the MCP Inspector with everything accessible on a **single port (3000)**:
- Health check endpoints (`/health`, `/healthz`)
- MCP Inspector UI (proxied to port 3000)
- MCP Inspector Server (internal port 6277)
- **Authentication disabled by default** for easier access through proxy

Perfect for Kubernetes/Pod deployments with built-in health probes.

---

## 🚀 Quick Start

### 1. Install Dependencies
```bash
npm install
```

### 2. Run the Application
```bash
npm start
```

### 3. Access the Application
- **MCP Inspector UI**: http://localhost:3000 (no token required!)
- **Health Check**: http://localhost:3000/health (returns "ok")
- **Detailed Health**: http://localhost:3000/healthz (returns JSON)

**Note**: Authentication is disabled by default (`DANGEROUSLY_OMIT_AUTH=true`) so you can access the UI directly without needing a token. This is safe in containerized/pod environments with network isolation.

---

## 📦 Available Commands

| Command | Description |
|---------|-------------|
| `npm start` | Start the application (production mode) |
| `npm run dev` | Start with debug environment variables |
| `npm run build` | Copy package.json and node_modules to `dist/` folder |

---

## 🔧 Environment Variables

Configure via `.env` file or environment:

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Node environment |
| `NODE_TLS_REJECT_UNAUTHORIZED` | `0` | TLS certificate validation (0=disabled) |
| `DEBUG` | `1` | Enable debug mode |
| `PORT` | `3000` | Main application port (health + UI) |
| `SERVER_PORT` | `6277` | MCP Inspector server port (internal) |
| `MCP_AUTO_OPEN_ENABLED` | `false` | Auto-open browser on startup |
| `DANGEROUSLY_OMIT_AUTH` | `true` | Disable auth token requirement |

### About Authentication

By default, `DANGEROUSLY_OMIT_AUTH=true` is set, which disables the authentication token requirement. This means:
- ✅ You can access http://localhost:3000 directly without a token
- ✅ Simpler to use in containerized environments
- ⚠️ Should only be used in trusted/isolated networks (like Kubernetes pods)

If you need authentication enabled, set `DANGEROUSLY_OMIT_AUTH=false` in your `.env` file.

---

## 🏥 Health Check Endpoints

### `/health`
Returns HTTP 200 with plain text "ok" - perfect for Kubernetes probes.

```bash
curl http://localhost:3000/health
# Response: ok
```

### `/healthz`
Returns HTTP 200 with detailed JSON health information.

```bash
curl http://localhost:3000/healthz
# Response: {"status":"ok","timestamp":"...","service":"mcp-inspector-wrapper",...}
```

---

## ☸️ Kubernetes/Pod Deployment

The application is designed to work with standard Kubernetes deployments.

### Complete Pod Configuration Example

```yaml
apiVersion: v1
kind: Pod
metadata:
  name: mcp-inspector
spec:
  containers:
  - name: mcp-inspector
    image: your-registry/mcp-inspector-wrapper:latest
    command: ["npm", "start"]
    ports:
    - containerPort: 3000
      name: app
    - containerPort: 6277
      name: server
    env:
    - name: NODE_TLS_REJECT_UNAUTHORIZED
      value: "0"
    - name: NODE_ENV
      value: "production"
    - name: PORT
      value: "3000"
    - name: MCP_AUTO_OPEN_ENABLED
      value: "false"
    - name: DANGEROUSLY_OMIT_AUTH
      value: "true"  # Safe in isolated pod network
    livenessProbe:
      httpGet:
        path: /health
        port: 3000
      initialDelaySeconds: 30
      periodSeconds: 10
    readinessProbe:
      httpGet:
        path: /health
        port: 3000
      initialDelaySeconds: 15
      periodSeconds: 5
```

### Key Points
- **Start Command**: `npm start` (already configured)
- **Main Port**: `3000` (health check + UI)
- **Health Probe**: Points to `/health` on port 3000
- **Authentication**: Disabled by default for easier pod access
- **No Docker/K8s config changes needed**

---

## 📊 Architecture

```
┌─────────────────────────────────────────┐
│         Port 3000 (External)            │
├─────────────────────────────────────────┤
│  GET /health    → "ok" (200)            │
│  GET /healthz   → JSON health info      │
│  GET /*         → MCP Inspector UI      │
│                   (proxied internally)  │
│                   NO AUTH TOKEN NEEDED  │
└─────────────────────────────────────────┘
              ↓ (proxy)
┌─────────────────────────────────────────┐
│  Port 6274 - MCP Inspector Client       │
│  (internal, not exposed)                │
│  Auth disabled via DANGEROUSLY_OMIT_AUTH│
└─────────────────────────────────────────┘

┌─────────────────────────────────────────┐
│  Port 6277 - MCP Inspector Server       │
│  (internal communication)               │
└─────────────────────────────────────────┘
```

### How It Works
1. MCP Inspector starts internally on port 6274 (client) and 6277 (server)
2. Authentication is disabled via `DANGEROUSLY_OMIT_AUTH=true`
3. Express proxy server runs on port 3000:
   - `/health` and `/healthz` return immediate responses
   - All other requests are proxied to the MCP Inspector UI
4. No authentication token required - direct access to UI

---

## 🧪 Testing

### Test Health Endpoint
```bash
npm start

# In another terminal
curl http://localhost:3000/health
# Expected: ok (HTTP 200)
```

### Test UI Access (No Token Needed!)
```bash
# Open in browser
open http://localhost:3000

# Or test with curl
curl http://localhost:3000/
# Expected: HTML of MCP Inspector
```

### Or use the included test script
```bash
chmod +x test-health.sh
./test-health.sh
```

---

## 🛠️ Troubleshooting

### "Invalid origin" errors in logs
These are normal and can be ignored. They occur because the proxy changes the origin header, but the inspector still functions correctly.

### Health Check Fails
1. Verify the server is running:
   ```bash
   npm start
   ```
2. Check the port is accessible:
   ```bash
   curl http://localhost:3000/health
   ```
3. Ensure port 3000 is not in use:
   ```bash
   lsof -i :3000
   ```

### Inspector Not Starting
1. Check environment variables in `.env`
2. Ensure Node.js version is 18 or higher: `node --version`
3. Clear and reinstall dependencies:
   ```bash
   rm -rf node_modules package-lock.json
   npm install
   ```

### Need Authentication?
If you want to enable authentication, set `DANGEROUSLY_OMIT_AUTH=false` in your `.env` file. The inspector will then generate a token that appears in the startup logs.

---

## 📁 Project Structure

```
mcp-inspector/
├── server.js              # Main wrapper with health endpoint & proxy
├── package.json           # Dependencies and scripts
├── package-lock.json      # Locked dependencies
├── .env                   # Environment configuration
├── .gitignore            # Git ignore rules
├── README.md             # This file
├── test-health.sh        # Health check test script
└── Dockerfile.example    # Optional Docker file
```

---

## 🐳 Docker Support (Optional)

An example Dockerfile is provided as `Dockerfile.example`:

```bash
# Build the image
docker build -f Dockerfile.example -t mcp-inspector-wrapper .

# Run the container
docker run -p 3000:3000 -p 6277:6277 mcp-inspector-wrapper
```

---

## 📝 Command Reference

**Original command this wraps:**
```bash
NODE_TLS_REJECT_UNAUTHORIZED=0 NODE_ENV=development DEBUG=1 npx @modelcontextprotocol/inspector
```

**Now simply run:**
```bash
npm start
```

All environment variables are pre-configured in `.env`, and authentication is disabled for easier access.

---

## 🔒 Security Notes

### Authentication Disabled by Default
- `DANGEROUSLY_OMIT_AUTH=true` means no authentication token is required
- This is **safe** in isolated environments (Kubernetes pods with network policies)
- **Do NOT expose port 3000 to the public internet** with auth disabled
- For production external access, consider:
  - Using network policies to restrict access
  - Enabling authentication by setting `DANGEROUSLY_OMIT_AUTH=false`
  - Putting the service behind an authenticated reverse proxy

---

## ✅ Production Ready

- ✅ Health endpoint returns HTTP 200 with "ok"
- ✅ Runs via `npm start` (pod-compatible)
- ✅ Both client and server components launch automatically
- ✅ Environment variables properly set
- ✅ Graceful shutdown on SIGTERM/SIGINT
- ✅ Single port for simplified deployment
- ✅ Authentication disabled for easy pod access
- ✅ No Docker/Kubernetes config changes needed

---

## 📄 License

MIT
