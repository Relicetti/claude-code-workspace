"""
Sincroniza os ajustes de uma aba semanal da planilha FUP Operações.xlsx pro
banco do painel, sem apagar nada que já existe (pendências concluídas,
situação, executivo, geração média mensal etc ficam intactos).

Pra cada usina da aba:
  - se a UG não existe no banco -> cria a usina nessa etapa.
  - se existe e está "ativa" mas em etapa diferente -> muda de etapa.
  - se a observação da planilha for diferente da última pendência
    registrada -> adiciona como pendência nova.
  - se o "Status" da planilha (Pendente/Em andamento/Nova) for diferente
    da situação atual -> atualiza a situação da etapa.
  - usinas "ativa" no banco que já não aparecem na aba: só entram no
    relatório pra revisão manual (não são movidas automaticamente pra
    Operação/Rescisão -- isso é decidido pelo time direto no sistema).

Uso: python sincronizar_semana.py <nome_da_aba>
Ex.: python sincronizar_semana.py 03.08
"""
import shutil
import sys
from datetime import date, datetime

import db
from importar_historico import CAMINHO_PLANILHA, abrir_planilha, construir_mapa_colunas, col, HEADER_ALIASES, mapear_etapa

STATUS_MAP = {
    "Pendente": "Pendente",
    "Em andamento": "Em Andamento",
    "Nova": "-",
}

AUTOR = "Importação"


def ler_aba_semana(ws, nao_mapeadas):
    header_row, mapa = construir_mapa_colunas(ws)
    if header_row is None:
        raise RuntimeError("Não encontrei a linha de cabeçalho (coluna 'UG') nessa aba.")

    ug_col = col(mapa, "UG", ws.max_column)
    nome_col = col(mapa, "Nome UFV", ws.max_column)
    conc_col = col(mapa, "Concessionária", ws.max_column)
    dtass_col = col(mapa, "Dt. Ass. Cont.", ws.max_column)
    obs_col = col(mapa, "Observação", ws.max_column)
    status_col = mapa.get("Status")
    dono_col = mapa.get("Dono Carteira")
    resp_col = mapa.get("Responsável") or mapa.get("Responsavel")
    if dono_col is None:
        dono_col, resp_col = resp_col, None

    registros = {}
    secao_atual = None
    for r in range(header_row, ws.max_row + 1):
        a_val = ws.cell(row=r, column=1).value
        ug_val = ws.cell(row=r, column=ug_col).value if ug_col else None

        eh_linha_de_cabecalho = isinstance(ug_val, str) and ug_val.strip().upper() == "UG"
        if eh_linha_de_cabecalho:
            if a_val:
                secao_atual = str(a_val).strip()
            continue

        if ug_val is None or str(ug_val).strip() == "":
            if a_val:
                secao_atual = str(a_val).strip()
            continue

        if a_val:
            secao_atual = str(a_val).strip()
        if secao_atual is None:
            continue

        ug_norm = db.normalizar_ug(ug_val)
        if not ug_norm:
            continue

        dt_ass = ws.cell(row=r, column=dtass_col).value if dtass_col else None
        status_raw = str(ws.cell(row=r, column=status_col).value or "").strip() if status_col else ""
        registros[ug_norm] = {
            "ug_raw": str(ug_val).strip(),
            "nome_ufv": str(ws.cell(row=r, column=nome_col).value or "").strip() if nome_col else "",
            "concessionaria": str(ws.cell(row=r, column=conc_col).value or "").strip() if conc_col else "",
            "dono_carteira": str(ws.cell(row=r, column=dono_col).value or "").strip() if dono_col else "",
            "responsavel_acao": str(ws.cell(row=r, column=resp_col).value or "").strip() if resp_col else "",
            "data_assinatura": dt_ass.date().isoformat() if hasattr(dt_ass, "date") else None,
            "observacao": str(ws.cell(row=r, column=obs_col).value or "").strip() if obs_col else "",
            "etapa": mapear_etapa(secao_atual, nao_mapeadas),
            "situacao": STATUS_MAP.get(status_raw),
        }
    return registros


def principal(nome_aba):
    shutil.copy2(db.DB_PATH, db.DB_PATH + f".backup-antes-sync-{nome_aba}")

    wb = abrir_planilha()
    if nome_aba not in wb.sheetnames:
        raise RuntimeError(f"Aba '{nome_aba}' não existe. Abas disponíveis: {wb.sheetnames}")
    ws = wb[nome_aba]

    nao_mapeadas = set()
    registros = ler_aba_semana(ws, nao_mapeadas)

    hoje = date.today().isoformat()
    agora = datetime.now().isoformat(timespec="seconds")

    criadas = []
    etapas_mudadas = []
    situacoes_mudadas = []
    pendencias_add = []
    ignoradas_ja_graduadas = []

    db.iniciar_banco()
    with db.conectar() as conn:
        for ug, reg in registros.items():
            row = conn.execute("SELECT * FROM usinas WHERE ug = ?", (ug,)).fetchone()

            if row is None:
                db.criar_usina(
                    conn,
                    ug_raw=reg["ug_raw"],
                    nome_ufv=reg["nome_ufv"],
                    concessionaria=reg["concessionaria"],
                    dono_carteira=reg["dono_carteira"],
                    executivo="",
                    geracao_media_mensal=None,
                    data_assinatura=reg["data_assinatura"],
                    etapa_inicial=reg["etapa"],
                    hoje_iso=hoje,
                    pendencia=reg["observacao"],
                    responsavel=reg["responsavel_acao"],
                    autor=AUTOR,
                    criado_em=agora,
                )
                criadas.append(reg["nome_ufv"])
                continue

            if row["status"] != "ativa":
                ignoradas_ja_graduadas.append(row["nome_ufv"])
                continue

            etapa_antes = row["etapa_atual"]
            situacao_antes = row["situacao_etapa"]
            mudou_etapa = etapa_antes != reg["etapa"]
            if mudou_etapa:
                db.mudar_etapa(conn, row["id"], reg["etapa"], hoje, AUTOR)
                etapas_mudadas.append((reg["nome_ufv"], etapa_antes, reg["etapa"]))
                situacao_antes = "-"  # mudar_etapa já reseta a situação

            if reg["situacao"] and reg["situacao"] != situacao_antes:
                db.mudar_situacao(conn, row["id"], reg["situacao"], AUTOR, agora)
                situacoes_mudadas.append((reg["nome_ufv"], situacao_antes, reg["situacao"]))

            ultima = conn.execute(
                "SELECT texto FROM pendencias WHERE usina_id = ? ORDER BY criado_em DESC LIMIT 1",
                (row["id"],),
            ).fetchone()
            texto_atual = ultima["texto"] if ultima else None
            if reg["observacao"] and reg["observacao"] != texto_atual:
                db.adicionar_pendencia(conn, row["id"], reg["observacao"], reg["responsavel_acao"], AUTOR, agora)
                pendencias_add.append(reg["nome_ufv"])

        ugs_planilha = set(registros.keys())
        ativas_banco = conn.execute("SELECT ug, nome_ufv, etapa_atual FROM usinas WHERE status = 'ativa'").fetchall()
        sumidas = [(r["nome_ufv"], r["etapa_atual"]) for r in ativas_banco if r["ug"] not in ugs_planilha]

    print(f"=== Sincronização da aba {nome_aba} ===\n")
    print(f"Usinas novas criadas: {len(criadas)}")
    for n in criadas:
        print(f"  + {n}")
    print(f"\nMudanças de etapa: {len(etapas_mudadas)}")
    for n, de, para in etapas_mudadas:
        print(f"  ~ {n}: {de} -> {para}")
    print(f"\nMudanças de situação: {len(situacoes_mudadas)}")
    for n, de, para in situacoes_mudadas:
        print(f"  ~ {n}: {de} -> {para}")
    print(f"\nPendências novas adicionadas: {len(pendencias_add)}")
    for n in pendencias_add:
        print(f"  ! {n}")
    print(f"\nUsinas ignoradas (já não estão 'ativa' no sistema): {len(ignoradas_ja_graduadas)}")
    for n in ignoradas_ja_graduadas:
        print(f"  = {n}")
    print(f"\nUsinas 'ativa' no sistema que NÃO aparecem nessa aba (revisar manualmente): {len(sumidas)}")
    for n, etapa in sumidas:
        print(f"  ? {n} (etapa atual: {etapa})")
    if nao_mapeadas:
        print("\nSeções não reconhecidas (usadas com fallback 'TT Usina'):")
        for s in sorted(nao_mapeadas):
            print(f"  - {s}")


if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Uso: python sincronizar_semana.py <nome_da_aba>")
        sys.exit(1)
    principal(sys.argv[1])
