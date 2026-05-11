module.exports = {
  apps: [
    {
      name: 'aws-pricing-calculator-mcp',
      cwd: __dirname,
      script: 'mcp-sse-server.js',
      interpreter: 'node',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      min_uptime: '30s',
      max_restarts: 10,
      restart_delay: 2000,
      kill_timeout: 10000,
      env: {
        NODE_ENV: 'production',
        HOST: '0.0.0.0',
        PORT: '8767',
        SSE_PATH: '/sse',
        MESSAGES_PATH: '/messages',
        HEALTH_PATH: '/healthz',
      },
    },
  ],
};
