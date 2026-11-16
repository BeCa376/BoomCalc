import json
import math
from datetime import datetime

from flask import Blueprint, jsonify, request, current_app
from project.model import db
from project.model.entities import Guindaste, TabelaCapacidade, Carga, Simulacao, Resultado, Acessorio
from project.model.regras_negocio import capacidade_disponivel, avaliar_operacao, quadrante_por_giro
from project.functions.utils import validar_campos_obrigatorios
from project.controller.auth_controller import usuario_atual

TERRENOS = ("firme", "mole", "nao_informado")

bp = Blueprint("simulacao", __name__, url_prefix="/api")


def _linhas_mais_proximas(guindaste_id, quadrante, comprimento_lanca):
    """
    Pega, dentre os comprimentos de lança cadastrados na tabela, o menor que
    seja maior ou igual ao comprimento atual (RN06). Lança mais longa tem
    capacidade menor, então arredondar para cima é o lado seguro. Se a lança
    for maior que todos os comprimentos tabelados, usa o maior.
    """
    linhas = TabelaCapacidade.query.filter_by(
        guindaste_id=guindaste_id, quadrante=quadrante
    ).all()
    if not linhas:
        return []
    comprimentos = sorted({float(l.comprimento_lanca_m) for l in linhas})
    acima = [c for c in comprimentos if c >= float(comprimento_lanca)]
    mais_proximo = acima[0] if acima else comprimentos[-1]
    return [
        {
            "angulo_graus": float(l.angulo_graus) if l.angulo_graus is not None else None,
            "raio_m": float(l.raio_m) if l.raio_m is not None else None,
            "capacidade_kg": float(l.capacidade_kg),
        }
        for l in linhas
        if float(l.comprimento_lanca_m) == mais_proximo
    ]


def _fora_dos_limites(guindaste, comp, ang, giro=0.0):
    """Comprimento de lança, ângulo e giro precisam estar dentro do que o modelo permite."""
    cmin, cmax = float(guindaste.comprimento_lanca_min_m), float(guindaste.comprimento_lanca_max_m)
    amin, amax = float(guindaste.angulo_min_graus), float(guindaste.angulo_max_graus)
    if not cmin <= comp <= cmax:
        return f"RN06: comprimento de lança {comp} m fora do limite do {guindaste.modelo} ({cmin}–{cmax} m)."
    if not amin <= ang <= amax:
        return f"RN06: ângulo {ang}° fora do limite do {guindaste.modelo} ({amin}–{amax}°)."
    gmax = float(guindaste.giro_max_graus if guindaste.giro_max_graus is not None else 180)
    if abs(giro) > gmax:
        return f"RN06: giro de {giro:g}° fora do limite do {guindaste.modelo} (±{gmax:g}°)."
    return None


class ErroSimulacao(ValueError):
    """Dado inválido para simular (vira HTTP 400)."""


def _num(dados, campo, rotulo, minimo=None, maximo=None, padrao=None, positivo=False):
    """Lê um número do JSON com validação: converte, recusa NaN/infinito/texto e confere limites.
    Dado inválido vira ErroSimulacao (HTTP 400) em vez de erro 500."""
    v = dados.get(campo)
    if v in (None, ""):
        if padrao is None:
            raise ErroSimulacao(f"RN03: campos obrigatórios ausentes: {campo}")
        return padrao
    if isinstance(v, bool):
        raise ErroSimulacao(f"{rotulo}: número inválido.")
    try:
        v = float(v)
    except (TypeError, ValueError):
        raise ErroSimulacao(f"{rotulo}: número inválido.")
    if not math.isfinite(v):
        raise ErroSimulacao(f"{rotulo}: número inválido.")
    if positivo and v <= 0:
        raise ErroSimulacao(f"{rotulo}: deve ser maior que zero.")
    if minimo is not None and v < minimo:
        raise ErroSimulacao(f"{rotulo}: não pode ser menor que {minimo:g}.")
    if maximo is not None and v > maximo:
        raise ErroSimulacao(f"{rotulo}: não pode ser maior que {maximo:g}.")
    return v


def _inteiros(valor, rotulo):
    """Lista de ids inteiros (ou vazia)."""
    if valor in (None, ""):
        return []
    if not isinstance(valor, (list, tuple)):
        raise ErroSimulacao(f"{rotulo}: deve ser uma lista de números.")
    try:
        return [int(i) for i in valor if not isinstance(i, bool)]
    except (TypeError, ValueError):
        raise ErroSimulacao(f"{rotulo}: deve ser uma lista de números.")


def _booleano(v):
    if isinstance(v, str):
        return v.strip().lower() in ("1", "true", "sim", "on")
    return bool(v)


def avaliar(dados):
    """
    Núcleo da simulação (RN01–RN08), usado por /api/simular e pelo relatório da cena.
    Devolve (guindaste, avaliacao, acessorios, terreno); dado inválido -> ErroSimulacao.
    """
    if not isinstance(dados, dict):
        raise ErroSimulacao("Corpo da requisição inválido: envie um objeto JSON.")
    faltando = validar_campos_obrigatorios(
        dados, ["guindaste_id", "comprimento_lanca_m", "angulo_graus",
                "raio_operacao_m", "peso_carga_kg"]
    )
    if faltando:
        raise ErroSimulacao(f"RN03: campos obrigatórios ausentes: {', '.join(faltando)}")

    # --- validação de tipos e limites (nada de texto, NaN, infinito ou massa negativa) ---
    gid = _num(dados, "guindaste_id", "Guindaste")
    comp = _num(dados, "comprimento_lanca_m", "Comprimento da lança", positivo=True)
    ang = _num(dados, "angulo_graus", "Ângulo", minimo=0, maximo=90)
    raio = _num(dados, "raio_operacao_m", "RN02: raio de operação", positivo=True)
    peso = _num(dados, "peso_carga_kg", "Peso da carga")
    lingada = _num(dados, "massa_lingada_kg", "Massa da lingada", minimo=0, padrao=0.0)
    cabo = _num(dados, "massa_cabo_kg", "Massa do cabo de aço", minimo=0, padrao=0.0)
    balancim = _num(dados, "massa_balancim_kg", "Massa do balancim", minimo=0, padrao=0.0)
    vento = _num(dados, "velocidade_vento_ms", "Velocidade do vento", minimo=0, padrao=-1.0)
    vento = None if vento < 0 else vento
    giro = _num(dados, "angulo_giro_graus", "Ângulo de giro", minimo=-360, maximo=360, padrao=0.0)
    ids = _inteiros(dados.get("acessorio_ids"), "Acessórios")

    guindaste = db.session.get(Guindaste, int(gid))
    if guindaste is None:
        raise ErroSimulacao("Guindaste não encontrado.")
    erro_limite = _fora_dos_limites(guindaste, comp, ang, giro)
    if erro_limite:
        raise ErroSimulacao(erro_limite)
    quadrante = quadrante_por_giro(giro, guindaste.setor_frontal_graus)
    linhas = _linhas_mais_proximas(guindaste.id, quadrante, comp)
    capacidade_tabela = capacidade_disponivel(linhas, angulo=ang, raio=raio)

    # RN07: acessórios somam massa (quando não estão já inclusos na tabela)
    # e podem reduzir a capacidade pelo fator de redução.
    acessorios = Acessorio.query.filter(Acessorio.id.in_(ids)).all() if ids else []
    massa_acessorios = sum(float(a.massa_kg or 0) for a in acessorios if a.soma_na_carga)
    fator = 1.0
    for a in acessorios:
        fator *= float(a.fator_reducao if a.fator_reducao is not None else 1)
    capacidade = capacidade_tabela * fator

    terreno = dados.get("condicao_terreno") or "nao_informado"
    if terreno not in TERRENOS:
        raise ErroSimulacao("Condição de terreno inválida.")

    avaliacao = avaliar_operacao(
        capacidade_kg=capacidade,
        massa_acessorios=massa_acessorios,
        peso_carga=peso,
        massa_lingada=lingada,
        massa_cabo=cabo,
        usa_balancim=_booleano(dados.get("usa_balancim", False)),
        massa_balancim=balancim,
        velocidade_vento=vento,
        limite_vento_ms=current_app.config.get("LIMITE_VENTO_MS", 12.5),
        limite_percentual_alerta=current_app.config.get("LIMITE_PERCENTUAL_ALERTA", 80),
        capacidade_nominal_kg=float(guindaste.capacidade_maxima_kg),
    )
    avaliacao["quadrante"] = quadrante
    avaliacao["capacidade_tabela_kg"] = capacidade_tabela
    avaliacao["fator_acessorios"] = round(fator, 3)
    avaliacao["massa_acessorios_kg"] = massa_acessorios
    avaliacao["avisos"] = []
    if terreno == "mole":
        avaliacao["avisos"].append(
            "Terreno mole: apoie as sapatas das patolas em pranchões/placas e confirme a "
            "capacidade do solo. A regra de redução para terreno ainda não foi definida."
        )
    elif terreno == "nao_informado":
        avaliacao["avisos"].append("Condição do terreno não informada.")
    return guindaste, avaliacao, acessorios, terreno


@bp.post("/simular")
def simular():
    """
    Corpo (JSON): guindaste_id, comprimento_lanca_m, angulo_graus,
    angulo_giro_graus, raio_operacao_m, peso_carga_kg, massa_lingada_kg,
    massa_cabo_kg, usa_balancim, massa_balancim_kg, velocidade_vento_ms,
    acessorio_ids[], condicao_terreno (firme|mole|nao_informado), salvar (bool).
    Para salvar é preciso estar logado (a simulação vai para o usuário da sessão).
    """
    dados = request.get_json(silent=True)
    try:
        guindaste, avaliacao, acessorios, terreno = avaliar(dados)
    except ErroSimulacao as e:
        return jsonify({"erro": str(e)}), 400
    quadrante = avaliacao["quadrante"]

    if dados.get("salvar"):
        usuario = usuario_atual()
        if not usuario:
            return jsonify({"erro": "Faça login para salvar a simulação."}), 401
        if not dados.get("peso_carga_kg") or float(dados["peso_carga_kg"]) <= 0:
            return jsonify({"erro": "RN01: informe o peso da carga para salvar."}), 400
        if float(dados["raio_operacao_m"]) <= 0:
            return jsonify({"erro": "RN02: o raio de operação deve ser maior que zero."}), 400
        estado_json = None
        estado = dados.get("estado")
        if estado is not None:
            if not isinstance(estado, dict):
                return jsonify({"erro": "Estado da simulação inválido."}), 400
            estado_json = json.dumps(estado, ensure_ascii=False, separators=(",", ":"))
            if len(estado_json) > 20000:
                return jsonify({"erro": "Estado da simulação grande demais."}), 400
        carga = Carga(
            peso_kg=dados["peso_carga_kg"],
            descricao=dados.get("descricao_carga"),
            comprimento_m=dados.get("comprimento_carga_m"),
            largura_m=dados.get("largura_carga_m"),
            altura_m=dados.get("altura_carga_m"),
        )
        db.session.add(carga)
        db.session.flush()

        sim = Simulacao(
            usuario_id=usuario.id,
            guindaste_id=dados["guindaste_id"],
            carga_id=carga.id,
            comprimento_lanca_m=dados["comprimento_lanca_m"],
            angulo_graus=dados["angulo_graus"],
            raio_operacao_m=dados["raio_operacao_m"],
            quadrante=quadrante,
            usa_jib=dados.get("usa_jib", False),
            massa_lingada_kg=dados.get("massa_lingada_kg", 0),
            massa_cabo_kg=dados.get("massa_cabo_kg", 0),
            usa_balancim=dados.get("usa_balancim", False),
            massa_balancim_kg=dados.get("massa_balancim_kg", 0),
            velocidade_vento_ms=dados.get("velocidade_vento_ms"),
            condicao_terreno=terreno,
            estado_json=estado_json,
            # hora local do servidor (o padrão do banco é UTC no SQLite e local no MySQL)
            data_simulacao=datetime.now(),
        )
        sim.acessorios = acessorios
        db.session.add(sim)
        db.session.flush()

        resultado = Resultado(
            simulacao_id=sim.id,
            capacidade_disponivel_kg=avaliacao["capacidade_disponivel_kg"],
            carga_total_kg=avaliacao["carga_total_kg"],
            percentual_utilizado=avaliacao["percentual_utilizado"],
            status=avaliacao["status"],
            alerta_vento=avaliacao["alerta_vento"],
            mensagem=avaliacao["mensagem"],
        )
        db.session.add(resultado)
        db.session.commit()
        avaliacao["simulacao_id"] = sim.id

    return jsonify(avaliacao)


@bp.post("/simular/alcance-maximo")
def alcance_maximo():
    """Cálculo reverso: dado um peso, acha o ponto de maior alcance seguro."""
    dados = request.get_json(silent=True)
    try:
        if not isinstance(dados, dict):
            raise ErroSimulacao("Corpo da requisição inválido: envie um objeto JSON.")
        gid = int(_num(dados, "guindaste_id", "Guindaste"))
        comp = _num(dados, "comprimento_lanca_m", "Comprimento da lança", positivo=True)
        peso = _num(dados, "peso_kg", "Peso", positivo=True)
        giro = _num(dados, "angulo_giro_graus", "Ângulo de giro", minimo=-360, maximo=360, padrao=0.0)
    except ErroSimulacao as e:
        return jsonify({"erro": str(e)}), 400
    guindaste = db.session.get(Guindaste, gid)
    if guindaste is None:
        return jsonify({"erro": "Guindaste não encontrado."}), 400
    erro_giro = _fora_dos_limites(guindaste, comp, 0, giro)
    if erro_giro:
        return jsonify({"erro": erro_giro}), 400
    quadrante = quadrante_por_giro(giro, guindaste.setor_frontal_graus)
    linhas = _linhas_mais_proximas(gid, quadrante, comp)

    candidatos = [l for l in linhas if l["capacidade_kg"] >= peso]
    if not candidatos:
        return jsonify({
            "encontrado": False,
            "mensagem": "Nenhum ponto da tabela suporta esse peso neste comprimento de lança."
        })

    usa_raio = candidatos[0]["raio_m"] is not None
    if usa_raio:
        melhor = max(candidatos, key=lambda l: l["raio_m"])
    else:
        melhor = min(candidatos, key=lambda l: l["angulo_graus"])  # menor ângulo = maior raio

    return jsonify({"encontrado": True, "quadrante": quadrante, "ponto": melhor})