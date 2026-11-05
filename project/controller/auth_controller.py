"""
Autenticação por sessão (cookie assinado do Flask).

Papéis:
  - operador: simula, salva simulações, mantém seus objetos e relatórios
  - administrador: tudo do operador + cadastros (usuários, acessórios,
    guindastes e tabela de capacidade)

A simulação em si (POST /api/simular sem salvar) continua aberta, para a
tela funcionar sem login; salvar, histórico, objetos e relatórios exigem login.
"""
from functools import wraps
from flask import Blueprint, jsonify, request, session
from project.model import db
from project.model.entities import Usuario

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def usuario_atual():
    uid = session.get("usuario_id")
    return db.session.get(Usuario, uid) if uid else None


def login_obrigatorio(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if not usuario_atual():
            return jsonify({"erro": "Faça login para continuar."}), 401
        return f(*args, **kwargs)
    return wrapper


def admin_obrigatorio(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        u = usuario_atual()
        if not u:
            return jsonify({"erro": "Faça login para continuar."}), 401
        if not u.is_admin:
            return jsonify({"erro": "Apenas administradores podem fazer isso."}), 403
        return f(*args, **kwargs)
    return wrapper


@bp.post("/login")
def login():
    dados = request.get_json(silent=True) or {}
    login_ = (dados.get("login") or "").strip()
    senha = dados.get("senha") or ""
    u = Usuario.query.filter_by(login=login_).first()
    if not u or not u.confere_senha(senha):
        return jsonify({"erro": "Login ou senha inválidos."}), 401
    session.clear()
    session["usuario_id"] = u.id
    return jsonify(u.to_dict())


@bp.post("/logout")
def logout():
    session.clear()
    return jsonify({"ok": True})


@bp.get("/me")
def me():
    u = usuario_atual()
    return jsonify(u.to_dict() if u else None)
