// PM2 ecosystem — self-contained (deploy this folder alone on EC2).
// Monorepo: from repo root use `pm2 start mcp-servers.ecosystem.config.js` to start all MCP apps.

const sharedProcess = {
  instances: 1,
  exec_mode: "fork",
  autorestart: true,
  min_uptime: "30s",
  max_restarts: 10,
  restart_delay: 2000,
  kill_timeout: 10000,
  merge_logs: true,
  time: true,
};

module.exports = {
  apps: [
    {
      ...sharedProcess,
      name: "aws-pricing-calculator-mcp",
      cwd: __dirname,
      script: "mcp-sse-server.js",
      interpreter: "node",
      env: {
        NODE_ENV: "production",
        HOST: "0.0.0.0",
        PORT: "8767",
        SSE_PATH: "/sse",
        MESSAGES_PATH: "/messages",
        HEALTH_PATH: "/healthz",
      },
      out_file: "./logs/aws-pricing-calculator-mcp.out.log",
      error_file: "./logs/aws-pricing-calculator-mcp.err.log",
    },
  ],
};
