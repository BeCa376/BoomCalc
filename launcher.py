"""
Lançador do BoomCalc para uso local (versão executável).

Faz tudo sozinho: escolhe uma pasta de dados do usuário, cria o banco SQLite na primeira vez, sobe o
servidor SÓ neste computador (127.0.0.1: não fica visível na rede nem na internet) e abre o navegador.
Para encerrar, feche a janela do programa.

Opções (para testes): --no-browser  --port N  --datadir PASTA
"""
import argparse
import json
import logging
import os
import secrets
import socket
import sys
import threading
import urllib.request
import warnings
import webbrowser

PORTA_INICIAL = 5000
PORTAS_TESTADAS = 100


def pasta_dos_arquivos():
    """Onde estão index.html, seed.sql e as pastas project/…: dentro do pacote (PyInstaller) ou ao lado deste arquivo."""
    return getattr(sys, "_MEIPASS", None) or os.path.dirname(os.path.abspath(__file__))


def pasta_de_dados():
    """Pasta do usuário onde ficam o banco e os relatórios (não é apagada ao atualizar o programa)."""
    if sys.platform == "win32":
        base = os.environ.get("LOCALAPPDATA") or os.path.join(os.path.expanduser("~"), "AppData", "Local")
    elif sys.platform == "darwin":
        base = os.path.join(os.path.expanduser("~"), "Library", "Application Support")
    else:
        base = os.environ.get("XDG_DATA_HOME") or os.path.join(os.path.expanduser("~"), ".local", "share")
    return os.path.join(base, "BoomCalc")


def escrever(texto=""):
    try:
        print(texto, flush=True)
    except Exception:          # console sem suporte a acentos: nunca derruba o programa por causa disso
        print(texto.encode("ascii", "replace").decode("ascii"), flush=True)


def boomcalc_nesta_porta(porta):
    """True se já há um BoomCalc respondendo nessa porta (para não abrir uma segunda cópia)."""
    try:
        with urllib.request.urlopen(f"http://127.0.0.1:{porta}/api/guindastes", timeout=0.7) as r:
            dados = json.loads(r.read().decode("utf-8"))
        return isinstance(dados, list) and any(g.get("modelo") for g in dados)
    except Exception:
        return False


def porta_livre(porta):
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        try:
            s.bind(("127.0.0.1", porta))
            return True
        except OSError:
            return False


def escolher_porta(inicial):
    """Devolve (porta, ja_rodando). Se já existe um BoomCalc aberto, só reaproveita a janela dele."""
    for porta in range(inicial, inicial + PORTAS_TESTADAS):
        if porta_livre(porta):
            return porta, False
        if boomcalc_nesta_porta(porta):
            return porta, True
    raise RuntimeError(f"Nenhuma porta livre entre {inicial} e {inicial + PORTAS_TESTADAS - 1}.")


def segredo_local(pasta):
    """Chave de assinatura das sessões: sorteada uma vez e guardada na pasta de dados."""
    caminho = os.path.join(pasta, "segredo.txt")
    if os.path.isfile(caminho):
        with open(caminho, encoding="utf-8") as f:
            valor = f.read().strip()
        if valor:
            return valor
    valor = secrets.token_hex(32)
    with open(caminho, "w", encoding="utf-8") as f:
        f.write(valor)
    return valor


def main():
    ap = argparse.ArgumentParser(description="BoomCalc local")
    ap.add_argument("--no-browser", action="store_true", help="não abre o navegador")
    ap.add_argument("--port", type=int, default=PORTA_INICIAL)
    ap.add_argument("--datadir", default=None, help="pasta de dados (padrão: pasta do usuário)")
    args = ap.parse_args()

    dados = os.path.abspath(args.datadir or pasta_de_dados())
    os.makedirs(os.path.join(dados, "relatorios"), exist_ok=True)

    # tudo isto precisa estar definido ANTES de importar o app (a configuração é lida na importação)
    os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(dados, "boomcalc.db").replace("\\", "/")
    os.environ["RELATORIOS_DIR"] = os.path.join(dados, "relatorios")
    os.environ.setdefault("SECRET_KEY", segredo_local(dados))
    os.environ.setdefault("AUTENTICACAO_ATIVA", "0")        # sem tela de login (uso local, um só usuário)

    logging.basicConfig(filename=os.path.join(dados, "boomcalc.log"), level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(message)s", encoding="utf-8")
    logging.getLogger("werkzeug").setLevel(logging.WARNING)
    warnings.filterwarnings("ignore", message=".*Decimal objects natively.*")   # SQLite guarda Numeric como número comum

    porta, ja_rodando = escolher_porta(args.port)
    url = f"http://127.0.0.1:{porta}/"
    if ja_rodando:
        escrever(f"O BoomCalc já está aberto em {url}. Abrindo o navegador...")
        if not args.no_browser:
            webbrowser.open(url)
        return 0

    sys.path.insert(0, pasta_dos_arquivos())
    import app as boomcalc                                   # noqa: E402  (depois de configurar o ambiente)
    from project.functions.banco_local import preparar_banco_local
    from werkzeug.serving import make_server

    primeira_vez = preparar_banco_local(boomcalc.app, os.path.join(pasta_dos_arquivos(), "seed.sql"))
    servidor = make_server("127.0.0.1", porta, boomcalc.app, threaded=True)

    escrever("=" * 62)
    escrever("  BoomCalc - simulador de içamento")
    escrever("=" * 62)
    escrever(f"  Endereço : {url}")
    escrever(f"  Seus dados ficam em: {dados}")
    if primeira_vez:
        escrever("  (primeira execução: banco de dados criado)")
    escrever("")
    escrever("  Para ENCERRAR, feche esta janela (ou pressione Ctrl+C).")
    escrever("=" * 62)

    if not args.no_browser:
        threading.Timer(0.8, webbrowser.open, [url]).start()
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())