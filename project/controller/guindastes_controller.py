from flask import Blueprint, jsonify
from project.model.entities import Guindaste, TabelaCapacidade

bp = Blueprint("guindastes", __name__, url_prefix="/api/guindastes")


@bp.get("")
def listar_guindastes():
    guindastes = Guindaste.query.all()
    return jsonify([g.to_dict() for g in guindastes])


@bp.get("/<int:guindaste_id>")
def detalhe_guindaste(guindaste_id):
    g = Guindaste.query.get_or_404(guindaste_id)
    return jsonify(g.to_dict())


@bp.get("/<int:guindaste_id>/tabela-capacidade")
def tabela_capacidade(guindaste_id):
    """Todos os pontos da tabela de capacidade, agrupados por quadrante."""
    linhas = TabelaCapacidade.query.filter_by(guindaste_id=guindaste_id).all()
    resultado = {"frontal": [], "lateral_traseira": []}
    for l in linhas:
        resultado[l.quadrante].append({
            "comprimento_lanca_m": float(l.comprimento_lanca_m),
            "angulo_graus": float(l.angulo_graus) if l.angulo_graus is not None else None,
            "raio_m": float(l.raio_m) if l.raio_m is not None else None,
            "capacidade_kg": float(l.capacidade_kg),
        })
    return jsonify(resultado)
