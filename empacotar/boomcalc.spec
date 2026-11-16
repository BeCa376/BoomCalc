# -*- mode: python ; coding: utf-8 -*-
# Receita do PyInstaller: gera a pasta dist/BoomCalc com o executável e tudo o que ele precisa.
# Uso (na raiz do projeto):  python -m PyInstaller empacotar/boomcalc.spec --noconfirm --clean
import os
import sys

from PyInstaller.utils.hooks import collect_data_files

RAIZ = os.path.abspath(os.path.join(SPECPATH, ".."))


def p(*partes):
    return os.path.join(RAIZ, *partes)


datas = [
    (p("index.html"), "."),
    (p("seed.sql"), "."),
    (p("project", "css"), os.path.join("project", "css")),
    (p("project", "js"), os.path.join("project", "js")),
    (p("project", "html"), os.path.join("project", "html")),
    (p("project", "data"), os.path.join("project", "data")),
]
datas += collect_data_files("fpdf")        # dados internos da biblioteca de PDF, se ela tiver

a = Analysis(
    [p("launcher.py")],
    pathex=[RAIZ],
    datas=datas,
    hiddenimports=["sqlalchemy.dialects.sqlite"],
    excludes=["tkinter", "pytest", "IPython", "matplotlib", "numpy", "pandas"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz, a.scripts, [],
    exclude_binaries=True,
    name="BoomCalc",
    console=True,                      # janela simples: mostra o endereço e, ao fechar, o programa encerra
    icon=os.path.join(SPECPATH, "boomcalc.ico") if sys.platform == "win32" else None,
)
coll = COLLECT(exe, a.binaries, a.datas, name="BoomCalc")
