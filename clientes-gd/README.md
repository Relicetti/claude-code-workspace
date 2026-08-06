# clientes-gd

Gestão de clientes de geração distribuída (GD) — clientes que recebem
energia de uma usina via rateio de créditos, do cadastro/contrato até a
cobrança mensal.

Flask + SQLite, seguindo o mesmo padrão dos outros projetos do monorepo
(`usinas/`, `fup-operacoes/`). Porta padrão: **5011**.

## Rodando localmente

```
pip install -r requirements.txt
BOOTSTRAP_ADMIN_USER=admin BOOTSTRAP_ADMIN_SENHA=troque-isso python app.py
```

Variáveis de ambiente relevantes:

| Variável | Uso |
|---|---|
| `SECRET_KEY` | sessão do Flask |
| `DB_PATH` | caminho do banco SQLite (default: `clientes_gd.db` ao lado do código) |
| `BOOTSTRAP_ADMIN_USER` / `_SENHA` / `_NOME` | cria o admin inicial se o banco estiver vazio |
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_FROM` | envio de e-mail (opcional, no-op se ausente) |
| `ASSINATURA_AUTENTIQUE_API_TOKEN` | assinatura eletrônica de contrato via Autentique (opcional, no-op se ausente) |
| `ASSINATURA_AUTENTIQUE_WEBHOOK_TOKEN` | valida o webhook da Autentique (obrigatório pra aceitar webhooks) |
| `ANTHROPIC_API_KEY` | extração de fatura da distribuidora via API do Claude (opcional, no-op se ausente) |

## Status por fase

- ✅ **Fase 1 — Cadastro/contrato**: usineiros, usinas GD, clientes,
  contratos/termo de adesão, rateio versionado (histórico preservado),
  log de auditoria, auth.
- ✅ **Assinatura eletrônica (Autentique)**: envio de contrato para
  assinatura, webhook de confirmação, ou registro manual de documento já
  assinado. `assinatura/autentique.py` foi escrito com base na
  documentação pública da API GraphQL da Autentique, mas **ainda não foi
  testado contra uma conta real** — validar nomes de campos ao configurar
  o primeiro token de produção.
- ✅ **Fase 2 (parcial) — faturamento**: `tarifas/` foi portado do
  repositório `Relicetti/alexandria-tarifas` (extração de PDF de fatura +
  cálculo de tarifa por grupo de concessionária: GER, EQT, NEOENERGIA,
  ENERGISA, LIGHT, CEMIG, BRASILIA). Upload manual de PDF por cliente/mês
  já gera `leituras_distribuidora` e `faturas_cliente` automaticamente.
  **Continua usando a API do Claude** para a extração (decisão
  deliberada — ver abaixo), não foi convertido pra IA local.
  **Calibrado especificamente pro layout RGE Sul (DANF3E)** — o
  `extrator.py` tem uma seção dedicada com os rótulos exatos vistos em
  faturas reais (`Energ Atv Inj. oUC/mUC mPT/oPT`, `Saldo em Energia da
  Instalação`, defasagem de mês entre injeção e fatura, etc.) e captura
  também `saldo_acumulado_kwh` e `saldo_expirar_kwh` (banco de créditos de
  energia da instalação). Outras distribuidoras usam as instruções mais
  genéricas já existentes no prompt — validar com exemplos reais antes de
  confiar 100% fora do RGE.
- ⬜ **Fase 3 — Gateway Asaas + webhook**: cobrança PIX real e conciliação
  automática de pagamento. Não implementada ainda.
- ⬜ **Fase 4 — Régua de cobrança/inadimplência**: lembretes e suspensão
  automática de cliente inadimplente. Não implementada ainda.
- ⬜ **Fase 5 — Scraping automático de concessionárias**: hoje a fatura
  entra por upload manual; captura automática do portal de cada
  distribuidora fica pra depois (arquitetura plugável por concessionária).
- ⬜ **Fase 6 — IA local (Ollama)**: reservada para geração de resumos de
  relatório em linguagem natural (não para extração de fatura — ver
  decisão abaixo). Não implementada ainda.
- ⬜ **Fase 7 — Relatórios**: dashboard de economia do cliente e de
  faturamento do usineiro, com export. Não implementada ainda.

## Por que a extração de fatura continua na API do Claude (não é IA local)

O pedido original era "tudo com IA local". Na prática, o `extrator.py`
(portado do `alexandria-tarifas`) manda o PDF inteiro como documento
visual pro Claude Sonnet 4.5, com um prompt de ~180 linhas com regras
específicas por distribuidora (médias ponderadas por faixa de ICMS,
lógica de bandeira tarifária etc.) — calibrado iterativamente para a
capacidade de leitura visual do Claude. Essa etapa decide o valor cobrado
de cada cliente: um erro de extração é um erro de cobrança.

Rodar um modelo local pequeno teria risco real de queda de precisão;
rodar um modelo local grande (Qwen2.5-VL 72B/Llama3.2-Vision 90B) exige
GPU de 48-80GB+ VRAM. O custo estimado de manter a API do Claude pra essa
etapa é de **~US$0,02-0,03 por fatura** (~R$0,10-0,20), ordens de
magnitude mais barato que a infraestrutura de GPU equivalente. Decisão
tomada com o usuário: manter Claude API aqui; IA local fica reservada
pra Fase 6 (resumos de relatório), onde o risco de erro é bem menor.
