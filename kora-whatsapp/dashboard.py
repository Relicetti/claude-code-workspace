"""Dashboard de controle — Kora GD WhatsApp Automação."""
import sqlite3
import os
import pandas as pd
import streamlit as st
from datetime import datetime

DB_PATH = os.getenv("DB_PATH", "./db/kora.db")

st.set_page_config(
    page_title="Kora GD — WhatsApp",
    page_icon="⚡",
    layout="wide",
)

st.markdown("""
<style>
  .metric-card {
    background: #1e2130; border-radius: 12px; padding: 20px 24px;
    text-align: center; border: 1px solid #2e3250;
  }
  .metric-card .val { font-size: 2rem; font-weight: 700; color: #fff; }
  .metric-card .lbl { font-size: 0.8rem; color: #8b8fa8; margin-top: 4px; }
  .badge-ativo      { background:#1a3050; color:#60a5fa; border-radius:6px; padding:2px 10px; font-size:.8rem; }
  .badge-quente     { background:#3a2010; color:#fb923c; border-radius:6px; padding:2px 10px; font-size:.8rem; }
  .badge-negociacao { background:#1a3a2a; color:#4ade80; border-radius:6px; padding:2px 10px; font-size:.8rem; }
  .badge-descartado { background:#2a1a1a; color:#f87171; border-radius:6px; padding:2px 10px; font-size:.8rem; }
  .badge-fora       { background:#2a2a1a; color:#fde68a; border-radius:6px; padding:2px 10px; font-size:.8rem; }
</style>
""", unsafe_allow_html=True)


# ── Helpers de banco ───────────────────────────────────────────────────────────

def get_conn():
    if not os.path.exists(DB_PATH):
        return None
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def carregar_leads() -> pd.DataFrame:
    conn = get_conn()
    if conn is None:
        return pd.DataFrame()
    df = pd.read_sql_query(
        "SELECT id, telefone, nome, empresa, status, etapa, conta_energia, cnpj, criado_em, atualizado_em FROM leads ORDER BY atualizado_em DESC",
        conn,
    )
    conn.close()
    return df


def carregar_historico(lead_id: int) -> pd.DataFrame:
    conn = get_conn()
    if conn is None:
        return pd.DataFrame()
    df = pd.read_sql_query(
        "SELECT origem, conteudo, intencao_ia, enviado_em FROM mensagens WHERE lead_id = ? ORDER BY enviado_em ASC",
        conn,
        params=(lead_id,),
    )
    conn.close()
    return df


def inserir_leads_df(df_leads: pd.DataFrame) -> tuple[int, int]:
    conn = get_conn()
    if conn is None:
        return 0, 0
    inseridos = 0
    duplicados = 0
    for _, row in df_leads.iterrows():
        telefone = str(row.get("telefone", "")).strip().replace(" ", "").replace("-", "").replace("(", "").replace(")", "")
        if not telefone:
            continue
        existe = conn.execute("SELECT id FROM leads WHERE telefone = ?", (telefone,)).fetchone()
        if existe:
            duplicados += 1
        else:
            conn.execute(
                "INSERT INTO leads (telefone, nome, empresa) VALUES (?, ?, ?)",
                (telefone, str(row.get("nome", "") or ""), str(row.get("empresa", "") or "")),
            )
            inseridos += 1
    conn.commit()
    conn.close()
    return inseridos, duplicados


STATUS_LABEL = {
    "ativo": "Ativo",
    "qualificado": "Qualificado",
    "lead_quente": "Lead quente",
    "em_negociacao": "Em negociação",
    "descartado": "Descartado",
    "fora_do_perfil": "Fora do perfil",
}

STATUS_BADGE = {
    "ativo":         "badge-ativo",
    "qualificado":   "badge-ativo",
    "lead_quente":   "badge-quente",
    "em_negociacao": "badge-negociacao",
    "descartado":    "badge-descartado",
    "fora_do_perfil":"badge-fora",
}

ORIGEM_ICON = {"vendedor": "🤖", "lead": "👤"}


# ── Sidebar ────────────────────────────────────────────────────────────────────

with st.sidebar:
    st.title("⚡ Kora GD")
    st.caption("Automação WhatsApp")
    st.divider()

    pagina = st.radio(
        "Navegação",
        ["Painel", "Conversas", "Leads", "Disparar", "Importar contatos", "Configurações"],
        label_visibility="collapsed",
    )

    st.divider()

    bot_ativo = st.toggle("Bot ativo", value=True)
    if bot_ativo:
        st.success("Bot rodando", icon="✅")
    else:
        st.warning("Bot pausado", icon="⏸️")

    st.divider()
    if st.button("🔄 Atualizar dados"):
        st.cache_data.clear()
        st.rerun()


# ── Página: Painel ─────────────────────────────────────────────────────────────

if pagina == "Painel":
    st.markdown("## Painel geral")

    df = carregar_leads()

    if df.empty:
        st.info("Nenhum lead no banco ainda. Importe contatos para começar.", icon="👈")
        st.stop()

    total       = len(df)
    ativos      = len(df[df["status"].isin(["ativo", "qualificado"])])
    quentes     = len(df[df["status"] == "lead_quente"])
    negociacao  = len(df[df["status"] == "em_negociacao"])
    descartados = len(df[df["status"] == "descartado"])
    fora        = len(df[df["status"] == "fora_do_perfil"])
    taxa_resp   = round((total - ativos) / total * 100, 1) if total else 0

    c1, c2, c3, c4, c5 = st.columns(5)
    for col, val, lbl in [
        (c1, total,         "Total de leads"),
        (c2, ativos,        "Em prospecção"),
        (c3, f"{quentes + negociacao}", "Quentes / negociando"),
        (c4, descartados + fora, "Encerrados"),
        (c5, f"{taxa_resp}%", "Taxa de resposta"),
    ]:
        col.markdown(f"""
        <div class="metric-card">
          <div class="val">{val}</div>
          <div class="lbl">{lbl}</div>
        </div>""", unsafe_allow_html=True)

    st.markdown("<br>", unsafe_allow_html=True)

    # Funil
    st.markdown("### Funil de prospecção")
    funil = pd.DataFrame({
        "Etapa": ["Total", "Responderam", "Qualificados", "Lead quente", "Em negociação"],
        "Qtd":   [total, total - ativos, negociacao + quentes, quentes, negociacao],
    })

    import plotly.express as px
    fig = px.funnel(funil, x="Qtd", y="Etapa", color_discrete_sequence=["#3b82f6"])
    fig.update_layout(
        plot_bgcolor="#0e1117", paper_bgcolor="#0e1117",
        font_color="#fff", height=320, margin=dict(l=0, r=0, t=20, b=0),
    )
    st.plotly_chart(fig, use_container_width=True)

    # Leads quentes em destaque
    df_quentes = df[df["status"].isin(["lead_quente", "em_negociacao"])].copy()
    if not df_quentes.empty:
        st.markdown("### 🔥 Leads quentes — ação necessária")
        for _, row in df_quentes.iterrows():
            with st.container(border=True):
                col1, col2, col3 = st.columns([3, 2, 1])
                col1.markdown(f"**{row['nome'] or '(sem nome)'}** · {row['empresa'] or '-'}")
                col1.caption(f"📱 {row['telefone']}")
                col2.markdown(f"Conta: **R$ {row['conta_energia'] or '?'}/mês** · CNPJ: {row['cnpj'] or '?'}")
                badge = STATUS_BADGE.get(row["status"], "badge-ativo")
                col3.markdown(f'<span class="{badge}">{STATUS_LABEL.get(row["status"], row["status"])}</span>', unsafe_allow_html=True)


# ── Página: Conversas ─────────────────────────────────────────────────────────

elif pagina == "Conversas":
    st.markdown("## Conversas")

    df = carregar_leads()
    df_com_msgs = df[df["status"] != "ativo"].copy() if not df.empty else pd.DataFrame()

    if df.empty or df_com_msgs.empty:
        st.info("Nenhuma conversa iniciada ainda.")
        st.stop()

    # Seletor de lead
    opcoes = {
        f"{'🔥 ' if r['status'] in ('lead_quente','em_negociacao') else ''}{r['nome'] or r['telefone']} — {STATUS_LABEL.get(r['status'], r['status'])}": r['id']
        for _, r in df_com_msgs.iterrows()
    }
    # Inclui todos os leads com mensagens
    df_todos = carregar_leads()
    leads_com_hist = []
    for _, r in df_todos.iterrows():
        hist = carregar_historico(int(r["id"]))
        if not hist.empty:
            leads_com_hist.append(r)

    if not leads_com_hist:
        st.info("Nenhuma conversa com mensagens ainda.")
        st.stop()

    opcoes2 = {
        f"{'🔥 ' if r['status'] in ('lead_quente','em_negociacao') else ''}{r['nome'] or r['telefone']} — {STATUS_LABEL.get(r['status'], r['status'])}": int(r['id'])
        for r in leads_com_hist
    }

    selecionado_label = st.selectbox("Selecione o lead", list(opcoes2.keys()))
    lead_id = opcoes2[selecionado_label]
    lead_row = df_todos[df_todos["id"] == lead_id].iloc[0]

    # Info do lead
    badge = STATUS_BADGE.get(lead_row["status"], "badge-ativo")
    col1, col2, col3 = st.columns(3)
    col1.markdown(f"**Telefone:** {lead_row['telefone']}")
    col2.markdown(f"**Empresa:** {lead_row['empresa'] or '-'}")
    col3.markdown(f'**Status:** <span class="{badge}">{STATUS_LABEL.get(lead_row["status"], lead_row["status"])}</span>', unsafe_allow_html=True)

    st.divider()

    # Histórico estilo chat
    hist = carregar_historico(lead_id)
    if hist.empty:
        st.caption("Sem mensagens.")
    else:
        for _, msg in hist.iterrows():
            is_bot = msg["origem"] == "vendedor"
            alinhamento = "flex-end" if is_bot else "flex-start"
            cor = "#1e3a5f" if is_bot else "#1e2a1e"
            autor = "🤖 Luan (bot)" if is_bot else "👤 Lead"
            intencao_tag = f' &nbsp;<span style="font-size:.7rem;color:#888">{msg["intencao_ia"]}</span>' if msg["intencao_ia"] else ""
            st.markdown(
                f'<div style="display:flex;justify-content:{alinhamento};margin:6px 0">'
                f'<div style="max-width:75%">'
                f'<div style="font-size:.72rem;color:#666;margin-bottom:2px;text-align:{"right" if is_bot else "left"}">{autor}{intencao_tag}</div>'
                f'<div style="background:{cor};padding:10px 14px;border-radius:12px;font-size:.88rem;line-height:1.5">{msg["conteudo"]}</div>'
                f'<div style="font-size:.68rem;color:#555;margin-top:2px;text-align:{"right" if is_bot else "left"}">{msg["enviado_em"]}</div>'
                f'</div></div>',
                unsafe_allow_html=True,
            )

    if st.button("🔄 Atualizar conversa"):
        st.rerun()


# ── Página: Leads ─────────────────────────────────────────────────────────────

elif pagina == "Leads":
    st.markdown("## Leads")

    df = carregar_leads()
    if df.empty:
        st.info("Nenhum lead cadastrado ainda.")
        st.stop()

    # Filtros
    col1, col2, col3 = st.columns([2, 2, 1])
    busca  = col1.text_input("Buscar por nome, empresa ou telefone", placeholder="Digite...")
    filtro = col2.multiselect(
        "Status",
        options=list(STATUS_LABEL.keys()),
        default=list(STATUS_LABEL.keys()),
        format_func=lambda s: STATUS_LABEL[s],
    )
    col3.markdown("<br>", unsafe_allow_html=True)

    df_filtrado = df[df["status"].isin(filtro)]
    if busca:
        mask = (
            df_filtrado["nome"].str.contains(busca, case=False, na=False) |
            df_filtrado["empresa"].str.contains(busca, case=False, na=False) |
            df_filtrado["telefone"].str.contains(busca, case=False, na=False)
        )
        df_filtrado = df_filtrado[mask]

    st.caption(f"{len(df_filtrado)} leads exibidos")

    # Tabela
    for _, row in df_filtrado.iterrows():
        badge = STATUS_BADGE.get(row["status"], "badge-ativo")
        with st.expander(
            f"{'🔥 ' if row['status'] in ('lead_quente','em_negociacao') else ''}"
            f"{row['nome'] or '(sem nome)'} · {row['empresa'] or '-'} · {row['telefone']}"
        ):
            c1, c2 = st.columns([1, 2])
            with c1:
                st.markdown(f'**Status:** <span class="{badge}">{STATUS_LABEL.get(row["status"], row["status"])}</span>', unsafe_allow_html=True)
                st.markdown(f"**Etapa:** {row['etapa']}/5")
                st.markdown(f"**Conta energia:** R$ {row['conta_energia'] or '?'}/mês")
                st.markdown(f"**CNPJ:** {row['cnpj'] or 'não informado'}")
                st.caption(f"Cadastrado em {row['criado_em']}")

            with c2:
                st.markdown("**Histórico da conversa**")
                hist = carregar_historico(int(row["id"]))
                if hist.empty:
                    st.caption("Sem mensagens ainda.")
                else:
                    for _, msg in hist.iterrows():
                        icon = ORIGEM_ICON.get(msg["origem"], "💬")
                        alinhamento = "right" if msg["origem"] == "vendedor" else "left"
                        cor = "#1e3a5f" if msg["origem"] == "vendedor" else "#1e2a1e"
                        st.markdown(
                            f'<div style="text-align:{alinhamento};margin:4px 0">'
                            f'<span style="background:{cor};padding:6px 12px;border-radius:12px;font-size:.85rem;display:inline-block;max-width:85%">'
                            f'{icon} {msg["conteudo"]}</span>'
                            f'<br><span style="font-size:.7rem;color:#666">{msg["enviado_em"]}'
                            f'{" · " + msg["intencao_ia"] if msg["intencao_ia"] else ""}</span>'
                            f'</div>',
                            unsafe_allow_html=True,
                        )


# ── Página: Disparar ──────────────────────────────────────────────────────────

elif pagina == "Disparar":
    import httpx

    BRIDGE_URL = os.getenv("BRIDGE_URL", "http://localhost:9000/send")
    MSG_PADRAO = os.getenv("MSG_ABERTURA", "Boa tarde! Tudo bem? Aqui é o Luan, da Kora Energia 👋 Falo com {nome}?")

    st.markdown("## Disparar mensagem")

    tab1, tab2 = st.tabs(["Contato avulso", "Disparar para lista de leads"])

    with tab1:
        with st.form("form_disparo"):
            col1, col2 = st.columns(2)
            telefone = col1.text_input("Telefone (com DDI e DDD)", placeholder="5541999990000")
            nome = col2.text_input("Nome", placeholder="João Silva")
            mensagem = st.text_area("Mensagem", value=MSG_PADRAO, height=100)
            enviado = st.form_submit_button("Enviar mensagem", type="primary")

        if enviado:
            if not telefone or not nome:
                st.error("Preencha telefone e nome.")
            else:
                texto = mensagem.replace("{nome}", nome)
                try:
                    r = httpx.post(BRIDGE_URL, json={"telefone": telefone, "mensagem": texto}, timeout=30)
                    if r.status_code == 200:
                        st.success(f"Mensagem enviada para {nome} ({telefone})")
                        conn = get_conn()
                        if conn:
                            lead = conn.execute("SELECT id FROM leads WHERE telefone = ?", (telefone,)).fetchone()
                            if not lead:
                                conn.execute("INSERT INTO leads (telefone, nome) VALUES (?, ?)", (telefone, nome))
                                conn.commit()
                                lead = conn.execute("SELECT id FROM leads WHERE telefone = ?", (telefone,)).fetchone()
                            conn.execute("INSERT INTO mensagens (lead_id, origem, conteudo) VALUES (?, 'vendedor', ?)", (lead[0], texto))
                            conn.commit()
                            conn.close()
                    else:
                        st.error(f"Erro ao enviar: {r.text}")
                except Exception as e:
                    st.error(f"Erro de conexão com a bridge: {e}")

    with tab2:
        df = carregar_leads()
        df_ativos = df[df["status"] == "ativo"].copy() if not df.empty else pd.DataFrame()

        if df_ativos.empty:
            st.info("Nenhum lead com status 'ativo' para disparar.")
        else:
            st.caption(f"{len(df_ativos)} leads ativos disponíveis")
            st.dataframe(
                df_ativos[["nome", "telefone", "empresa"]].rename(
                    columns={"nome": "Nome", "telefone": "Telefone", "empresa": "Empresa"}
                ),
                use_container_width=True, hide_index=True,
            )
            mensagem_lista = st.text_area("Mensagem para todos", value=MSG_PADRAO, height=100)
            delay = st.slider("Delay entre mensagens (segundos)", 30, 120, 45)

            if st.button("Disparar para todos os ativos", type="primary"):
                import time
                prog = st.progress(0)
                resultados = []
                for i, (_, row) in enumerate(df_ativos.iterrows()):
                    texto = mensagem_lista.replace("{nome}", row["nome"] or "")
                    try:
                        r = httpx.post(BRIDGE_URL, json={"telefone": row["telefone"], "mensagem": texto}, timeout=10)
                        ok = r.status_code == 200
                    except Exception:
                        ok = False
                    resultados.append((row["nome"] or row["telefone"], ok))
                    prog.progress((i + 1) / len(df_ativos))
                    if i < len(df_ativos) - 1:
                        time.sleep(delay)
                enviados = sum(1 for _, ok in resultados if ok)
                st.success(f"{enviados}/{len(df_ativos)} mensagens enviadas.")


# ── Página: Importar contatos ──────────────────────────────────────────────────

elif pagina == "Importar contatos":
    st.markdown("## Importar contatos")
    st.info(
        "Envie um arquivo **.xlsx** ou **.csv** com pelo menos uma coluna **telefone**. "
        "Colunas opcionais: **nome**, **empresa**.",
        icon="📋",
    )

    arquivo = st.file_uploader("Selecione o arquivo", type=["xlsx", "csv"])

    if arquivo:
        try:
            if arquivo.name.endswith(".csv"):
                df_import = pd.read_csv(arquivo, dtype=str)
            else:
                df_import = pd.read_excel(arquivo, dtype=str)
        except Exception as e:
            st.error(f"Erro ao ler arquivo: {e}")
            st.stop()

        df_import.columns = [c.strip().lower() for c in df_import.columns]

        if "telefone" not in df_import.columns:
            st.error("Coluna **telefone** não encontrada. Renomeie e tente novamente.")
            st.stop()

        # Preview
        st.markdown(f"**Preview — {len(df_import)} linhas detectadas**")
        st.dataframe(df_import.head(10), use_container_width=True)

        colunas_ok = [c for c in ["telefone", "nome", "empresa"] if c in df_import.columns]
        df_para_inserir = df_import[colunas_ok].copy()

        st.markdown(f"**Colunas mapeadas:** {', '.join(colunas_ok)}")

        if st.button("✅ Confirmar importação", type="primary"):
            if get_conn() is None:
                st.error("Banco não encontrado. Execute `python scripts/init_db.py` primeiro.")
            else:
                inseridos, duplicados = inserir_leads_df(df_para_inserir)
                st.success(f"{inseridos} leads importados com sucesso.")
                if duplicados:
                    st.warning(f"{duplicados} telefones já existiam e foram ignorados.")
                st.cache_data.clear()


# ── Página: Configurações ──────────────────────────────────────────────────────

elif pagina == "Configurações":
    st.markdown("## Configurações")

    with st.expander("Variáveis de ambiente", expanded=True):
        st.markdown("Edite o arquivo `.env` na pasta do projeto com os valores abaixo:")
        st.code("""
ANTHROPIC_API_KEY=sk-ant-...
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=sua-chave
EVOLUTION_INSTANCE=kora-chip1
VENDEDOR_WHATSAPP=5511999999999
DB_PATH=./db/kora.db
        """, language="bash")

    with st.expander("Limites operacionais"):
        st.markdown("""
| Parâmetro | Referência |
|---|---|
| Mensagens por chip/dia | ~30 (chip pessoal) |
| Mensagens por Business API | 1.000+/dia |
| Delay entre mensagens | 30–90s recomendado |
| Janela de resposta WhatsApp | 24h após última msg do lead |
        """)

    with st.expander("Como subir o bot"):
        st.code("""
# 1. Instalar dependências
pip install -r requirements.txt

# 2. Criar banco
python scripts/init_db.py

# 3. Subir API local (terminal 1)
uvicorn scripts.api:app --port 3000 --reload

# 4. Subir bot de webhook (terminal 2)
uvicorn scripts.bot:app --port 8000 --reload

# 5. Abrir dashboard (terminal 3)
streamlit run dashboard.py
        """, language="bash")

    with st.expander("Status do banco"):
        conn = get_conn()
        if conn is None:
            st.error("Banco não encontrado em " + DB_PATH)
        else:
            total = conn.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
            msgs  = conn.execute("SELECT COUNT(*) FROM mensagens").fetchone()[0]
            conn.close()
            st.success(f"Banco OK · {total} leads · {msgs} mensagens")
