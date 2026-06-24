FROM nikolaik/python-nodejs:python3.12-nodejs22

WORKDIR /app

# Instala sqlite3 para init do banco
RUN apt-get update && apt-get install -y sqlite3 && rm -rf /var/lib/apt/lists/*

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Node deps + PM2
COPY whatsapp-bridge/package.json whatsapp-bridge/
RUN cd whatsapp-bridge && npm install --omit=dev
RUN npm install -g pm2

# Copia o projeto (inclui auth para bundling inicial)
COPY . .

# Garante pastas base
RUN mkdir -p whatsapp-bridge/auth db data/auth data/db

# Script de inicialização executável
RUN chmod +x init.sh

CMD ["./init.sh"]
