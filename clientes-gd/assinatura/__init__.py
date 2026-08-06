from .autentique import AutentiqueAssinatura

_instancia = None


def obter_assinatura():
    """Ponto único de troca de provedor de assinatura eletrônica -- hoje só
    existe a Autentique, mas outras implementações de AssinaturaEletronica
    (base.py) podem ser adicionadas aqui sem mexer no app.py."""
    global _instancia
    if _instancia is None:
        _instancia = AutentiqueAssinatura()
    return _instancia
