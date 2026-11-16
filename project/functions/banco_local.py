"""
Banco local (SQLite) para a versão executável do BoomCalc.

Na versão para o professor não existe MySQL: o computador dele guarda tudo num arquivo (boomcalc.db).
Na primeira execução as tabelas são criadas a partir das entidades e os dados iniciais (guindastes,
tabelas de capacidade, acessórios e usuários) vêm do mesmo seed.sql usado com MySQL. Nas execuções
seguintes nada é recriado, então as simulações salvas continuam lá.
"""
import re

from project.model import db
from project.model.entities import Guindaste


def preparar_banco_local(app, caminho_seed):
    """Cria as tabelas se faltarem e carrega o seed.sql só se o banco ainda estiver vazio.
    Devolve True quando carregou os dados iniciais (primeira execução)."""
    with app.app_context():
        db.create_all()
        if db.session.query(Guindaste.id).first() is not None:
            return False
        with open(caminho_seed, encoding="utf-8") as f:
            sql = f.read()
        # só os INSERTs: o esquema vem das entidades (o seed.sql é escrito para MySQL)
        with db.engine.begin() as con:
            for comando in re.findall(r"(INSERT INTO.*?;)\s*(?:\n|\Z)", sql, re.S):
                con.exec_driver_sql(comando)
        return True