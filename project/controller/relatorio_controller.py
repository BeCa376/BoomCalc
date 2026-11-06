"""
RF11 — relatório de uma simulação salva, em PDF ou CSV.

GET /api/simulacoes/<id>/relatorio?formato=pdf|csv
Gera o arquivo, registra na tabela `relatorio` e devolve para download.
"""
import csv
import io
import os
from datetime import datetime

from flask import Blueprint, jsonify, request, send_file, current_app
from fpdf import FPDF

from project.model import db
from project.model.entities import Simulacao, Relatorio
from project.controller.auth_controller import login_obrigatorio, usuario_atual
from project.functions.utils import formatar_kg

bp = Blueprint("relatorio", __name__, url_prefix="/api/simulacoes")

STATUS = {"seguro": "SEGURO", "proximo_limite": "PRÓXIMO DO LIMITE", "inseguro": "INSEGURO"}
TERRENO = {"firme": "Firme", "mole": "Mole", "nao_informado": "Não informado"}
QUADRANTE = {"frontal": "Frontal", "lateral_traseira": "Lateral/traseira"}


def _num(v, casas=2, sufixo=""):
    if v is None:
        return "-"
    texto = f"{float(v):,.{casas}f}".replace(",", "_").replace(".", ",").replace("_", ".")
    return texto + sufixo


def _linhas(s):
    """Pares (rótulo, valor) do relatório — mesma ordem no PDF e no CSV."""
    g, c, r = s.guindaste, s.carga, s.resultado
    linhas = [
        ("Simulação", f"#{s.id}"),
        ("Data", s.data_simulacao.strftime("%d/%m/%Y %H:%M") if s.data_simulacao else "-"),
        ("Operador", f"{s.usuario.nome} ({s.usuario.login})"),
        ("Guindaste", f"{g.modelo} - {g.fabricante}"),
        ("Capacidade nominal", formatar_kg(float(g.capacidade_maxima_kg))),
        ("Comprimento da lança", _num(s.comprimento_lanca_m, 2, " m")),
        ("Ângulo da lança", _num(s.angulo_graus, 1, "°")),
        ("Raio de operação", _num(s.raio_operacao_m, 2, " m")),
        ("Quadrante", QUADRANTE.get(s.quadrante, s.quadrante)),
        ("Usa JIB", "Sim" if s.usa_jib else "Não"),
        ("Peso da carga", formatar_kg(float(c.peso_kg))),
        ("Dimensões da carga (C x L x A)",
         " x ".join(_num(v, 2, " m") for v in (c.comprimento_m, c.largura_m, c.altura_m))
         if c.comprimento_m else "-"),
        ("Massa da lingada", formatar_kg(float(s.massa_lingada_kg or 0))),
        ("Massa do cabo de aço", formatar_kg(float(s.massa_cabo_kg or 0))),
        ("Balancim", formatar_kg(float(s.massa_balancim_kg or 0)) if s.usa_balancim else "Não usa"),
        ("Acessórios", ", ".join(a.nome for a in s.acessorios) or "Nenhum"),
        ("Vento", _num(s.velocidade_vento_ms, 1, " m/s") if s.velocidade_vento_ms is not None else "Não informado"),
        ("Condição do terreno", TERRENO.get(s.condicao_terreno, s.condicao_terreno)),
    ]
    if r:
        linhas += [
            ("Carga total", formatar_kg(float(r.carga_total_kg))),
            ("Capacidade disponível", formatar_kg(float(r.capacidade_disponivel_kg))),
            ("Uso da capacidade", _num(r.percentual_utilizado, 1, "%")),
            ("Resultado", STATUS.get(r.status, r.status)),
            ("Mensagem", r.mensagem or "-"),
        ]
    return linhas


def _latin1(texto):
    """As fontes padrão do PDF só têm Latin-1: troca o que ficaria fora."""
    trocas = {"—": "-", "–": "-", "≤": "<=", "≥": ">=", "·": "-", "“": '"', "”": '"', "’": "'"}
    for a, b in trocas.items():
        texto = texto.replace(a, b)
    return texto.encode("latin-1", "replace").decode("latin-1")


def _pdf(s):
    pdf = FPDF(format="A4")
    pdf.set_auto_page_break(True, 15)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 10, _latin1("BoomCalc - Relatório de içamento"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 6, _latin1(f"Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')}"), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    r = s.resultado
    if r:
        cor = {"seguro": (63, 184, 127), "proximo_limite": (242, 169, 0), "inseguro": (226, 72, 61)}[r.status]
        pdf.set_fill_color(*cor)
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 13)
        pdf.cell(0, 11, _latin1(f"  {STATUS[r.status]}  -  {_num(r.percentual_utilizado, 1, '%')} da capacidade"),
                 fill=True, new_x="LMARGIN", new_y="NEXT")
        pdf.ln(4)

    pdf.set_text_color(30, 30, 30)
    for rotulo, valor in _linhas(s):
        pdf.set_font("Helvetica", "B", 10)
        pdf.cell(62, 7, _latin1(rotulo))
        pdf.set_font("Helvetica", "", 10)
        pdf.multi_cell(0, 7, _latin1(str(valor)), new_x="LMARGIN", new_y="NEXT")

    pdf.ln(6)
    pdf.set_font("Helvetica", "I", 8)
    pdf.set_text_color(110, 110, 110)
    pdf.multi_cell(0, 4.5, _latin1(
        "Simulação de apoio ao planejamento. Não substitui o plano de rigging nem a "
        "tabela de carga oficial do fabricante, que deve ser conferida antes da operação."))
    return bytes(pdf.output())


def _csv(s):
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Campo", "Valor"])
    for rotulo, valor in _linhas(s):
        w.writerow([rotulo, valor])
    return ("﻿" + buf.getvalue()).encode("utf-8")  # BOM: o Excel abre os acentos certos


@bp.get("/<int:sim_id>/relatorio")
@login_obrigatorio
def relatorio(sim_id):
    s = db.get_or_404(Simulacao, sim_id)
    eu = usuario_atual()
    if s.usuario_id != eu.id and not eu.is_admin:
        return jsonify({"erro": "Essa simulação é de outro usuário."}), 403
    formato = (request.args.get("formato") or "pdf").lower()
    if formato not in ("pdf", "csv"):
        return jsonify({"erro": "Formato deve ser pdf ou csv."}), 400

    conteudo = _pdf(s) if formato == "pdf" else _csv(s)
    pasta = current_app.config["RELATORIOS_DIR"]
    os.makedirs(pasta, exist_ok=True)
    nome = f"simulacao_{s.id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{formato}"
    caminho = os.path.join(pasta, nome)
    with open(caminho, "wb") as f:
        f.write(conteudo)
    db.session.add(Relatorio(simulacao_id=s.id, formato=formato, caminho_arquivo=caminho))
    db.session.commit()

    return send_file(io.BytesIO(conteudo), as_attachment=True, download_name=nome,
                     mimetype="application/pdf" if formato == "pdf" else "text/csv; charset=utf-8")
