from flask import Blueprint, jsonify, request, current_app
from project.model import db
from project.model.entities import Guindaste, TabelaCapacidade, Carga, Simulacao, Resultado, Acessorio
from project.model.regras_negocio import capacidade_disponivel, avaliar_operacao, quadrante_por_giro
from project.functions.utils import validar_campos_obrigatorios

bp = Blueprint("simulacao", __name__, url_prefix="/api")


def _linhas_mais_proximas(guindaste_id, quadrante, comprimento_lanca):
    """
    Pega, dentre os comprimentos de lança cadastrados na tabela, o mais
    próximo do comprimento atual da simulação (RN06).
    """
    linhas = TabelaCapacidade.query.filter_by(
        guindaste_id=guindaste_id, quadrante=quadrante
    ).all()
    if not linhas:
        return []
    comprimentos = sorted({float(l.comprimento_lanca_m) for l in linhas})
    mais_proximo = min(comprimentos, key=lambda c: abs(c - comprimento_lanca))
    return [
        {
            "angulo_graus": float(l.angulo_graus) if l.angulo_graus is not None else None,
            "raio_m": float(l.raio_m) if l.raio_m is not None else None,
            "capacidade_kg": float(l.capacidade_kg),
        }
        for l in linhas
        if float(l.comprimento_lanca_m) == mais_proximo
    ]


@bp.post("/simular")
def simular():
    """
    Corpo (JSON): guindaste_id, comprimento_lanca_m, angulo_graus,
    angulo_giro_graus, raio_operacao_m, peso_carga_kg, massa_lingada_kg,
    massa_cabo_kg, usa_balancim, massa_balancim_kg, velocidade_vento_ms,
    acessorio_ids[], usuario_id, salvar (bool)
    """
    dados = request.get_json(force=True)

    faltando = validar_campos_obrigatorios(
        dados, ["guindaste_id", "comprimento_lanca_m", "angulo_graus",
                "raio_operacao_m", "peso_carga_kg"]
    )
    if faltando:
        return jsonify({"erro": f"RN03: campos obrigatórios ausentes: {', '.join(faltando)}"}), 400

    guindaste = Guindaste.query.get_or_404(dados["guindaste_id"])
    quadrante = quadrante_por_giro(dados.get("angulo_giro_graus", 0))
    linhas = _linhas_mais_proximas(dados["guindaste_id"], quadrante, dados["comprimento_lanca_m"])
    capacidade = capacidade_disponivel(
        linhas, angulo=dados.get("angulo_graus"), raio=dados.get("raio_operacao_m")
    )

    avaliacao = avaliar_operacao(
        capacidade_kg=capacidade,
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

    if dados.get("salvar") and dados.get("usuario_id"):
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
            usuario_id=dados["usuario_id"],
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
        )
        if dados.get("acessorio_ids"):
            sim.acessorios = Acessorio.query.filter(
                Acessorio.id.in_(dados["acessorio_ids"])
            ).all()
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
