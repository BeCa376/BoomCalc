"""
Ponto de entrada da aplicação.

Roda o servidor Flask e serve:
  - "/"            -> index.html (raiz do projeto)
  - "/admin"        -> project/html/admin.html (cadastros do administrador)
  - "/project/css/*" e "/project/js/*" -> assets do front
  - "/api/*"        -> rotas definidas em project/controller
"""
import os
from flask import send_from_directory
from project import create_app

app = create_app()
RAIZ = os.path.dirname(os.path.abspath(__file__))


@app.get("/")
def index():
    return send_from_directory(RAIZ, "index.html")


@app.get("/project/css/<path:filename>")
def css(filename):
    return send_from_directory(os.path.join(RAIZ, "project", "css"), filename)


@app.get("/project/js/<path:filename>")
def js(filename):
    return send_from_directory(os.path.join(RAIZ, "project", "js"), filename)


@app.get("/admin")
def admin():
    """Tela de cadastros (o acesso às rotas é checado na API: só administrador)."""
    return send_from_directory(os.path.join(RAIZ, "project", "html"), "admin.html")


if __name__ == "__main__":
    app.run(debug=True, port=5000)
