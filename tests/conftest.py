"""
Fixtures dos testes: app Flask com SQLite em memória, carregado com os
INSERTs do seed.sql (o schema vem das entidades SQLAlchemy; o teste
test_schema confere que as colunas batem com o CREATE TABLE do seed).
"""
import os
import re
import sys

import pytest
from sqlalchemy import text
from sqlalchemy.pool import StaticPool

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, RAIZ)
SEED = os.path.join(RAIZ, "seed.sql")


def inserts_do_seed():
    sql = open(SEED, encoding="utf8").read()
    for st in re.findall(r"(INSERT INTO.*?;)\s*\n", sql, re.S):
        yield st.replace("FALSE", "0").replace("TRUE", "1")


@pytest.fixture()
def app(tmp_path):
    from project import create_app
    from project.model import db
    app = create_app({
        "TESTING": True,
        "SQLALCHEMY_DATABASE_URI": "sqlite://",
        "SQLALCHEMY_ENGINE_OPTIONS": {"connect_args": {"check_same_thread": False}, "poolclass": StaticPool},
        "RELATORIOS_DIR": str(tmp_path / "relatorios"),
        "SECRET_KEY": "teste",
    })
    with app.app_context():
        db.create_all()
        for st in inserts_do_seed():
            db.session.execute(text(st))
        db.session.commit()
        yield app
        db.session.remove()


@pytest.fixture()
def client(app):
    return app.test_client()


def logar(client, login, senha):
    r = client.post("/api/auth/login", json={"login": login, "senha": senha})
    assert r.status_code == 200, r.get_json()
    return r.get_json()


@pytest.fixture()
def operador(client):
    return logar(client, "operador", "operador123")


@pytest.fixture()
def admin(client):
    return logar(client, "admin", "admin123")
