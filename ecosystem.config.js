module.exports = {
  apps: [{
    name: 'medical-workers-day',
    cwd: './server',
    script: 'src/index.ts',
    interpreter: 'node_modules/.bin/tsx',
    interpreterArgs: '',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    // Logging
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    error_file: '../logs/err.log',
    out_file: '../logs/out.log',
    merge_logs: true,
    // Auto-restart
    max_restarts: 10,
    restart_delay: 2000,
    // Graceful shutdown
    kill_timeout: 3000,
    listen_timeout: 3000,
  }],
};
