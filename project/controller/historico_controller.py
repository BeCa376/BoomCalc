from flask import Blueprint, jsonify
from project.model.entities import Simulacao
from project.controller.auth_controller import login_obrigatorio, usuario_atual

bp = Blueprint("historico", __name__, url_prefix="/api/historico")


def _lista(usuario_id):
    simulacoes = (
        Simulacao.query.filter_by(usuario_id=usuario_id)
        .order_by(Simulacao.data_simulacao.desc(), Simulacao.id.desc())
        .all()
    )
    saida = []
    for s in simulacoes:
        item = {
            "id": s.id,
            "guindaste_id": s.guindaste_id,
            "comprimento_lanca_m": float(s.comprimento_lanca_m),
            "angulo_graus": float(s.angulo_graus),
            "raio_operacao_m": float(s.raio_operacao_m),
            "quadrante": s.quadrante,
            "condicao_terreno": s.condicao_terreno,
            "data_simulacao": s.data_simulacao.isoformat() if s.data_simulacao else None,
        }
        if s.resultado:
            item["status"] = s.resultado.status
            item["percentual_utilizado"] = float(s.resultado.percentual_utilizado)
        saida.append(item)
    return jsonify(saida)


@bp.get("")
@login_obrigatorio
def meu_historico():
    return _lista(usuario_atual().id)


@bp.get("/<int:usuario_id>")
@login_obrigatorio
def historico_usuario(usuario_id):
    eu = usuario_atual()
    if eu.id != usuario_id and not eu.is_admin:
        return jsonify({"erro": "Você só pode ver o seu próprio histórico."}), 403
    return _lista(usuario_id)
