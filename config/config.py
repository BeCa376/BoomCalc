import os
from config.env import DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD, CRYPTO_KEY


class Config:
    """Configuração da aplicação. Os valores reais de banco/senha vêm de
    config/.env (lido por config/env.py) — não fica nada sensível aqui
    no código."""

    SQLALCHEMY_DATABASE_URI = os.environ.get(
        "DATABASE_URL",
        f"mysql+pymysql://{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SECRET_KEY = CRYPTO_KEY or os.environ.get("SECRET_KEY", "troque-esta-chave-em-producao")

    # Regras de negócio configuráveis (RN08 etc.)
    LIMITE_VENTO_MS = float(os.environ.get("LIMITE_VENTO_MS", 12.5))
    LIMITE_PERCENTUAL_ALERTA = 80  # a partir daqui, status = "proximo_limite"

    # Sessão (login): cookie assinado, inacessível ao JavaScript
    SESSION_COOKIE_HTTPONLY = True
    SESSION_COOKIE_SAMESITE = "Lax"

    # Onde os relatórios gerados (RF11) são gravados
    RELATORIOS_DIR = os.environ.get(
        "RELATORIOS_DIR",
        os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "relatorios"),
    )
