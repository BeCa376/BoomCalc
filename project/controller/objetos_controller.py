"""Objetos da cena 3D, salvos por usuário."""
import re

from flask import Blueprint, jsonify, request
from project.model import db
from project.model.entities import ObjetoCena
from project.controller.auth_controller import login_obrigatorio, usuario_atual

bp = Blueprint("objetos", __name__, url_prefix="/api/objetos")

LIMITES = {"peso": 0, "C": 0.1, "L": 0.1, "A": 0.1, "dist": 0, "linga": 0}
COR = re.compile(r"^#[0-9a-fA-F]{6}$")


def _preencher(o, d):
    for chave, coluna in ObjetoCena.CAMPOS.items():
        if chave not in d:
            continue
        if chave == "nome":
            nome = (d["nome"] or "").strip()[:80]
            if not nome:
                raise ValueError("Nome: obrigatório.")
            o.nome = nome
            continue
        if chave == "forma":
            if d["forma"] not in ObjetoCena.FORMAS:
                raise ValueError("Forma: use " + ", ".join(ObjetoCena.FORMAS) + ".")
            o.forma = d["forma"]
            continue
        if chave == "cor":
            if not COR.match(str(d["cor"] or "")):
                raise ValueError("Cor: use o formato #rrggbb.")
            o.cor = d["cor"].lower()
            continue
        if chave == "pernas":
            try:
                n = int(d["pernas"])
            except (TypeError, ValueError):
                n = 0
            if n not in ObjetoCena.PERNAS:
                raise ValueError("Pernas: use 1, 2 ou 4 pontos de pega.")
            o.pernas = n
            continue
        try:
            v = float(d[chave])
        except (TypeError, ValueError):
            raise ValueError(f"{chave}: número inválido.")
        if chave in LIMITES and v < LIMITES[chave]:
            raise ValueError(f"{chave}: deve ser no mínimo {LIMITES[chave]}.")
        setattr(o, coluna, v)
    # cilindro em pé: largura = diâmetro (= comprimento); tubo deitado: altura = diâmetro (= largura)
    if o.forma == "cilindro" and o.comprimento_m is not None:
        o.largura_m = o.comprimento_m
    elif o.forma == "tubo" and o.largura_m is not None:
        o.altura_m = o.largura_m


def _do_usuario(oid):
    o = db.get_or_404(ObjetoCena, oid)
    if o.usuario_id != usuario_atual().id:
        return None
    return o


@bp.get("")
@login_obrigatorio
def listar():
    objs = ObjetoCena.query.filter_by(usuario_id=usuario_atual().id).order_by(ObjetoCena.id).all()
    return jsonify([o.to_dict() for o in objs])


@bp.post("")
@login_obrigatorio
def criar():
    d = request.get_json(silent=True) or {}
    faltando = [c for c in ("nome", "peso", "C", "L", "A") if d.get(c) in (None, "")]
    if faltando:
        return jsonify({"erro": "Campos obrigatórios: " + ", ".join(faltando)}), 400
    o = ObjetoCena(usuario_id=usuario_atual().id)
    try:
        _preencher(o, d)
    except ValueError as e:
        return jsonify({"erro": str(e)}), 400
    db.session.add(o)
    db.session.commit()
    return jsonify(o.to_dict()), 201


@bp.put("/<int:oid>")
@login_obrigatorio
def editar(oid):
    o = _do_usuario(oid)
    if not o:
        return jsonify({"erro": "Objeto de outro usuário."}), 403
    try:
        _preencher(o, request.get_json(silent=True) or {})
    except ValueError as e:
        return jsonify({"erro": str(e)}), 400
    db.session.commit()
    return jsonify(o.to_dict())


@bp.delete("/<int:oid>")
@login_obrigatorio
def remover(oid):
    o = _do_usuario(oid)
    if not o:
        return jsonify({"erro": "Objeto de outro usuário."}), 403
    db.session.delete(o)
    db.session.commit()
    return jsonify({"ok": True})
