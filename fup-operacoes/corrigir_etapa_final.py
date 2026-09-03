"""
Correção pontual: usinas que já entraram em "Operação" ou "Rescindida" (status
já mudado), mas ficaram com etapa_atual/data_entrada_etapa_atual travados na
última etapa de pipeline em que estiveram (bug em db.mudar_etapa, corrigido em
seguida no código -- este script conserta só os dados que já existiam antes
do fix).

Roda em modo dry-run por padrão: só mostra o que mudaria, não grava nada.
Pra aplicar de verdade:

    python corrigir_etapa_final.py --aplicar

IMPORTANTE: baixe/backupe o fup.db de produção antes de rodar com --aplicar.
"""
import sys

import db


def encontrar_usinas_quebradas(conn):
    return conn.execute(
        """SELECT * FROM usinas
           WHERE (status = 'operacao' AND etapa_atual != 'Operação')
              OR (status = 'rescindida' AND etapa_atual != 'Rescindida')"""
    ).fetchall()


def data_real_da_transicao(conn, usina_id, etapa_final):
    """Data em que a usina de fato entrou na etapa final, buscada no próprio
    histórico (a linha que a rota/mudar_etapa já registrou corretamente),
    em vez de inventar uma data nova."""
    row = conn.execute(
        """SELECT data_entrada FROM historico_etapas
           WHERE usina_id = ? AND etapa = ?
           ORDER BY data_entrada DESC LIMIT 1""",
        (usina_id, etapa_final),
    ).fetchone()
    return row["data_entrada"] if row else None


def main():
    aplicar = "--aplicar" in sys.argv

    with db.conectar() as conn:
        quebradas = encontrar_usinas_quebradas(conn)

        if not quebradas:
            print("Nenhuma usina com etapa_atual desatualizada. Nada a fazer.")
            return

        print(f"{len(quebradas)} usina(s) com etapa_atual desatualizada:\n")

        correcoes = []
        for usina in quebradas:
            etapa_final = "Operação" if usina["status"] == "operacao" else "Rescindida"
            data_real = data_real_da_transicao(conn, usina["id"], etapa_final)
            if data_real is None:
                print(
                    f"  [PULADA] {usina['nome_ufv']} (id={usina['id']}): status="
                    f"'{usina['status']}' mas não achei linha de histórico pra "
                    f"'{etapa_final}' -- corrija manualmente."
                )
                continue
            correcoes.append((usina, etapa_final, data_real))
            print(
                f"  {usina['nome_ufv']} (id={usina['id']}): "
                f"etapa_atual '{usina['etapa_atual']}' -> '{etapa_final}', "
                f"data_entrada_etapa_atual '{usina['data_entrada_etapa_atual']}' -> '{data_real}'"
            )

        if not aplicar:
            print(f"\nDry-run: nada foi alterado. Rode com --aplicar pra gravar {len(correcoes)} correção(ões).")
            return

        for usina, etapa_final, data_real in correcoes:
            conn.execute(
                "UPDATE usinas SET etapa_atual = ?, data_entrada_etapa_atual = ?, "
                "situacao_etapa = 'Nova', situacao_atualizada_em = NULL, situacao_atualizada_por = NULL "
                "WHERE id = ?",
                (etapa_final, data_real, usina["id"]),
            )
            db.registrar_atividade(
                conn, "Sistema",
                "Corrigiu etapa_atual travada em Operação/Rescindida",
                usina["nome_ufv"], db.agora().isoformat(),
            )

        print(f"\n{len(correcoes)} usina(s) corrigida(s).")


if __name__ == "__main__":
    main()
