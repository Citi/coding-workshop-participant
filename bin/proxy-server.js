#!/usr/bin/env node

/**
 * Development CORS Proxy Server
 *
 * This proxy server forwards requests from the React frontend (localhost:3000)
 * to Lambda Function URLs in LocalStack, working around CORS issues.
 *
 * Only needed for LocalStack development. AWS production handles CORS correctly.
 */

const http = require('http');
const https = require('https');
const url = require('url');
const fs = require('fs');
const path = require('path');

const PORT = 3001;

// Read endpoint mappings from .env.local
const envFile = path.join(__dirname, '../frontend/.env.local');
let endpoints = {};

try {
  const envContent = fs.readFileSync(envFile, 'utf8');
  const match = envContent.match(/REACT_APP_API_ENDPOINTS='(.+)'/);
  if (match) {
    endpoints = JSON.parse(match[1]);
    console.log('Loaded endpoints:', Object.keys(endpoints));
  }
} catch (err) {
  console.error('Could not load endpoints from .env.local:', err.message);
  console.error('Make sure to run: ./bin/generate-env.sh first');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');
  res.setHeader('Access-Control-Max-Age', '86400');

  // Handle preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Parse request path: /api/{endpoint_name}
  const parsedUrl = url.parse(req.url);
  const pathParts = parsedUrl.pathname.split('/').filter(Boolean);

  if (pathParts[0] !== 'api' || pathParts.length < 2) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: 'Development CORS Proxy Server',
      usage: 'GET /api/{endpoint_name}',
      endpoints: Object.keys(endpoints).map(name => `http://localhost:${PORT}/api/${name}`)
    }, null, 2));
    return;
  }

  const endpointName = pathParts[1];
  const targetUrl = endpoints[endpointName];

  if (!targetUrl) {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      error: `Unknown endpoint: ${endpointName}`,
      available: Object.keys(endpoints)
    }));
    return;
  }

  console.log(`${req.method} /api/${endpointName} -> ${targetUrl}`);

  // Parse target URL
  const target = url.parse(targetUrl);
  const protocol = target.protocol === 'https:' ? https : http;

  // Forward request - strip all CORS-related and browser headers
  const headers = { ...req.headers };

  // Remove headers that cause LocalStack CORS issues
  delete headers.origin;
  delete headers.referer;
  delete headers['sec-fetch-site'];
  delete headers['sec-fetch-mode'];
  delete headers['sec-fetch-dest'];

  // Keep only essential headers
  const options = {
    hostname: target.hostname,
    port: target.port,
    path: target.path,
    method: req.method,
    headers: {
      'accept': headers.accept || 'application/json',
      'content-type': headers['content-type'] || 'application/json',
      'user-agent': headers['user-agent'] || 'proxy-server',
      host: target.host
    }
  };

  const proxyReq = protocol.request(options, (proxyRes) => {
    // Filter out CORS headers from Lambda response since we set our own
    const headers = { ...proxyRes.headers };
    delete headers['access-control-allow-origin'];
    delete headers['access-control-allow-methods'];
    delete headers['access-control-allow-headers'];
    delete headers['access-control-max-age'];

    // Forward status and filtered headers
    res.writeHead(proxyRes.statusCode, headers);
    proxyRes.pipe(res);
  });

  proxyReq.on('error', (err) => {
    console.error('Proxy error:', err.message);
    res.writeHead(502, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Bad Gateway', message: err.message }));
  });

  req.pipe(proxyReq);
});

server.listen(PORT, () => {
  console.log('');
  console.log('==================================================');
  console.log('Development CORS Proxy Server');
  console.log('==================================================');
  console.log(`Listening on: http://localhost:${PORT}`);
  console.log('');
  console.log('Available endpoints:');
  for (const [name, targetUrl] of Object.entries(endpoints)) {
    console.log(`  /api/${name} -> ${targetUrl}`);
  }
  console.log('');
  console.log('Update frontend to use: http://localhost:' + PORT);
  console.log('==================================================');
});
