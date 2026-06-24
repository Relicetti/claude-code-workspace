"""Valida o prompt com casos reais — rode antes de ligar o WhatsApp."""
import json
import os
import sys
import anthropic
from dotenv import load_dotenv

load_dotenv()
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")

with open(os.path.join(os.path.dirname(__file__), "../prompts/sistema.md")) as f:
    SYSTEM_PROMPT = f.read()

client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

H = lambda origem, texto: {"origem": origem, "conteudo": texto}
HIST_PITCH = [
    H("vendedor", "Boa tarde! Tudo bem? Aqui é o Luan, da Kora Energia 👋 Falo com João?"),
    H("lead",     "Sim, sou eu."),
    H("vendedor", "Ótimo João! A gente identificou que o perfil da sua empresa pode se encaixar bem num modelo de economia de energia. Conseguimos reduzir até 25% na conta de luz, sem obra nem investimento. Você é o responsável pela conta de energia aí?"),
]
HIST_QUALIF = HIST_PITCH + [
    H("lead",     "Sou sim."),
    H("vendedor", "Boa! Só pra ver se faz sentido — a conta de energia costuma vir alta ou mais controlada?"),
]
HIST_CTA = HIST_QUALIF + [
    H("lead",     "Vem bem alta, umas 12 mil por mês."),
    H("vendedor", "Então faz todo sentido! Posso gerar uma simulação personalizada. Me passa o valor médio da conta e o CNPJ?"),
]

CASOS = [
    # ── Fluxo positivo ──────────────────────────────────────────────────────
    ("CONFIRMACAO esperada",
     "Sim, sou eu mesmo.",
     [H("vendedor", "Boa tarde! Tudo bem? Aqui é o Luan, da Kora Energia 👋 Falo com Maria?")]),

    ("INTERESSE após pitch",
     "Interessante, como funciona exatamente?",
     HIST_PITCH),

    ("INTERESSE_ALTO — pergunta técnica",
     "Tem fidelidade? Precisa assinar contrato?",
     HIST_PITCH),

    ("LEAD_QUENTE — passou conta e CNPJ",
     "Claro, a conta vem em torno de R$8.000. CNPJ: 12.345.678/0001-99",
     HIST_CTA),

    ("LEAD_QUENTE — só passou conta",
     "Uns R$15.000 por mês.",
     HIST_CTA),

    # ── Objeções ────────────────────────────────────────────────────────────
    ("OBJECAO_SOLAR",
     "Já temos energia solar instalada aqui.",
     HIST_PITCH),

    ("OBJECAO_SEM_INTERESSE — 1ª vez",
     "Não tenho interesse não.",
     HIST_PITCH),

    ("OBJECAO_SEM_INTERESSE — 2ª vez → deve virar ENCERRAR",
     "Já disse que não tenho interesse.",
     HIST_PITCH + [
         H("lead",     "Não tenho interesse não."),
         H("vendedor", "Entendo! É mais porque o momento não tá bom, ou já tem alguma solução de energia?"),
     ]),

    ("OBJECAO_PERCENTUAL",
     "25% é pouco, já recebi oferta de 30%.",
     HIST_CTA),

    ("OBJECAO_QUEM_E_VOCE",
     "Nunca ouvi falar da Kora. O que é isso?",
     HIST_PITCH),

    ("OBJECAO_CONTATO",
     "Como você conseguiu meu número?",
     HIST_PITCH),

    ("OBJECAO_MATERIAL",
     "Me manda um material por email antes.",
     HIST_CTA),

    ("OBJECAO_CONCORRENTE",
     "Já tenho contrato com outra empresa de energia.",
     HIST_PITCH),

    ("NAO_RESPONSAVEL",
     "Isso é com o financeiro, não comigo.",
     HIST_PITCH),

    # ── Encerramentos ────────────────────────────────────────────────────────
    ("FORA_DO_PERFIL",
     "Aqui é pequeno, a conta vem uns R$800 por mês.",
     HIST_QUALIF),

    ("AGENDAMENTO",
     "Agora não posso, pode me chamar na sexta de manhã?",
     HIST_PITCH),

    ("ENCERRAR — hostil",
     "Me tira dessa lista, não quero mais ser perturbado.",
     []),

    ("MIDIA_NAO_LIDA",
     "[áudio]",
     HIST_PITCH),
]


def classificar(historico, ultima_mensagem):
    historico_txt = "\n".join(f"[{m['origem'].upper()}] {m['conteudo']}" for m in historico)
    user_content = (
        f"Histórico da conversa:\n{historico_txt or '(sem histórico — primeira mensagem)'}"
        f"\n\nÚltima mensagem do lead:\n{ultima_mensagem}"
    )
    resp = client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        system=SYSTEM_PROMPT,
        messages=[{"role": "user", "content": user_content}],
    )
    raw = resp.content[0].text.strip()
    if raw.startswith("```"):
        raw = raw.split("```")[1]
        if raw.startswith("json"):
            raw = raw[4:]
    return json.loads(raw.strip())


def cor(intencao):
    if intencao in ("LEAD_QUENTE", "CONFIRMACAO", "INTERESSE", "INTERESSE_ALTO"):
        return "\033[92m"   # verde
    if intencao in ("ENCERRAR", "FORA_DO_PERFIL"):
        return "\033[91m"   # vermelho
    if intencao == "AGENDAMENTO":
        return "\033[94m"   # azul
    return "\033[93m"       # amarelo


RESET = "\033[0m"
ok = 0
falha = 0

print("\n" + "═" * 60)
print("  VALIDAÇÃO DO PROMPT — KORA GD")
print("═" * 60)

for descricao, msg, hist in CASOS:
    try:
        r = classificar(hist, msg)
        intencao = r.get("intencao", "?")
        c = cor(intencao)
        print(f"\n{c}▶ {descricao}{RESET}")
        print(f"  Lead: \"{msg}\"")
        print(f"  Intenção: {c}{intencao}{RESET}")
        print(f"  Resposta: {r.get('proxima_mensagem','')[:120]}{'...' if len(r.get('proxima_mensagem','')) > 120 else ''}")
        if r.get("observacao"):
            print(f"  Obs: {r['observacao'][:100]}")
        ok += 1
    except Exception as e:
        falha += 1
        print(f"\n\033[91m✗ {descricao}\033[0m")
        print(f"  ERRO: {e}")

print("\n" + "═" * 60)
print(f"  Resultado: {ok} OK · {falha} erros de {len(CASOS)} casos")
print("═" * 60 + "\n")
