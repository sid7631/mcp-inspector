#!/usr/bin/env node

import express from 'express';
import { spawn } from 'child_process';
import { createProxyMiddleware } from 'http-proxy-middleware';
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Set environment variables with defaults
process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED || '0';
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.DEBUG = process.env.DEBUG || '1';

// Port configuration
const PORT = process.env.PORT || 8080; // Main port for everything
const INSPECTOR_CLIENT_PORT = 6274; // Internal port for inspector client (don't change)
const SERVER_PORT = process.env.SERVER_PORT || 6277; // Internal port for inspector server

console.log('🚀 Starting MCP Inspector Wrapper...');
console.log(`Environment: NODE_ENV=${process.env.NODE_ENV}`);
console.log(`Main Port: ${PORT}`);

// Create Express server
const app = express();

// Health check endpoints
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.get('/healthz', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'mcp-inspector-wrapper',
    port: PORT,
    inspector: {
      clientPort: INSPECTOR_CLIENT_PORT,
      serverPort: SERVER_PORT
    }
  });
});

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
    // Disable auto-opening browser
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

// Wait for inspector to start, then set up proxies
setTimeout(() => {
  console.log('\n🔗 Setting up proxies...');
  
  // Proxy /mcp/* to the inspector's server port
  // Express strips /mcp mount point: /mcp → /, /mcp/mcp → /mcp
  // We need to restore /mcp prefix for paths that become /
  app.use('/mcp', createProxyMiddleware({
    target: `http://localhost:${SERVER_PORT}`,
    changeOrigin: true,
    ws: true,
    logLevel: 'silent',
    pathRewrite: (path) => {
      // If path is /, /?, or empty, restore the /mcp prefix
      return (path === '/' || path === '' || path.startsWith('/?')) ? 
        path.replace('/', '/mcp') : path;
    },
  }));

  // Proxy /message endpoint for SSE messages
  app.post('/message', createProxyMiddleware({
    target: `http://localhost:${SERVER_PORT}`,
    changeOrigin: true,
    ws: false,
    logLevel: 'silent',
  }));
  
  // Proxy all OTHER requests to the MCP Inspector client UI
  // For the root path, redirect with MCP_PROXY_PORT to auto-configure the inspector
  app.use('/', (req, res, next) => {
    // For the root path without query params, redirect with MCP_PROXY_PORT
    // This tells the inspector to use http://localhost:8080 instead of localhost:6277
    if (req.path === '/' && Object.keys(req.query).length === 0) {
      res.redirect(`/?MCP_PROXY_PORT=${PORT}`);
      return;
    }
    
    // Otherwise, proxy to the inspector client
    createProxyMiddleware({
      target: `http://localhost:${INSPECTOR_CLIENT_PORT}`,
      changeOrigin: true,
      ws: true,
      logLevel: 'silent',
      onError: (err, req, res) => {
        console.error('Proxy error:', err.message);
        if (!res.headersSent) {
          res.status(502).json({ 
            error: 'MCP Inspector not available',
            message: 'The inspector may still be starting up. Please wait a moment and refresh.'
          });
        }
      }
    })(req, res, next);
  });

  // Start the unified server
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n✅ Server running on port ${PORT}`);
    console.log(`   - GET /health - Returns 200 with JSON`);
    console.log(`   - GET /healthz - Returns detailed health info`);
    console.log(`   - GET /mcp/* - Proxies to MCP server (port ${SERVER_PORT})`);
    console.log(`   - GET /* - Proxied to MCP Inspector UI`);
    console.log(`\n📍 Access Points:`);
    console.log(`   - Health Check: http://localhost:${PORT}/health`);
    console.log(`   - MCP Inspector UI: http://localhost:${PORT}`);
    console.log(`   - MCP Proxy: http://localhost:${PORT}/mcp`);
    console.log(`\n✨ MCP Inspector Wrapper is running!`);
    console.log(`\n💡 The inspector is auto-configured to use port ${PORT} (via MCP_PROXY_PORT query param)`);
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
