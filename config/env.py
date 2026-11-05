from pathlib import Path
from dotenv import load_dotenv
import os

# Lê config/.env a partir da pasta deste arquivo, e não da pasta de onde o
# servidor foi iniciado (antes só funcionava rodando de dentro do projeto).
load_dotenv(Path(__file__).resolve().parent / ".env", override=True)

# ===== DATABASE =====
DB_HOST     = os.getenv("DB_HOST") or "localhost"
DB_PORT     = os.getenv("DB_PORT") or "3306"
DB_NAME     = os.getenv("DB_NAME") or "boomcalc"
DB_USER     = os.getenv("DB_USER") or "root"
DB_PASSWORD = os.getenv("DB_PASSWORD") or ""

# ===== CRYPTO =====
CRYPTO_KEY  = os.getenv("CRYPTO_KEY")
