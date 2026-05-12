#!/usr/bin/env node
// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
const http = require('node:http');
const { URL } = require('node:url');
const { SSEServerTransport } = require('@modelcontextprotocol/sdk/server/sse.js');
const { createAwsCalculatorServer } = require('./mcp-server');

const host = process.env.HOST || '127.0.0.1';
const port = Number.parseInt(process.env.PORT || '8767', 10);
const ssePath = process.env.SSE_PATH || '/sse';
const messagesPath = process.env.MESSAGES_PATH || '/messages';
const healthPath = process.env.HEALTH_PATH || '/healthz';

const allowedHosts = splitEnv(process.env.ALLOWED_HOSTS);
const allowedOrigins = splitEnv(process.env.ALLOWED_ORIGINS);
const enableDnsRebindingProtection =
  allowedHosts.length > 0 || allowedOrigins.length > 0;

const sessions = new Map();

function splitEnv(value) {
  if (!value) return [];
  return value.split(',').map(item => item.trim()).filter(Boolean);
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  });
  res.end(body);
}

function notFound(res) {
  sendJson(res, 404, { error: 'not_found' });
}

async function handleSse(req, res) {
  const remote = req.socket?.remoteAddress || 'unknown';
  console.log(`SSE client connected from ${remote} (${req.method} ${req.url})`);
  const mcpServer = createAwsCalculatorServer();
  const transport = new SSEServerTransport(messagesPath, res, {
    enableDnsRebindingProtection,
    allowedHosts,
    allowedOrigins,
  });

  sessions.set(transport.sessionId, {
    transport,
    createdAt: new Date().toISOString(),
  });

  transport.onclose = () => {
    sessions.delete(transport.sessionId);
  };

  transport.onerror = error => {
    console.error('SSE transport error:', error);
  };

  try {
    await mcpServer.connect(transport);
  } catch (error) {
    sessions.delete(transport.sessionId);
    console.error('Failed to connect MCP server:', error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'mcp_connect_failed' });
    } else {
      res.end();
    }
  }
}

async function handleMessage(req, res, url) {
  const sessionId = url.searchParams.get('sessionId');
  if (!sessionId) {
    sendJson(res, 400, { error: 'missing_sessionId' });
    return;
  }

  const session = sessions.get(sessionId);
  if (!session) {
    sendJson(res, 404, { error: 'unknown_sessionId' });
    return;
  }

  try {
    await session.transport.handlePostMessage(req, res);
  } catch (error) {
    console.error('Failed to handle MCP message:', error);
    if (!res.headersSent) {
      sendJson(res, 500, { error: 'message_handling_failed' });
    }
  }
}

const httpServer = http.createServer((req, res) => {
  const url = new URL(req.url || '/', `http://${req.headers.host || host}`);

  if (req.method === 'GET' && url.pathname === healthPath) {
    sendJson(res, 200, {
      status: 'ok',
      transport: 'sse',
      sessions: sessions.size,
      paths: {
        sse: ssePath,
        messages: messagesPath,
        health: healthPath,
      },
    });
    return;
  }

  if (req.method === 'GET' && url.pathname === ssePath) {
    handleSse(req, res);
    return;
  }

  if (req.method === 'POST' && url.pathname === messagesPath) {
    handleMessage(req, res, url);
    return;
  }

  notFound(res);
});

httpServer.listen(port, host, () => {
  console.log(
    `AWS Pricing Calculator MCP SSE server listening on http://${host}:${port}${ssePath}`
  );
});

function shutdown(signal) {
  console.log(`Received ${signal}; closing ${sessions.size} SSE session(s).`);
  for (const session of sessions.values()) {
    session.transport.close().catch(error => {
      console.error('Failed to close SSE transport:', error);
    });
  }
  httpServer.close(error => {
    if (error) {
      console.error('HTTP server close failed:', error);
      process.exit(1);
    }
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
