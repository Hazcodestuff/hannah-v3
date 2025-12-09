const http = require('http');

function startServer() {
  const server = http.createServer((req, res) => {
    if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        status: 'ok',
        message: 'WhatsApp bot is running',
        timestamp: new Date().toISOString()
      }));
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('WhatsApp bot is running. Health check: /health');
    }
  });

  const PORT = process.env.PORT || 10000;
  server.listen(PORT, () => {
    console.log(`HTTP server listening on port ${PORT} for health checks`);
  });

  return server;
}

module.exports = { startServer };
