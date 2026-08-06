"""
Integração com a API da Autentique (GraphQL, https://api.autentique.com.br/v2/graphql).

IMPORTANTE: a Autentique não fornece um token de API neste ambiente ainda
(ASSINATURA_AUTENTIQUE_API_TOKEN não configurado). Esta implementação segue
o formato documentado da API (mutation createDocument via GraphQL multipart
upload, consulta por ID, webhook por evento de documento assinado) mas
**precisa ser validada contra uma conta real** antes de ir pra produção --
nomes exatos de campos podem mudar entre versões da API. Até lá, todo
método degrada graciosamente (configurado() == False) em vez de quebrar o
fluxo do app.
"""
import json
import os

import requests

from .base import AssinaturaEletronica

API_URL = "https://api.autentique.com.br/v2/graphql"

MUTATION_CRIAR_DOCUMENTO = """
mutation CriarDocumento($document: DocumentInput!, $signers: [SignerInput!]!, $file: Upload!) {
  createDocument(document: $document, signers: $signers, file: $file) {
    id
    name
  }
}
"""

QUERY_DOCUMENTO = """
query Documento($id: UUID!) {
  document(id: $id) {
    id
    name
    signatures {
      email
      action { name }
      signed { created_at }
    }
    files { signed }
  }
}
"""


class AutentiqueAssinatura(AssinaturaEletronica):
    def __init__(self):
        self.api_token = os.environ.get("ASSINATURA_AUTENTIQUE_API_TOKEN")
        self.webhook_token = os.environ.get("ASSINATURA_AUTENTIQUE_WEBHOOK_TOKEN")

    def configurado(self) -> bool:
        return bool(self.api_token)

    def _headers(self):
        return {"Authorization": f"Bearer {self.api_token}"}

    def enviar_documento(self, contrato, arquivo_path, nome_signatario, email_signatario) -> str:
        if not self.configurado():
            raise RuntimeError("ASSINATURA_AUTENTIQUE_API_TOKEN não configurado.")

        nome_doc = f"Contrato {contrato['tipo']} - {nome_signatario}"
        operations = json.dumps({
            "query": MUTATION_CRIAR_DOCUMENTO,
            "variables": {
                "document": {"name": nome_doc},
                "signers": [{"email": email_signatario, "action": "SIGN"}],
                "file": None,
            },
        })
        map_data = json.dumps({"0": ["variables.file"]})

        with open(arquivo_path, "rb") as f:
            files = {
                "operations": (None, operations),
                "map": (None, map_data),
                "0": (os.path.basename(arquivo_path), f, "application/pdf"),
            }
            resp = requests.post(API_URL, headers=self._headers(), files=files, timeout=30)
        resp.raise_for_status()
        dados = resp.json()
        if dados.get("errors"):
            raise RuntimeError(f"Erro da API Autentique: {dados['errors']}")
        return dados["data"]["createDocument"]["id"]

    def consultar_status(self, documento_externo_id) -> dict:
        if not self.configurado():
            return {"assinado": False, "arquivo_url": None}

        resp = requests.post(
            API_URL, headers=self._headers(),
            json={"query": QUERY_DOCUMENTO, "variables": {"id": documento_externo_id}},
            timeout=30,
        )
        resp.raise_for_status()
        dados = resp.json().get("data", {}).get("document") or {}
        assinaturas = dados.get("signatures") or []
        assinado = bool(assinaturas) and all(s.get("signed", {}).get("created_at") for s in assinaturas)
        arquivo_url = (dados.get("files") or {}).get("signed")
        return {"assinado": assinado, "arquivo_url": arquivo_url}

    def validar_webhook(self, token_recebido) -> bool:
        """Compara o token configurado no dashboard da Autentique (enviado
        como query param na URL do webhook) contra o esperado, sem
        vazamento por timing attack. Se nenhum token estiver configurado,
        recusa por padrão (fail-closed)."""
        if not self.webhook_token:
            return False
        import hmac
        return hmac.compare_digest(token_recebido or "", self.webhook_token)

    def processar_webhook(self, payload: dict) -> dict | None:
        # Formato ainda a confirmar contra a conta real -- assume que o
        # payload traz o id do documento e o evento de assinatura.
        documento_id = payload.get("document", {}).get("id") or payload.get("document_id")
        if not documento_id:
            return None
        evento = payload.get("event") or payload.get("type") or ""
        assinado = "sign" in evento.lower()
        arquivo_url = (payload.get("document", {}).get("files") or {}).get("signed")
        return {
            "documento_externo_id": documento_id,
            "assinado": assinado,
            "arquivo_url": arquivo_url,
        }
