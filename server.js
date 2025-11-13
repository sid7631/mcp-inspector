#!/usr/bin/env node

import express from 'express';
import { spawn } from 'child_process';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set environment variables with defaults
process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DEBUG = process.env.DEBUG || '1';

// Port configuration - everything runs on port 3000
const PORT = process.env.PORT || 8080; // Main port for health check + UI
const INSPECTOR_CLIENT_PORT = 6274; // Internal port for inspector client (don't change)
const SERVER_PORT = process.env.SERVER_PORT || 6277; // Internal port for inspector server

// Set a dummy token to satisfy the proxy - auth is disabled anyway
const DUMMY_TOKEN = 'wrapper-no-auth-needed';

console.log('🚀 Starting MCP Inspector Wrapper...');
console.log(`Environment: NODE_ENV=${process.env.NODE_ENV}`);
console.log(`TLS Reject Unauthorized: ${process.env.NODE_TLS_REJECT_UNAUTHORIZED}`);
console.log(`Debug Mode: ${process.env.DEBUG}`);

// Create Express server with health check and proxy
const app = express();

// Health check endpoints (these respond immediately)
app.get('/health', (req, res) => {
  res.status(200).send('ok');
});

app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'mcp-inspector-wrapper',
    port: PORT,
    inspector: {
      serverPort: SERVER_PORT
    }
  });
});

// Proxy routes for MCP server endpoints (so they're accessible on port 8080)
// This allows external access to the inspector's proxy server through port 8080
app.use('/mcp', createProxyMiddleware({
  target: `http://localhost:${SERVER_PORT}`,
  changeOrigin: true,
  pathRewrite: {
    '^/mcp': '', // Remove /mcp prefix when forwarding
  },
  ws: true,
  logLevel: 'silent',
}));

// Add a message endpoint proxy as well
app.post('/message', createProxyMiddleware({
  target: `http://localhost:${SERVER_PORT}`,
  changeOrigin: true,
  ws: false,
  logLevel: 'silent',
}));

// Start the MCP Inspector in the background
console.log('\n🔧 Starting MCP Inspector...');
console.log(`   - Inspector client running internally on port ${INSPECTOR_CLIENT_PORT}`);
console.log(`   - Inspector server running on port ${SERVER_PORT}`);

const inspector = spawn('npx', ['@modelcontextprotocol/inspector'], {
  env: {
    ...process.env,
    CLIENT_PORT: INSPECTOR_CLIENT_PORT,
    SERVER_PORT,
    // Set allowed origins to include our wrapper port
    ALLOWED_ORIGINS: `http://localhost:${PORT},http://localhost:${INSPECTOR_CLIENT_PORT}`,
    // Set a consistent token for internal communication
    MCP_PROXY_AUTH_TOKEN: DUMMY_TOKEN,
    // Disable auto-opening browser in production
    MCP_AUTO_OPEN_ENABLED: process.env.MCP_AUTO_OPEN_ENABLED || 'false',
    // Disable authentication for easier access through proxy
    DANGEROUSLY_OMIT_AUTH: process.env.DANGEROUSLY_OMIT_AUTH || 'true'
  },
  stdio: 'inherit',
  shell: true
});

inspector.on('error', (error) => {
  console.error('❌ Failed to start MCP Inspector:', error);
  process.exit(1);
});

inspector.on('exit', (code) => {
  console.log(`\n⚠️  MCP Inspector exited with code ${code}`);
  if (code !== 0 && code !== null) {
    process.exit(code);
  }
});

// Wait for inspector to start, then set up proxy
setTimeout(() => {
  console.log('\n🔗 Setting up proxy to MCP Inspector...');
  
  // IMPORTANT: Specific routes must come BEFORE the catch-all proxy
  
  // Proxy routes for MCP server endpoints (so they're accessible on port 8080)
  // This allows external access to the inspector's proxy server through port 8080
  app.use('/mcp', createProxyMiddleware({
    target: `http://localhost:${SERVER_PORT}`,
    changeOrigin: true,
    pathRewrite: {
      '^/mcp': '', // Remove /mcp prefix when forwarding
    },
    ws: true,
    logLevel: 'silent',
  }));

  // Add a message endpoint proxy as well
  app.post('/message', createProxyMiddleware({
    target: `http://localhost:${SERVER_PORT}`,
    changeOrigin: true,
    ws: false,
    logLevel: 'silent',
  }));
  
  // Proxy all OTHER requests to the MCP Inspector client UI (catch-all - must be last)
  app.use('/', createProxyMiddleware({
    target: `http://localhost:${INSPECTOR_CLIENT_PORT}`,
    changeOrigin: true,
    ws: true, // Proxy websockets
    logLevel: 'silent',
    onProxyReq: (proxyReq, req, res) => {
      // Add the auth token to proxied requests if needed
      if (process.env.DANGEROUSLY_OMIT_AUTH !== 'true') {
        proxyReq.setHeader('Authorization', `Bearer ${DUMMY_TOKEN}`);
      }
    },
    onError: (err, req, res) => {
      console.error('Proxy error:', err.message);
      res.status(502).json({ 
        error: 'MCP Inspector not available',
        message: 'The inspector may still be starting up. Please wait a moment and refresh.'
      });
    }
  }));

  // Start the unified server on port 3000
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Server running on port ${PORT}`);
    console.log(`   - GET /health - Returns 200 with "ok"`);
    console.log(`   - GET /healthz - Returns detailed health info`);
    console.log(`   - All other routes - Proxied to MCP Inspector UI`);
    console.log(`\n📍 Access Points:`);
    console.log(`   - Health Check: http://localhost:${PORT}/health`);
    console.log(`   - MCP Inspector UI: http://localhost:${PORT}`);
    console.log(`   - Inspector Server: http://localhost:${SERVER_PORT}`);
    console.log(`\n✨ MCP Inspector Wrapper is running on port ${PORT}`);
  });
}, 5000); // Wait 5 seconds for inspector to start

// Handle shutdown gracefully
const shutdown = (signal) => {
  console.log(`\n📡 Received ${signal}, shutting down gracefully...`);
  inspector.kill(signal);
  process.exit(0);
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
