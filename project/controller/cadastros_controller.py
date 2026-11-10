"""
Cadastros do administrador: usuários, acessórios, dados do guindaste e
pontos da tabela de capacidade. A lista de acessórios é pública (a tela de
simulação precisa dela para o operador escolher).
"""
from flask import Blueprint, jsonify, request
from project.model import db
from project.model.entities import Usuario, Acessorio, Guindaste, TabelaCapacidade
from project.controller.auth_controller import admin_obrigatorio, usuario_atual

bp = Blueprint("cadastros", __name__, url_prefix="/api")


def _json():
    return request.get_json(silent=True) or {}


def _num(valor, campo, minimo=None, opcional=False):
    if valor in (None, ""):
        if opcional:
            return None
        raise ValueError(f"{campo}: obrigatório.")
    try:
        v = float(valor)
    except (TypeError, ValueError):
        raise ValueError(f"{campo}: número inválido.")
    if minimo is not None and v < minimo:
        raise ValueError(f"{campo}: deve ser no mínimo {minimo}.")
    return v


def _erro(e, status=400):
    return jsonify({"erro": str(e)}), status


# ------------------------------------------------------------------ acessórios
@bp.get("/acessorios")
def listar_acessorios():
    return jsonify([a.to_dict() for a in Acessorio.query.order_by(Acessorio.nome).all()])


def _preencher_acessorio(a, d):
    nome = (d.get("nome") or "").strip()
    if not nome:
        raise ValueError("Nome: obrigatório.")
    a.nome = nome
    a.massa_kg = _num(d.get("massa_kg", 0), "Massa", 0)
    fator = _num(d.get("fator_reducao", 1), "Fator de redução", 0)
    if fator > 1:
        raise ValueError("Fator de redução: deve ficar entre 0 e 1 (1 = não reduz).")
    a.fator_reducao = fator
    a.soma_na_carga = bool(d.get("soma_na_carga", True))
    a.observacoes = d.get("observacoes") or None


@bp.post("/admin/acessorios")
@admin_obrigatorio
def criar_acessorio():
    a = Acessorio()
    try:
        _preencher_acessorio(a, _json())
    except ValueError as e:
        return _erro(e)
    db.session.add(a)
    db.session.commit()
    return jsonify(a.to_dict()), 201


@bp.put("/admin/acessorios/<int:aid>")
@admin_obrigatorio
def editar_acessorio(aid):
    a = db.get_or_404(Acessorio, aid)
    try:
        _preencher_acessorio(a, _json())
    except ValueError as e:
        return _erro(e)
    db.session.commit()
    return jsonify(a.to_dict())


@bp.delete("/admin/acessorios/<int:aid>")
@admin_obrigatorio
def remover_acessorio(aid):
    a = db.get_or_404(Acessorio, aid)
    db.session.delete(a)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return _erro("Acessório já usado em simulações salvas — não pode ser removido.", 409)
    return jsonify({"ok": True})


# ------------------------------------------------------------------ usuários
@bp.get("/admin/usuarios")
@admin_obrigatorio
def listar_usuarios():
    return jsonify([u.to_dict() for u in Usuario.query.order_by(Usuario.nome).all()])


def _preencher_usuario(u, d, novo):
    nome = (d.get("nome") or "").strip()
    login = (d.get("login") or "").strip()
    if not nome or not login:
        raise ValueError("Nome e login são obrigatórios.")
    outro = Usuario.query.filter_by(login=login).first()
    if outro and outro.id != u.id:
        raise ValueError(f"Já existe um usuário com o login '{login}'.")
    papel = d.get("papel") or "operador"
    if papel not in ("operador", "administrador"):
        raise ValueError("Papel inválido.")
    senha = d.get("senha") or ""
    if novo and len(senha) < 6:
        raise ValueError("Senha: mínimo de 6 caracteres.")
    if senha and len(senha) < 6:
        raise ValueError("Senha: mínimo de 6 caracteres.")
    u.nome, u.login, u.papel = nome, login, papel
    if senha:
        u.definir_senha(senha)


@bp.post("/admin/usuarios")
@admin_obrigatorio
def criar_usuario():
    u = Usuario()
    try:
        _preencher_usuario(u, _json(), novo=True)
    except ValueError as e:
        return _erro(e)
    db.session.add(u)
    db.session.commit()
    return jsonify(u.to_dict()), 201


@bp.put("/admin/usuarios/<int:uid>")
@admin_obrigatorio
def editar_usuario(uid):
    u = db.get_or_404(Usuario, uid)
    eu = usuario_atual()
    d = _json()
    if u.id == eu.id and d.get("papel") and d.get("papel") != "administrador":
        return _erro("Você não pode tirar o seu próprio acesso de administrador.")
    try:
        _preencher_usuario(u, d, novo=False)
    except ValueError as e:
        return _erro(e)
    db.session.commit()
    return jsonify(u.to_dict())


@bp.delete("/admin/usuarios/<int:uid>")
@admin_obrigatorio
def remover_usuario(uid):
    u = db.get_or_404(Usuario, uid)
    if u.id == usuario_atual().id:
        return _erro("Você não pode remover o seu próprio usuário.")
    db.session.delete(u)
    try:
        db.session.commit()
    except Exception:
        db.session.rollback()
        return _erro("Usuário tem simulações ou objetos salvos — não pode ser removido.", 409)
    return jsonify({"ok": True})


# ------------------------------------------------------------------ guindaste
@bp.put("/admin/guindastes/<int:gid>")
@admin_obrigatorio
def editar_guindaste(gid):
    g = db.get_or_404(Guindaste, gid)
    d = _json()
    try:
        cap = _num(d.get("capacidade_maxima_kg"), "Capacidade nominal", 1)
        cmin = _num(d.get("comprimento_lanca_min_m"), "Lança mínima", 0)
        cmax = _num(d.get("comprimento_lanca_max_m"), "Lança máxima", 0)
        amin = _num(d.get("angulo_min_graus", 0), "Ângulo mínimo", 0)
        amax = _num(d.get("angulo_max_graus"), "Ângulo máximo", 0)
        jib = _num(d.get("comprimento_jib_m"), "Comprimento do JIB", 0, opcional=True)
        peso = _num(d.get("peso_total_kg"), "Peso total", 0, opcional=True)
        dims = {c: _num(d.get(c), rot, 0, opcional=True) for c, rot in (
            ("comprimento_m", "Comprimento"), ("largura_m", "Largura"), ("altura_m", "Altura"),
            ("abertura_patolas_m", "Abertura das patolas"))}
    except ValueError as e:
        return _erro(e)
    if cmin >= cmax:
        return _erro("A lança mínima deve ser menor que a máxima.")
    if amin >= amax or amax > 90:
        return _erro("Ângulos inválidos (mínimo < máximo ≤ 90°).")
    g.capacidade_maxima_kg, g.comprimento_lanca_min_m, g.comprimento_lanca_max_m = cap, cmin, cmax
    g.angulo_min_graus, g.angulo_max_graus = amin, amax
    g.possui_jib = bool(d.get("possui_jib"))
    g.comprimento_jib_m = jib if g.possui_jib else None
    g.peso_total_kg = peso
    for c, v in dims.items():
        setattr(g, c, v)
    g.observacoes = d.get("observacoes") or None
    db.session.commit()
    return jsonify(g.to_dict())


# ------------------------------------------------------------------ tabela de capacidade
@bp.get("/admin/guindastes/<int:gid>/tabela")
@admin_obrigatorio
def linhas_tabela(gid):
    db.get_or_404(Guindaste, gid)
    linhas = (TabelaCapacidade.query.filter_by(guindaste_id=gid)
              .order_by(TabelaCapacidade.quadrante, TabelaCapacidade.comprimento_lanca_m,
                        TabelaCapacidade.angulo_graus, TabelaCapacidade.raio_m).all())
    return jsonify([l.to_dict() for l in linhas])


@bp.post("/admin/guindastes/<int:gid>/tabela")
@admin_obrigatorio
def adicionar_linha(gid):
    db.get_or_404(Guindaste, gid)
    d = _json()
    quadrante = d.get("quadrante")
    if quadrante not in ("frontal", "lateral_traseira"):
        return _erro("Quadrante inválido.")
    try:
        comp = _num(d.get("comprimento_lanca_m"), "Comprimento da lança", 0)
        ang = _num(d.get("angulo_graus"), "Ângulo", 0, opcional=True)
        raio = _num(d.get("raio_m"), "Raio", 0, opcional=True)
        cap = _num(d.get("capacidade_kg"), "Capacidade", 0)
    except ValueError as e:
        return _erro(e)
    if (ang is None) == (raio is None):
        return _erro("Informe o ângulo OU o raio do ponto (um dos dois).")
    # cada modelo usa um só tipo de tabela (por ângulo ou por raio)
    existente = TabelaCapacidade.query.filter_by(guindaste_id=gid).first()
    if existente and ((existente.angulo_graus is not None) != (ang is not None)):
        tipo = "ângulo" if existente.angulo_graus is not None else "raio"
        return _erro(f"A tabela deste guindaste é por {tipo}; use o mesmo tipo.")
    l = TabelaCapacidade(guindaste_id=gid, quadrante=quadrante, comprimento_lanca_m=comp,
                         angulo_graus=ang, raio_m=raio, capacidade_kg=cap)
    db.session.add(l)
    db.session.commit()
    return jsonify(l.to_dict()), 201


@bp.delete("/admin/tabela/<int:lid>")
@admin_obrigatorio
def remover_linha(lid):
    l = db.get_or_404(TabelaCapacidade, lid)
    db.session.delete(l)
    db.session.commit()
    return jsonify({"ok": True})
