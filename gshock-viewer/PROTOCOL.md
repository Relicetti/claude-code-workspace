# Protocolo BLE do Casio GBD-H2000 — anotações

Descobertas a partir do `recon` no relógio real (endereço C5:EA:3B:DB:9F:76) +
referência do [Gadgetbridge](https://gadgetbridge.org) (linha Casio GBX-100 / GBD-H1000).

## Serviços e características (confirmados no relógio)

Serviço proprietário Casio: `26eb000d-b012-49a8-b1f8-394fb2032b0f`

| Característica (26eb..) | Propriedades | Papel provável (Gadgetbridge) |
|------------------------|--------------|-------------------------------|
| `0023` | notify, write | request / all-features |
| `0024` | notify, write-sem-resposta | ALL_FEATURES (init/time) |
| `002c` | write-sem-resposta | comando/config |
| `002d` | notify, write | DATA_REQUEST_SP / CONVOY |
| `0030` | write-sem-resposta | comando/config |

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
