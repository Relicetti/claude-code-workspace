# Treino IA — App de Controle de Treinos

App web mobile-first para registrar treinos de academia com assistente de IA.

## Stack

- React 19 + TypeScript + Vite (frontend)
- Express + PostgreSQL (backend, dados sincronizados entre dispositivos)
- Tailwind CSS (dark mode, mobile-first)
- Zustand (state management)
- Recharts (gráficos de progresso)
- Anthropic API (claude-sonnet-4-6)
- PWA (instalável no iPhone via Safari)

## Funcionalidades

- **Sequência de treinos**: escolha manual do treino do dia, com indicação do último feito
- **Meu Plano**: visualize e edite seus treinos base (exercícios, séries, reps, descanso)
- **Registro de séries**: steppers numéricos grandes para carga e reps
- **Timer de descanso**: contagem regressiva com som, ajustável ±15s, resistente a tela apagada
- **Cronômetro de sessão**: tempo total de treino com pause/play
- **Substituição com IA**: sugere alternativas respeitando a lesão no ombro (durante o treino ou direto no plano base)
- **Feedback pós-treino**: análise personalizada da sessão pela IA
- **Histórico completo**: todas as sessões com filtro por tipo de treino
- **Gráficos de progresso**: evolução de carga/reps por exercício
- **Analytics semanal**: análise de volume e sugestões de ajuste no plano
- **Dados sincronizados**: tudo fica salvo num banco Postgres, não no navegador — funciona igual não importa como você abra o app (Safari, ícone instalado, PC)
- **Acesso protegido por senha**: já que os dados ficam num servidor acessível pela internet

## Setup local

### 1. Banco de dados
Precisa de um Postgres rodando localmente (ou aponte `DATABASE_URL` pra um remoto).

```bash
# Exemplo criando um banco local
sudo -u postgres psql -c "CREATE USER workout_app WITH PASSWORD 'suasenha' SUPERUSER;"
sudo -u postgres psql -c "CREATE DATABASE workout_db OWNER workout_app;"
```

### 2. Variáveis de ambiente
```bash
cp .env.example .env
```
Edite o `.env` e preencha:
- `VITE_ANTHROPIC_API_KEY` — sua API key da Anthropic
- `DATABASE_URL` — string de conexão do Postgres criado acima
- `APP_JWT_SECRET` — qualquer string aleatória longa
- `APP_PASSWORD` — a senha que você vai usar pra entrar no app

### 3. Instalar e rodar
```bash
npm install

# Terminal 1 — backend (API + banco)
npm run dev:server

# Terminal 2 — frontend (Vite, com proxy pra /api)
npm run dev
```
Acesse `http://localhost:5173`.

## Deploy no Railway

### Passo 1 — Banco de dados
No seu projeto Railway: **New** → **Database** → **Add PostgreSQL**.
Isso cria um serviço de banco separado dentro do mesmo projeto.

### Passo 2 — Conectar o repositório
1. **New** → **GitHub Repo** → selecione este repositório
2. Garanta que a branch de deploy é a correta nas configurações do serviço

### Passo 3 — Variáveis de ambiente
No serviço do **app** (não no do Postgres), vá em **Variables** e adicione:
```
VITE_ANTHROPIC_API_KEY=sk-ant-...sua-chave...
DATABASE_URL=${{Postgres.DATABASE_URL}}
APP_JWT_SECRET=uma-string-aleatoria-bem-longa
APP_PASSWORD=a-senha-que-voce-vai-usar-pra-entrar
```
O valor `${{Postgres.DATABASE_URL}}` referencia automaticamente o banco criado no Passo 1
(ajuste o nome `Postgres` caso tenha renomeado o serviço do banco).

### Passo 4 — Deploy automático
O Railway detecta o `Dockerfile` e builda. As tabelas do banco são criadas
automaticamente na primeira vez que o servidor sobe. Cada push pra branch
configurada dispara um novo deploy.

### PWA no iPhone
1. Acesse a URL do app no Safari do iPhone
2. Toque no botão de compartilhar (ícone de caixa com seta)
3. Selecione "Adicionar à Tela de Início"
4. Confirme — o app abre sem barra de navegador, como nativo

**Importante:** sempre abra o app pelo ícone instalado (nunca digitando a URL direto
no Safari) para evitar qualquer inconsistência de sessão entre os dois modos de abertura.
