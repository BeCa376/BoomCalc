"""
Relatório da cena 3D: todos os objetos com tamanho, forma, peso, posição,
pontos de pega e se o guindaste consegue içar cada um — mais a imagem do
radar e da vista 3D que o operador está vendo.

POST /api/cena/relatorio   (login obrigatório)
Corpo: dados comuns da simulação (guindaste_id, acessorio_ids, massas da
lingada, vento, terreno...), `objetos` (lista), `configuracao` (lança,
ângulo, giro, raio, alturas e alcance da tela) e, opcionalmente,
`imagem_radar` / `imagem_3d` / `imagem_2d` (data URL PNG/JPEG) e `formato` (pdf | csv).

A capacidade de cada objeto é recalculada aqui no servidor, com a tabela do
banco (mesma regra do /api/simular); a tela só sugere a configuração da lança.
"""
import base64
import binascii
import csv
import io
import math
import os
import re
from datetime import datetime

from flask import Blueprint, jsonify, request, send_file, current_app
from fpdf import FPDF

from project.model import db
from project.model.entities import Guindaste, Acessorio, ObjetoCena
from project.controller.auth_controller import login_obrigatorio, usuario_atual
from project.controller.simulacao_controller import avaliar, ErroSimulacao
from project.controller.relatorio_controller import _latin1, _num, STATUS, TERRENO, QUADRANTE
from project.functions.utils import formatar_kg

bp = Blueprint("cena", __name__, url_prefix="/api/cena")

MAX_OBJETOS = 50
MAX_IMAGEM = 6 * 1024 * 1024
SLING_MIN_ANGLE = 45  # mesmo valor da tela
FORMA = {"caixa": "Caixa", "cilindro": "Cilindro (em pé)", "tubo": "Tubo (deitado)"}
CORES_STATUS = {"seguro": (63, 184, 127), "proximo_limite": (242, 169, 0),
                "inseguro": (226, 72, 61), "fora": (120, 130, 142)}
ROTULO_STATUS = {**STATUS, "fora": "FORA DO ALCANCE"}


class ErroCena(ValueError):
    pass


# ------------------------------------------------------------------ cálculos
def _f(v, padrao=0.0):
    try:
        return float(v)
    except (TypeError, ValueError):
        return padrao


def _linga(o):
    """Ângulo da linga e tração por perna: T = P / (n · sen θ)."""
    n, d, ls, peso = o["pernas"], o["dist"], o["linga"], o["peso"]
    horiz = 0 if n == 1 else d / 2 if n == 2 else math.hypot(d / 2, o["L"] / 2)
    out = {"angulo": None, "tracao": None, "avisos": []}
    if n > 1 and d > o["C"]:
        out["avisos"].append(f"Distância entre pegas ({_num(d)} m) maior que o comprimento ({_num(o['C'])} m).")
    if ls <= horiz:
        out["avisos"].append(f"Linga curta: precisa de mais de {_num(horiz)} m para alcançar as pegas.")
        return out
    ang = 90.0 if n == 1 else math.degrees(math.asin(math.sqrt(ls * ls - horiz * horiz) / ls))
    out["angulo"] = ang
    out["tracao"] = peso / (n * math.sin(math.radians(ang)))
    if n > 1 and ang < SLING_MIN_ANGLE:
        out["avisos"].append(f"Ângulo da linga {_num(ang, 0)}° abaixo de {SLING_MIN_ANGLE}°.")
    return out


def _objeto(d):
    """Valida e normaliza um objeto vindo da tela."""
    nome = str(d.get("nome") or "").strip()[:80] or "Objeto"
    forma = d.get("forma") if d.get("forma") in ObjetoCena.FORMAS else "caixa"
    cor = d.get("cor") if re.match(r"^#[0-9a-fA-F]{6}$", str(d.get("cor") or "")) else "#5b9bd1"
    pernas = int(_f(d.get("pernas"), 2))
    if pernas not in ObjetoCena.PERNAS:
        pernas = 2
    o = {"nome": nome, "forma": forma, "cor": cor, "pernas": pernas,
         "peso": _f(d.get("peso")), "C": _f(d.get("C")), "L": _f(d.get("L")), "A": _f(d.get("A")),
         "dist": _f(d.get("dist")), "linga": _f(d.get("linga"), 3),
         "raio": _f(d.get("raio_m")), "direcao": _f(d.get("direcao_graus")),
         "lanca": d.get("comprimento_lanca_m"), "angulo": d.get("angulo_graus")}
    if o["peso"] <= 0 or min(o["C"], o["L"], o["A"]) <= 0:
        raise ErroCena(f"{nome}: peso e dimensões devem ser maiores que zero.")
    if forma == "cilindro":
        o["L"] = o["C"]
    elif forma == "tubo":
        o["A"] = o["L"]
    return o


def _volume(o):
    if o["forma"] == "cilindro":
        return math.pi * (o["C"] / 2) ** 2 * o["A"]
    if o["forma"] == "tubo":
        return math.pi * (o["L"] / 2) ** 2 * o["C"]
    return o["C"] * o["L"] * o["A"]


def _avaliar_objetos(dados, objetos):
    comuns = {k: dados.get(k) for k in (
        "guindaste_id", "acessorio_ids", "massa_lingada_kg", "massa_cabo_kg", "usa_balancim",
        "massa_balancim_kg", "velocidade_vento_ms", "condicao_terreno")}
    for o in objetos:
        o["linga_calc"] = _linga(o)
        if o["lanca"] in (None, "") or o["angulo"] in (None, ""):
            o["status"] = "fora"
            o["mensagem"] = f"Fora do alcance do guindaste (raio {_num(o['raio'])} m)."
            o["av"] = None
            continue
        try:
            _, av, _, _ = avaliar({**comuns, "peso_carga_kg": o["peso"], "comprimento_lanca_m": _f(o["lanca"]),
                                   "angulo_graus": _f(o["angulo"]), "raio_operacao_m": o["raio"],
                                   "angulo_giro_graus": o["direcao"]})
        except ErroSimulacao as e:
            o["status"], o["mensagem"], o["av"] = "inseguro", str(e), None
            continue
        o["av"] = av
        o["status"] = av["status"]
        o["mensagem"] = av["mensagem"]
    return objetos


# ------------------------------------------------------------------ imagens
def _imagem(data_url):
    if not data_url:
        return None
    m = re.match(r"^data:image/(png|jpeg);base64,(.+)$", str(data_url), re.S)
    if not m:
        raise ErroCena("Imagem inválida (use PNG ou JPEG em data URL).")
    if len(m.group(2)) > MAX_IMAGEM * 4 / 3:
        raise ErroCena("Imagem grande demais.")
    try:
        return io.BytesIO(base64.b64decode(m.group(2), validate=True))
    except (binascii.Error, ValueError):
        raise ErroCena("Imagem inválida.")


# ------------------------------------------------------------------ PDF
def _rgb(hexcor):
    return tuple(int(hexcor[i:i + 2], 16) for i in (1, 3, 5))


def _cabecalho_info(dados, g, acessorios):
    vento = dados.get("velocidade_vento_ms")
    rig = [f"lingada {formatar_kg(_f(dados.get('massa_lingada_kg')))}",
           f"cabo {formatar_kg(_f(dados.get('massa_cabo_kg')))}"]
    if dados.get("usa_balancim"):
        rig.append(f"balancim {formatar_kg(_f(dados.get('massa_balancim_kg')))}")
    return [
        ("Guindaste", f"{g.modelo} - {g.fabricante}  (capacidade nominal {formatar_kg(float(g.capacidade_maxima_kg))})"),
        ("Massas do içamento", ", ".join(rig)),
        ("Acessórios", ", ".join(a.nome for a in acessorios) or "Nenhum"),
        ("Vento", f"{_num(vento, 1)} m/s" if vento not in (None, "") else "Não informado"),
        ("Terreno", TERRENO.get(dados.get("condicao_terreno") or "nao_informado", "-")),
    ]


def _m(v, casas=2):
    return f"{_num(v, casas)} m" if v not in (None, "") else None


def _pagina_guindaste(pdf, g, cfg, img_2d):
    """Dimensões do equipamento, limites da lança/JIB, alcance e a configuração usada."""
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, _latin1(f"Guindaste {g.modelo} - dimensões e configuração"), new_x="LMARGIN", new_y="NEXT")
    falta = "não cadastrado"
    jib = "Não possui"
    if g.possui_jib:
        jib = f"até {_m(g.comprimento_jib_m)}" if g.comprimento_jib_m else "Sim"
        jib += " (lances 9/15/20 m; pinos 10°/25°/40°)"
    grupos = [
        ("Equipamento", [
            ("Modelo / fabricante", f"{g.modelo} - {g.fabricante}"),
            ("Capacidade nominal", formatar_kg(float(g.capacidade_maxima_kg))),
            ("Peso total", formatar_kg(float(g.peso_total_kg)) if g.peso_total_kg else falta),
            ("Comprimento (transporte)", _m(g.comprimento_m) or falta),
            ("Largura (transporte)", _m(g.largura_m) or falta),
            ("Altura (transporte)", _m(g.altura_m) or falta),
            ("Abertura das patolas", _m(g.abertura_patolas_m) or falta),
        ]),
        ("Lança e alcance", [
            ("Comprimento da lança", f"{_num(g.comprimento_lanca_min_m)} a {_num(g.comprimento_lanca_max_m)} m"),
            ("Ângulo de elevação", f"{_num(g.angulo_min_graus, 0)}° a {_num(g.angulo_max_graus, 0)}°"),
            ("JIB", jib),
            ("Alcance máximo (raio)", _m(cfg.get("alcance_max_m"), 1) or "-"),
            ("Altura máxima da ponta", _m(cfg.get("altura_max_m"), 1) or "-"),
        ]),
    ]
    if cfg:
        conf = [
            ("Comprimento da lança", _m(cfg.get("comprimento_lanca_m")) or "-"),
            ("Ângulo da lança", f"{_num(cfg.get('angulo_graus'), 1)}°"),
            ("Giro", f"{_num(cfg.get('giro_graus'), 0)}°  ({QUADRANTE.get(cfg.get('quadrante'), '-')})"),
            ("Raio de operação", _m(cfg.get("raio_m")) or "-"),
            ("Altura da ponta", _m(cfg.get("altura_ponta_m")) or "-"),
        ]
        if cfg.get("usa_jib"):
            conf.append(("JIB em uso", f"lance {_m(cfg.get('jib_lance_m'), 0)}, pino {_num(cfg.get('jib_pino_graus'), 0)}°"))
        grupos.append(("Configuração no momento do relatório", conf))

    largura_tab = 112
    topo = pdf.get_y() + 1
    for titulo, linhas in grupos:
        pdf.set_font("Helvetica", "B", 9)
        pdf.set_text_color(91, 155, 209)
        pdf.cell(largura_tab, 6, _latin1(titulo.upper()), new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(30, 30, 30)
        for rot, val in linhas:
            pdf.set_font("Helvetica", "", 8.5)
            pdf.cell(50, 5.2, _latin1(rot), border="B")
            pdf.set_font("Helvetica", "B" if val != falta else "I", 8.5)
            if val == falta:
                pdf.set_text_color(150, 150, 150)
            pdf.cell(largura_tab - 50, 5.2, _latin1(val), border="B", new_x="LMARGIN", new_y="NEXT")
            pdf.set_text_color(30, 30, 30)
        pdf.ln(2)
    if any(getattr(g, c) is None for c in g.DIMENSOES):
        pdf.set_font("Helvetica", "I", 7.5)
        pdf.set_text_color(110, 110, 110)
        pdf.multi_cell(largura_tab, 3.8, _latin1(
            "Dimensões do equipamento não cadastradas: o administrador preenche em /admin > Guindastes, "
            "com os valores da ficha técnica do fabricante."), new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(30, 30, 30)

    if img_2d:
        x = pdf.l_margin + largura_tab + 8
        w = pdf.w - 12 - x
        h = w * 380 / 640
        pdf.image(img_2d, x=x, y=topo, w=w, h=h)
        pdf.set_xy(x, topo + h + 1)
        pdf.set_font("Helvetica", "I", 7.5)
        pdf.set_text_color(90, 90, 90)
        pdf.multi_cell(w, 3.6, _latin1(
            "Vista lateral na configuração do relatório, em escala: lança, JIB, raio de operação "
            "e altura da ponta, com a carga pendurada (se houver)."))
        pdf.set_text_color(30, 30, 30)


def _pdf(dados, g, acessorios, objetos, img_radar, img_3d, usuario, img_2d=None):
    pdf = FPDF(orientation="L", format="A4")
    pdf.set_auto_page_break(True, 12)
    pdf.set_margins(12, 12, 12)
    pdf.add_page()
    largura = pdf.w - 24

    pdf.set_font("Helvetica", "B", 16)
    pdf.cell(0, 9, _latin1("BoomCalc - Relatório da cena"), new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", "", 9)
    pdf.set_text_color(100, 100, 100)
    pdf.cell(0, 5, _latin1(f"Gerado em {datetime.now().strftime('%d/%m/%Y %H:%M')} por "
                           f"{usuario.nome} ({usuario.login})  -  {len(objetos)} objeto(s) na cena"),
             new_x="LMARGIN", new_y="NEXT")
    pdf.ln(2)

    # resumo por status
    cont = {}
    for o in objetos:
        cont[o["status"]] = cont.get(o["status"], 0) + 1
    x = pdf.l_margin
    for st in ("seguro", "proximo_limite", "inseguro", "fora"):
        if not cont.get(st):
            continue
        pdf.set_fill_color(*CORES_STATUS[st])
        pdf.set_text_color(255, 255, 255)
        pdf.set_font("Helvetica", "B", 9)
        txt = _latin1(f" {cont[st]} {ROTULO_STATUS[st].lower()} ")
        w = pdf.get_string_width(txt) + 4
        pdf.set_xy(x, pdf.get_y())
        pdf.cell(w, 6, txt, fill=True)
        x += w + 2
    pdf.ln(8)

    pdf.set_text_color(30, 30, 30)
    for rot, val in _cabecalho_info(dados, g, acessorios):
        pdf.set_font("Helvetica", "B", 9)
        pdf.cell(38, 5, _latin1(rot))
        pdf.set_font("Helvetica", "", 9)
        pdf.cell(0, 5, _latin1(val), new_x="LMARGIN", new_y="NEXT")
    pdf.ln(3)

    # imagens: radar (quadrado) e vista 3D
    topo = pdf.get_y()
    alt = pdf.h - 14 - topo - 6
    if img_radar or img_3d:
        lado = min(alt, 105)
        xr = pdf.l_margin
        if img_radar:
            pdf.image(img_radar, x=xr, y=topo, w=lado, h=lado)
            pdf.set_xy(xr, topo + lado + 1)
            pdf.set_font("Helvetica", "I", 7.5)
            pdf.set_text_color(90, 90, 90)
            pdf.multi_cell(lado, 3.6, _latin1(
                "Radar (vista de cima): verde = até 80% da capacidade, amarelo = até 100%, "
                "vermelho = acima; cinza = fora do alcance. Linha = lança; ponto amarelo = gancho."))
            xr += lado + 6
        if img_3d:
            w3 = pdf.w - 12 - xr
            pdf.image(img_3d, x=xr, y=topo, w=w3, h=min(lado, w3 * 0.62), keep_aspect_ratio=True)
            pdf.set_xy(xr, topo + lado + 1)
            pdf.set_font("Helvetica", "I", 7.5)
            pdf.cell(w3, 3.6, _latin1("Vista 3D no momento do relatório."))
        pdf.set_text_color(30, 30, 30)

    _pagina_guindaste(pdf, g, dados.get("configuracao") or {}, img_2d)

    # tabela dos objetos
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, _latin1("Objetos da cena"), new_x="LMARGIN", new_y="NEXT")
    cols = [("", 6), ("Objeto", 40), ("Forma", 26), ("C x L x A (m)", 32), ("Volume", 18), ("Peso", 24),
            ("Raio / direção", 26), ("Lança / ângulo", 26), ("Capacidade", 24), ("Uso", 12)]
    cols.append(("Status", largura - sum(w for _, w in cols)))
    pdf.set_font("Helvetica", "B", 8)
    pdf.set_fill_color(235, 238, 242)
    for t, w in cols:
        pdf.cell(w, 6, _latin1(t), border="B", fill=True)
    pdf.ln()
    pdf.set_font("Helvetica", "", 8)
    for o in objetos:
        av = o["av"]
        y = pdf.get_y()
        pdf.set_fill_color(*_rgb(o["cor"]))
        pdf.rect(pdf.l_margin + 1, y + 1.2, 3.6, 3.6, style="F")
        pdf.set_x(pdf.l_margin + 6)
        valores = [
            o["nome"], FORMA[o["forma"]],
            f"{_num(o['C'])} x {_num(o['L'])} x {_num(o['A'])}", f"{_num(_volume(o))} m³",
            formatar_kg(o["peso"]), f"{_num(o['raio'])} m / {_num(o['direcao'], 0)}°",
            f"{_num(o['lanca'])} m / {_num(o['angulo'], 0)}°" if o["lanca"] not in (None, "") else "-",
            formatar_kg(av["capacidade_disponivel_kg"]) if av else "-",
            _num(av["percentual_utilizado"], 0, "%") if av else "-",
        ]
        for (t, w), v in zip(cols[1:-1], valores):
            pdf.cell(w, 6, _latin1(str(v))[:40], border="B")
        pdf.set_text_color(*CORES_STATUS[o["status"]])
        pdf.set_font("Helvetica", "B", 8)
        pdf.cell(cols[-1][1], 6, _latin1(ROTULO_STATUS[o["status"]]), border="B", new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(30, 30, 30)
        pdf.set_font("Helvetica", "", 8)

    # detalhes por objeto: pontos de pega e mensagem
    pdf.ln(5)
    pdf.set_font("Helvetica", "B", 12)
    pdf.cell(0, 8, _latin1("Pontos de pega e observações"), new_x="LMARGIN", new_y="NEXT")
    for o in objetos:
        lc = o["linga_calc"]
        if pdf.get_y() > pdf.h - 40:
            pdf.add_page()
        y = pdf.get_y()
        pdf.set_fill_color(*CORES_STATUS[o["status"]])
        pdf.rect(pdf.l_margin, y, 1.6, 17, style="F")
        pdf.set_xy(pdf.l_margin + 4, y)
        pdf.set_font("Helvetica", "B", 9.5)
        pdf.cell(0, 5, _latin1(f"{o['nome']}  -  {ROTULO_STATUS[o['status']]}"), new_x="LMARGIN", new_y="NEXT")
        pdf.set_x(pdf.l_margin + 4)
        pdf.set_font("Helvetica", "", 8.5)
        pegas = "1 ponto (pega central)" if o["pernas"] == 1 else \
            f"{o['pernas']} pontos, {_num(o['dist'])} m entre pegas"
        linha = (f"Pega: {pegas}; linga de {_num(o['linga'])} m por perna; "
                 f"ângulo da linga {_num(lc['angulo'], 0)}°; " if lc["angulo"] is not None else
                 f"Pega: {pegas}; linga de {_num(o['linga'])} m por perna; ")
        linha += f"tração por perna {formatar_kg(lc['tracao'])}." if lc["tracao"] is not None else "tração: -."
        pdf.multi_cell(0, 4.2, _latin1(linha), new_x="LMARGIN", new_y="NEXT")
        msgs = [o["mensagem"]] + lc["avisos"]
        pdf.set_x(pdf.l_margin + 4)
        pdf.set_text_color(80, 80, 80)
        pdf.multi_cell(0, 4.2, _latin1(" ".join(m for m in msgs if m)), new_x="LMARGIN", new_y="NEXT")
        pdf.set_text_color(30, 30, 30)
        pdf.ln(2.5)

    pdf.ln(3)
    pdf.set_font("Helvetica", "I", 7.5)
    pdf.set_text_color(110, 110, 110)
    pdf.multi_cell(0, 4, _latin1(
        "Capacidades calculadas pelo servidor com a tabela de carga cadastrada no banco, na configuração "
        "de lança sugerida pela tela para cada objeto. Simulação de apoio ao planejamento: não substitui "
        "o plano de rigging nem a tabela oficial do fabricante, que deve ser conferida antes da operação."))
    return bytes(pdf.output())


def _csv(objetos):
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Objeto", "Forma", "Cor", "Comprimento (m)", "Largura (m)", "Altura (m)", "Volume (m3)",
                "Peso (kg)", "Raio (m)", "Direção (°)", "Lança (m)", "Ângulo (°)", "Pernas",
                "Distância entre pegas (m)", "Linga (m)", "Ângulo da linga (°)", "Tração por perna (kg)",
                "Capacidade (kg)", "Uso (%)", "Status", "Mensagem"])
    for o in objetos:
        av, lc = o["av"], o["linga_calc"]
        w.writerow([o["nome"], FORMA[o["forma"]], o["cor"], _num(o["C"]), _num(o["L"]), _num(o["A"]),
                    _num(_volume(o)), _num(o["peso"]), _num(o["raio"]), _num(o["direcao"], 0),
                    _num(o["lanca"]) if o["lanca"] not in (None, "") else "-",
                    _num(o["angulo"], 1) if o["angulo"] not in (None, "") else "-",
                    o["pernas"], _num(o["dist"]), _num(o["linga"]), _num(lc["angulo"], 0),
                    _num(lc["tracao"]), _num(av["capacidade_disponivel_kg"]) if av else "-",
                    _num(av["percentual_utilizado"], 1) if av else "-", ROTULO_STATUS[o["status"]],
                    " ".join([o["mensagem"]] + lc["avisos"])])
    return ("﻿" + buf.getvalue()).encode("utf-8")


@bp.post("/relatorio")
@login_obrigatorio
def relatorio():
    dados = request.get_json(silent=True) or {}
    formato = (dados.get("formato") or "pdf").lower()
    if formato not in ("pdf", "csv"):
        return jsonify({"erro": "Formato deve ser pdf ou csv."}), 400
    lista = dados.get("objetos") or []
    if not isinstance(lista, list) or not lista:
        return jsonify({"erro": "Coloque pelo menos um objeto na cena."}), 400
    if len(lista) > MAX_OBJETOS:
        return jsonify({"erro": f"No máximo {MAX_OBJETOS} objetos por relatório."}), 400
    g = db.session.get(Guindaste, dados.get("guindaste_id"))
    if not g:
        return jsonify({"erro": "Guindaste não encontrado."}), 400
    try:
        objetos = _avaliar_objetos(dados, [_objeto(d) for d in lista])
        img_radar = _imagem(dados.get("imagem_radar"))
        img_3d = _imagem(dados.get("imagem_3d"))
        img_2d = _imagem(dados.get("imagem_2d"))
    except ErroCena as e:
        return jsonify({"erro": str(e)}), 400
    ids = [int(i) for i in (dados.get("acessorio_ids") or [])]
    acessorios = Acessorio.query.filter(Acessorio.id.in_(ids)).all() if ids else []

    eu = usuario_atual()
    conteudo = _pdf(dados, g, acessorios, objetos, img_radar, img_3d, eu, img_2d) if formato == "pdf" else _csv(objetos)
    pasta = current_app.config["RELATORIOS_DIR"]
    os.makedirs(pasta, exist_ok=True)
    nome = f"cena_{eu.login}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{formato}"
    with open(os.path.join(pasta, nome), "wb") as f:
        f.write(conteudo)
    return send_file(io.BytesIO(conteudo), as_attachment=True, download_name=nome,
                     mimetype="application/pdf" if formato == "pdf" else "text/csv; charset=utf-8")
