#!/bin/sh
# Copia auth bundled para o volume na primeira inicialização
if [ ! -f "/app/data/auth/creds.json" ]; then
  echo "[init] Copiando sessão WhatsApp para volume persistente..."
  mkdir -p /app/data/auth /app/data/db
  if [ -d "/app/whatsapp-bridge/auth" ]; then
    cp -r /app/whatsapp-bridge/auth/. /app/data/auth/
    echo "[init] Sessão copiada com sucesso."
  else
    echo "[init] Sem sessão bundled — QR Code será exibido em /qr"
  fi
else
  echo "[init] Sessão já existe no volume."
fi

# Inicializa banco se não existir
if [ ! -f "/app/data/db/kora.db" ] && [ -f "/app/db/schema.sql" ]; then
  echo "[init] Criando banco de dados..."
  mkdir -p /app/data/db
  sqlite3 /app/data/db/kora.db < /app/db/schema.sql
  echo "[init] Banco criado."
fi

exec pm2-runtime ecosystem.config.js
