"""
Confere o projeto ANTES de gerar o executável que vai para outra pessoa.
O executável leva junto o código-fonte: nada de senha de banco escrita nos arquivos.
Sai com erro (código 1) se achar um problema, para o empacotamento parar.
"""
import os
import re
import sys

RAIZ = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
problemas = []

# 1) senha do banco escrita no código (config/env.py deve ter "" como padrão; a senha real vai em config/.env)
env_py = os.path.join(RAIZ, "config", "env.py")
if os.path.isfile(env_py):
    texto = open(env_py, encoding="utf-8").read()
    achou = re.search(r'DB_PASSWORD\s*=\s*os\.getenv\(\s*"DB_PASSWORD"\s*\)\s*or\s*"([^"]*)"', texto)
    if achou and achou.group(1):
        problemas.append(
            'config/env.py tem uma senha escrita no código (linha DB_PASSWORD ... or "...").\n'
            '   Ela iria dentro do executável. Troque o padrão por "" e coloque a senha só em config/.env.')

# 2) arquivos que o executável precisa
for rel in ("launcher.py", "app.py", "index.html", "seed.sql",
            os.path.join("project", "data", "catalogo_lingada.json"),
            os.path.join("project", "functions", "banco_local.py"),
            os.path.join("empacotar", "boomcalc.spec"),
            os.path.join("empacotar", "boomcalc.ico"),
            os.path.join("empacotar", "boomcalc.iss"),
            os.path.join("empacotar", "gerar_windows.bat"),
            os.path.join("empacotar", "LEIA-ME-professor.txt")):
    if not os.path.exists(os.path.join(RAIZ, rel)):
        problemas.append(f"Falta o arquivo {rel}.")

# o teste automático do GitHub não é obrigatório (só vale se você gerar o instalador pelo GitHub)
if not os.path.exists(os.path.join(RAIZ, ".github", "workflows", "windows.yml")):
    print("Aviso: falta .github/workflows/windows.yml (só é preciso se for gerar o instalador pelo GitHub).")

# 3) um config/.env real não deve ir no pacote (o spec não o inclui; aqui só avisamos)
if os.path.isfile(os.path.join(RAIZ, "config", ".env")):
    print("Aviso: existe config/.env na sua máquina. Ele NÃO entra no executável (conferido na receita).")

if problemas:
    print("\nNÃO DÁ PARA EMPACOTAR ainda:\n")
    for i, texto in enumerate(problemas, 1):
        print(f" {i}. {texto}\n")
    sys.exit(1)
print("Verificação ok: nenhuma senha no código e todos os arquivos presentes.")
