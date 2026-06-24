FROM nikolaik/python-nodejs:python3.12-nodejs22

WORKDIR /app

# Python deps
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Node deps + PM2
COPY whatsapp-bridge/package.json whatsapp-bridge/
RUN cd whatsapp-bridge && npm install --omit=dev
RUN npm install -g pm2

# Copia o projeto
COPY . .

# Garante que as pastas de volume existam
RUN mkdir -p whatsapp-bridge/auth db

CMD ["pm2-runtime", "ecosystem.config.js"]
