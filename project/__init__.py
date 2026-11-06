from flask import Flask
from flask_cors import CORS

from config.config import Config
from project.model import db
from project.controller import (
    auth_controller, cadastros_controller, guindastes_controller, historico_controller,
    objetos_controller, relatorio_controller, simulacao_controller,
)


def create_app(config_extra=None):
    # static_folder=None: os arquivos do front são servidos pelas rotas do app.py
    app = Flask(__name__, static_folder=None, template_folder="html")
    app.config.from_object(Config)
    if config_extra:
        app.config.update(config_extra)

    db.init_app(app)
    CORS(app)  # útil em dev; restrinja a origem em produção

    for modulo in (auth_controller, cadastros_controller, guindastes_controller,
                   historico_controller, objetos_controller, relatorio_controller,
                   simulacao_controller):
        app.register_blueprint(modulo.bp)

    return app
