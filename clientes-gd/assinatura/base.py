"""Interface de assinatura eletrônica -- desacoplada do provedor concreto,
mesmo padrão da camada de gateway de pagamento (fase futura), pra trocar de
provedor com baixo custo se necessário."""
from abc import ABC, abstractmethod


class AssinaturaEletronica(ABC):
    @abstractmethod
    def configurado(self) -> bool:
        """True se as credenciais do provedor estão presentes (env vars)."""

    @abstractmethod
    def enviar_documento(self, contrato, arquivo_path, nome_signatario, email_signatario) -> str:
        """Envia o PDF do contrato para assinatura. Retorna o
        documento_externo_id do provedor."""

    @abstractmethod
    def consultar_status(self, documento_externo_id) -> dict:
        """Retorna {'assinado': bool, 'arquivo_url': str|None}."""

    @abstractmethod
    def processar_webhook(self, payload: dict) -> dict | None:
        """Extrai do payload do webhook: {'documento_externo_id', 'assinado',
        'arquivo_url'}. Retorna None se o payload não for reconhecido."""
