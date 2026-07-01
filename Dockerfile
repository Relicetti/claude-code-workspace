FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
RUN npm install -g serve

WORKDIR /app
COPY --from=builder /app/dist ./dist

ENV PORT=3000
EXPOSE 3000

CMD serve -s dist -l $PORT
