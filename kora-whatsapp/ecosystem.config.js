module.exports = {
  apps: [
    {
      name: 'api',
      interpreter: 'python3',
      script: 'scripts/api.py',
      env: { PYTHONIOENCODING: 'utf-8' },
    },
    {
      name: 'bot',
      interpreter: 'python3',
      script: 'scripts/bot.py',
      env: { PYTHONIOENCODING: 'utf-8' },
    },
    {
      name: 'bridge',
      script: 'whatsapp-bridge/index.js',
    },
    {
      name: 'dashboard',
      script: '/usr/local/bin/streamlit',
      interpreter: 'none',
      args: 'run dashboard.py --server.port 8501 --server.address 0.0.0.0 --server.headless true',
      env: { PYTHONIOENCODING: 'utf-8' },
    },
  ],
}
