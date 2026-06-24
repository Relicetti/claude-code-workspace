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
  ],
}
