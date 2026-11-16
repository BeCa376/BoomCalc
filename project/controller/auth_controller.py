"""
Autenticação por sessão (cookie assinado do Flask).

Papéis:
  - operador: simula, salva simulações, mantém seus objetos e relatórios
  - administrador: tudo do operador + cadastros (usuários, acessórios,
    guindastes e tabela de capacidade)

A simulação em si (POST /api/simular sem salvar) continua aberta, para a
tela funcionar sem login; salvar, histórico, objetos e relatórios exigem login.
"""
import secrets
from functools import wraps
from flask import Blueprint, current_app, jsonify, request, session
from project.model import db
from project.model.entities import Usuario

bp = Blueprint("auth", __name__, url_prefix="/api/auth")


def autenticacao_ativa():
    return bool(current_app.config.get("AUTENTICACAO_ATIVA", False))


def _usuario_padrao():
    """Usuário usado enquanto o login está desligado: o primeiro administrador."""
    u = (Usuario.query.filter_by(papel="administrador").order_by(Usuario.id).first()
         or Usuario.query.order_by(Usuario.id).first())
    if u is None:
        u = Usuario(nome="Usuário padrão", login="padrao", papel="administrador")
        u.definir_senha(secrets.token_urlsafe(16))
        db.session.add(u)
        db.session.commit()
    return u


def usuario_atual():
    if not autenticacao_ativa():
        return _usuario_padrao()
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
    d = u.to_dict() if u else None
    if d is not None and not autenticacao_ativa():
        d["autenticacao"] = False   # a tela esconde "Entrar/Sair" quando o login está desligado
    return jsonify(d)