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
- **Notificação de fim de descanso**: som + notificação push, chega mesmo com a tela apagada ou o app em segundo plano (PWA instalado no iPhone, iOS 16.4+)
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
- `VITE_VAPID_PUBLIC_KEY` e `VAPID_PRIVATE_KEY` — par de chaves pra notificação push do timer de descanso. Gere com:
  ```bash
  npx web-push generate-vapid-keys
  ```

### 3. Instalar e rodar
```bash
npm install

# Terminal 1 — backend (API + banco)
npm run dev:server

# Terminal 2 — frontend (Vite, com proxy pra /api)
npm run dev
```
Acesse `http://localhost:5173`.

### 4. Criar uma conta
O app é multi-usuário: cada pessoa tem seu próprio login e seus dados ficam
completamente isolados dos de outras contas. Não existe cadastro pela tela —
contas são criadas rodando o script abaixo, uma vez para cada pessoa:
```bash
npm run create-user -- <usuario> <senha>
```
A primeira conta criada herda automaticamente qualquer dado que já existisse
no banco antes do app virar multi-usuário (treinos, histórico, etc.).

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
VITE_VAPID_PUBLIC_KEY=chave-publica-gerada-com-web-push
VAPID_PRIVATE_KEY=chave-privada-gerada-com-web-push
```
O valor `${{Postgres.DATABASE_URL}}` referencia automaticamente o banco criado no Passo 1
(ajuste o nome `Postgres` caso tenha renomeado o serviço do banco).

As chaves VAPID (`VITE_VAPID_PUBLIC_KEY`/`VAPID_PRIVATE_KEY`) são as mesmas geradas no
Passo 2 acima — gere um único par e reaproveite tanto local quanto no Railway.
Sem elas, a notificação push do timer de descanso fica desativada (o app funciona
normal, só sem esse recurso).

### Passo 4 — Deploy automático
O Railway detecta o `Dockerfile` e builda. As tabelas do banco são criadas
automaticamente na primeira vez que o servidor sobe. Cada push pra branch
configurada dispara um novo deploy.

### Passo 5 — Criar as contas
Com o serviço no ar, rode o script de criação de usuário apontando pro banco
do Railway (pegue a `DATABASE_URL` pública em **Postgres → Connect → Public
Network** e use como `DATABASE_URL` local só para rodar o comando):
```bash
DATABASE_URL="a-url-publica-do-postgres" npm run create-user -- <usuario> <senha>
```
Repita uma vez para cada pessoa. A primeira conta criada herda automaticamente
os dados que já existiam no banco antes do multi-usuário.

### PWA no iPhone
1. Acesse a URL do app no Safari do iPhone
2. Toque no botão de compartilhar (ícone de caixa com seta)
3. Selecione "Adicionar à Tela de Início"
4. Confirme — o app abre sem barra de navegador, como nativo

**Importante:** sempre abra o app pelo ícone instalado (nunca digitando a URL direto
no Safari) para evitar qualquer inconsistência de sessão entre os dois modos de abertura.
