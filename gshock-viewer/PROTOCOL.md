# Protocolo BLE do Casio GBD-H2000 — anotações

Descobertas a partir do `recon` no relógio real (endereço C5:EA:3B:DB:9F:76) +
referência do [Gadgetbridge](https://gadgetbridge.org) (linha Casio GBX-100 / GBD-H1000).

## Serviços e características (confirmados no relógio)

Serviço proprietário Casio: `26eb000d-b012-49a8-b1f8-394fb2032b0f`

| Característica (26eb..) | Propriedades | Papel (Gadgetbridge — CONFIRMADO) |
|------------------------|--------------|-------------------------------|
| `0023` | notify, write | **DATA_REQUEST_SP** (pedir passos aqui) |
| `0024` | notify, write-sem-resposta | **CONVOY** (dados voltam aqui) |
| `002c` | write-sem-resposta | **READ_REQUEST** (pedir nome/feature) |
| `002d` | notify, write | **ALL_FEATURES** (init: app-info + HORA) |
| `0030` | write-sem-resposta | NOTIFICATION |

### Feature IDs (escritos em ALL_FEATURES `002d`, prefixando o payload)
`0x09` CURRENT_TIME · `0x22` APP_INFORMATION · `0x23` WATCH_NAME ·
`0x20` VERSION · `0x28` WATCH_CONDITION · `0x47` SERVICE_DISCOVERY (o watch responde `0x4701`)

### Init / aperto de mão (o que destrava os dados)
1. Assinar notify em `0023`, `0024`, `002d`.
2. `002c` <- `[0x23]` (pede nome).
3. `002d` <- `[0x22, 00,01,..,09, 02]` (app-info).
4. `002d` <- `[0x09] + 10 bytes` (hora, formato Current Time BLE, adjustReason=1):
   `yearLo yearHi month day hour min sec diaDaSemana(1=Seg..7=Dom) 00 01`.
5. Depois disso: pedir passos em `0023` com `00 11 00 00 00`; dados chegam em `0024`.

**Não há** Heart Rate Service padrão (`0x180D`) — batimentos vêm pelo protocolo
proprietário, não pelo padrão BLE.

## Leituras (Device Info)
- `2a00` Nome: `CASIO GBD-H2000`
- `2a01` Appearance: `c1 00`
- `2a04` Conn params: `10 00 20 00 04 00 90 01`

## Pegar passos/calorias (linha GBX-100)
1. Assinar notify em `DATA_REQUEST_SP` e `CONVOY`.
2. Escrever `00 11 00 00 00` em `DATA_REQUEST_SP`.
3. Resposta em `CONVOY` vem **invertida bit a bit** (`~byte`):

   | bytes | campo |
   |-------|-------|
   | 0-1 | tamanho do payload (LE) |
   | 2 | ano (+2000) |
   | 3 | mês (0-based) |
   | 4 | dia |
   | 5 | hora |
   | 6 | minuto |
   | 7-10 | passos (32b LE; `0xfffffffe`=0) |
   | 11-12 | calorias (16b; `0xfffe`=0) |
   | 13-14 | ano nasc. |
   | 15 | mês nasc. |
   | 16 | dia nasc. |
   | 17 | status (0=tem mais, 1=fim) |
   | 18+ | pacotes históricos: tipo(1) + len(2 LE) + pares de 2 bytes |

4. Confirmar com `04 11 00 00 00`.

## Aperto de mão (init) — pode ser necessário antes dos dados
Ao conectar, o relógio dispara bonding e **espera receber a hora atual**
(responde `0x4701`); ao final envia `0x3d`. Referência: `gbx100/InitOperation`.
Se o pedido de passos vier vazio, é porque falta esse init.

## Pendências
- Confirmar o mapeamento exato DATA_REQUEST_SP vs CONVOY entre `0023`/`002d`
  (o `gshock.py` testa os dois e loga qual responde).
- Formato exato do write de hora (FEATURE_CURRENT_TIME) para o init.
- Localizar batimentos e sono no protocolo (o H1000 tem; mapear os comandos).
