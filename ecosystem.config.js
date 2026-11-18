module.exports = {
  apps: [
    {
      name: "officeops",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      watch: false,
      max_memory_restart: "1G",
      env: {
        NODE_ENV: "production",
        PORT: 3003,
        HOSTNAME: "0.0.0.0",
      },
    },
  ],
};
