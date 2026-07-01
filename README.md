# Treino IA — App de Controle de Treinos

App web mobile-first para registrar treinos de academia com assistente de IA.

## Stack

- React 19 + TypeScript + Vite
- Tailwind CSS (dark mode, mobile-first)
- Zustand (state management)
- Recharts (gráficos de progresso)
- Anthropic API (claude-sonnet-4-6)
- PWA (instalável no iPhone via Safari)

## Funcionalidades

- **Treino do dia**: detecta o dia da semana e mostra o treino automaticamente
- **Registro de séries**: steppers numéricos grandes para carga e reps
- **Timer de descanso**: contagem regressiva com som, ajustável ±15s
- **Cronômetro de sessão**: tempo total de treino com pause/play
- **Substituição com IA**: sugere alternativas respeitando a lesão no ombro
- **Feedback pós-treino**: análise personalizada da sessão pela IA
- **Histórico completo**: todas as sessões com filtro por tipo de treino
- **Gráficos de progresso**: evolução de carga/reps por exercício
- **Analytics semanal**: análise de volume e sugestões de ajuste no plano

## Setup local

```bash
# 1. Instalar dependências
npm install

# 2. Criar arquivo de ambiente
cp .env.example .env
# Editar .env e adicionar sua ANTHROPIC_API_KEY

# 3. Rodar em desenvolvimento
npm run dev
```

## Deploy no Railway

### Passo 1 — Conectar repositório
1. Acesse [railway.app](https://railway.app) e crie um projeto
2. Selecione "Deploy from GitHub repo"
3. Autorize o acesso e selecione este repositório

### Passo 2 — Configurar variável de ambiente
No painel do Railway, vá em **Variables** e adicione:
```
VITE_ANTHROPIC_API_KEY=sk-ant-...sua-chave...
```

### Passo 3 — Deploy automático
O Railway detecta o `Dockerfile` automaticamente e faz o build.
Cada push para a branch principal dispara um novo deploy.

### PWA no iPhone
1. Acesse a URL do app no Safari do iPhone
2. Toque no botão de compartilhar (ícone de caixa com seta)
3. Selecione "Adicionar à Tela de Início"
4. Confirme — o app abre sem barra de navegador, como nativo
