# G-Shock Viewer — app próprio pro Casio GBD-H2000

App pra **ver os dados** do relógio (passos, batimentos, sono + **BPM ao vivo**)
sem depender do app oficial da Casio.

## Como funciona (a ideia)

O relógio fala **Bluetooth LE**. O iPhone não deixa um site falar BLE cru com ele,
então quem conversa com o relógio é o **seu PC** (via Python). O PC lê os dados e
sobe um **painel web** — que você abre no navegador do PC **ou do iPhone** (pela
rede Wi-Fi). Assim:

```
  [Relógio GBD-H2000]  --Bluetooth-->  [PC: bridge Python]  --Wi-Fi-->  [navegador / iPhone]
```

- **Batimentos ao vivo:** via o serviço padrão de Heart Rate do Bluetooth (se o
  relógio expuser — confirmamos no passo de reconhecimento).
- **Passos / sono / histórico:** via o protocolo proprietário da Casio, que estamos
  mapeando com apoio do projeto open-source **Gadgetbridge** (que já suporta o
  GBD-H1000, primo do seu relógio).

## Jeito fácil (Windows, clicando)

1. Instale o **Python 3.10+** ([python.org](https://www.python.org/downloads/) —
   na instalação, marque "Add Python to PATH").
2. Clique **uma vez** em `criar-atalho.vbs` → aparece um atalho **"G-Shock Viewer"**
   (com ícone) na sua Área de Trabalho.
3. Deixe o relógio em modo **CONNECT** e clique no atalho. Ele instala tudo sozinho,
   acha o relógio e mapeia o protocolo. No fim, o resultado fica em `bridge\logs\`.

Prefere digitar os comandos? Siga a instalação manual abaixo.

## Instalação (uma vez)

Precisa de **Python 3.10+** e Bluetooth no PC.

```bash
cd gshock-viewer/bridge
python -m venv .venv
# Windows: .venv\Scripts\activate    |    Mac/Linux: source .venv/bin/activate
pip install -r requirements.txt
```

## Passo a passo

### 0. Ver o painel funcionando (sem relógio)
```bash
python serve.py --demo
```
Abra `http://localhost:8000`. Vai aparecer o painel com dados de exemplo e um BPM
falso "ao vivo". Serve pra confirmar que tudo sobe.

### 1. Achar o relógio
Coloque o relógio em modo de conexão (menu **CONNECT** / procurar smartphone) e:
```bash
python scan.py
```
Anote o **ENDEREÇO** que ele indicar (MAC no Windows/Linux, UUID no macOS).

> Se o relógio já estiver pareado com o app oficial, talvez seja preciso **fechar o
> app oficial** (ou desparear o relógio) pra ele aceitar a conexão do PC.

### 2. Mapear o protocolo (o passo-chave)
```bash
python recon.py --address <ENDEREÇO>
```
Enquanto roda, **mexa no relógio**: entre no modo de batimentos, dê passos,
inicie/pare uma atividade. Ele salva tudo em `bridge/logs/recon-*.log`.
No log, procure a linha **"Heart Rate Service (PADRÃO!)"** — se aparecer, o BPM ao
vivo já vai funcionar direto.

### 3. Ver os batimentos ao vivo
```bash
python serve.py --address <ENDEREÇO>
```
Abra `http://localhost:8000` (ou `http://<IP-DO-PC>:8000` no iPhone) e entre no modo
de batimentos do relógio. O BPM aparece em tempo real no painel.

### 4. Sincronizar o histórico (passos/sono) — em desenvolvimento
```bash
python sync.py --address <ENDEREÇO>
```
Isso grava `data/health.json`, que o painel mostra. O parsing dos passos/sono
depende do que o passo 2 revelar — ver "Situação" abaixo.

## Ver no iPhone
Com o `serve.py` rodando no PC, descubra o IP do PC (`ipconfig` no Windows,
`ip addr`/`ifconfig` no Mac/Linux) e abra no Safari do iPhone:
`http://<IP-DO-PC>:8000`. PC e iPhone precisam estar na **mesma rede Wi-Fi**.

## Estrutura

```
gshock-viewer/
  bridge/            # Python (fala BLE com o relógio)
    scan.py          # acha o relógio
    recon.py         # mapeia o protocolo (gera logs)
    serve.py         # sobe o painel + BPM ao vivo  ← comando principal
    sync.py          # baixa histórico -> data/health.json
    decoders.py      # traduz bytes -> números
  web/index.html     # o painel (HTML único)
  data/health.json   # seus dados (gerado; não versionado)
```

## Situação (o que está pronto)

| Parte | Status |
|-------|--------|
| Painel web (passos/HR/sono/BPM ao vivo) | ✅ pronto |
| Achar o relógio (`scan`) | ✅ pronto |
| Reconhecimento do protocolo (`recon`) | ✅ pronto |
| BPM ao vivo (Heart Rate padrão) | ✅ pronto (depende do relógio expor `0x180D`) |
| Histórico passos/sono (`sync`) | 🚧 esqueleto pronto; parsing proprietário depende do `recon` |

## Depois: app nativo de iPhone?

É possível (o iOS suporta BLE via Core Bluetooth), mas exige um **Mac com Xcode** e
o **iPhone físico** pra testar (o simulador do iOS não tem Bluetooth). O plano é
mapear todo o protocolo aqui no PC primeiro e, se valer a pena, portar pro iPhone —
o `decoders.py` vira a referência da tradução.

## Créditos / referência

Protocolo baseado no trabalho do [Gadgetbridge](https://gadgetbridge.org)
(suporte ao Casio GBD-H1000), open-source GPLv3.
