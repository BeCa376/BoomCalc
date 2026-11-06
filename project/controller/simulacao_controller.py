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


def _fora_dos_limites(guindaste, dados):
    """Comprimento de lança e ângulo precisam estar dentro do que o modelo permite."""
    comp = float(dados["comprimento_lanca_m"])
    ang = float(dados["angulo_graus"])
    cmin, cmax = float(guindaste.comprimento_lanca_min_m), float(guindaste.comprimento_lanca_max_m)
    amin, amax = float(guindaste.angulo_min_graus), float(guindaste.angulo_max_graus)
    if not cmin <= comp <= cmax:
        return f"RN06: comprimento de lança {comp} m fora do limite do {guindaste.modelo} ({cmin}–{cmax} m)."
    if not amin <= ang <= amax:
        return f"RN06: ângulo {ang}° fora do limite do {guindaste.modelo} ({amin}–{amax}°)."
    return None


@bp.post("/simular")
def simular():
    """
    Corpo (JSON): guindaste_id, comprimento_lanca_m, angulo_graus,
    angulo_giro_graus, raio_operacao_m, peso_carga_kg, massa_lingada_kg,
    massa_cabo_kg, usa_balancim, massa_balancim_kg, velocidade_vento_ms,
    acessorio_ids[], condicao_terreno (firme|mole|nao_informado), salvar (bool).
    Para salvar é preciso estar logado (a simulação vai para o usuário da sessão).
    """
    dados = request.get_json(force=True)

    faltando = validar_campos_obrigatorios(
        dados, ["guindaste_id", "comprimento_lanca_m", "angulo_graus",
                "raio_operacao_m", "peso_carga_kg"]
    )
    if faltando:
        return jsonify({"erro": f"RN03: campos obrigatórios ausentes: {', '.join(faltando)}"}), 400

    guindaste = db.get_or_404(Guindaste, dados["guindaste_id"])
    erro_limite = _fora_dos_limites(guindaste, dados)
    if erro_limite:
        return jsonify({"erro": erro_limite}), 400
    quadrante = quadrante_por_giro(dados.get("angulo_giro_graus", 0))
    linhas = _linhas_mais_proximas(dados["guindaste_id"], quadrante, dados["comprimento_lanca_m"])
    capacidade_tabela = capacidade_disponivel(
        linhas, angulo=dados.get("angulo_graus"), raio=dados.get("raio_operacao_m")
    )

    # RN07: acessórios somam massa (quando não estão já inclusos na tabela)
    # e podem reduzir a capacidade pelo fator de redução.
    ids = [int(i) for i in (dados.get("acessorio_ids") or [])]
    acessorios = Acessorio.query.filter(Acessorio.id.in_(ids)).all() if ids else []
    massa_acessorios = sum(float(a.massa_kg or 0) for a in acessorios if a.soma_na_carga)
    fator = 1.0
    for a in acessorios:
        fator *= float(a.fator_reducao if a.fator_reducao is not None else 1)
    capacidade = capacidade_tabela * fator

    terreno = dados.get("condicao_terreno") or "nao_informado"
    if terreno not in TERRENOS:
        return jsonify({"erro": "Condição de terreno inválida."}), 400

    avaliacao = avaliar_operacao(
        capacidade_kg=capacidade,
        massa_acessorios=massa_acessorios,
        peso_carga=dados.get("peso_carga_kg"),
        massa_lingada=dados.get("massa_lingada_kg", 0),
        massa_cabo=dados.get("massa_cabo_kg", 0),
        usa_balancim=dados.get("usa_balancim", False),
        massa_balancim=dados.get("massa_balancim_kg", 0),
        velocidade_vento=dados.get("velocidade_vento_ms"),
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

    if dados.get("salvar"):
        usuario = usuario_atual()
        if not usuario:
            return jsonify({"erro": "Faça login para salvar a simulação."}), 401
        if not dados.get("peso_carga_kg") or float(dados["peso_carga_kg"]) <= 0:
            return jsonify({"erro": "RN01: informe o peso da carga para salvar."}), 400
        if float(dados["raio_operacao_m"]) <= 0:
            return jsonify({"erro": "RN02: o raio de operação deve ser maior que zero."}), 400
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
    dados = request.get_json(force=True)
    quadrante = quadrante_por_giro(dados.get("angulo_giro_graus", 0))
    linhas = _linhas_mais_proximas(
        dados["guindaste_id"], quadrante, dados["comprimento_lanca_m"]
    )
    peso = dados["peso_kg"]

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
