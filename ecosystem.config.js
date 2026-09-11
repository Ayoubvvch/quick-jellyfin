module.exports = {
  apps: [
    {
      name: 'jellyfin-downloader',
      script: 'server.js',
      env: {
        PORT: 5000,
        NODE_ENV: 'production'
      },
      autorestart: true,
      restart_delay: 2000,
      max_memory_restart: '500M'
    }
  ]
};
