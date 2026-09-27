from flask import Blueprint, jsonify
from project.model.entities import Simulacao

bp = Blueprint("historico", __name__, url_prefix="/api/historico")


@bp.get("/<int:usuario_id>")
def historico_usuario(usuario_id):
    simulacoes = (
        Simulacao.query.filter_by(usuario_id=usuario_id)
        .order_by(Simulacao.data_simulacao.desc())
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
            "data_simulacao": s.data_simulacao.isoformat() if s.data_simulacao else None,
        }
        if s.resultado:
            item["status"] = s.resultado.status
            item["percentual_utilizado"] = float(s.resultado.percentual_utilizado)
        saida.append(item)
    return jsonify(saida)
