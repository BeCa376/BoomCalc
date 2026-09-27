from flask import Flask, send_from_directory
from flask_cors import CORS

from config.config import Config
from project.model import db
from project.controller import guindastes_controller, simulacao_controller, historico_controller


def create_app():
    app = Flask(
        __name__,
        static_folder="css",          # veja nota no README sobre servir css/js
        template_folder="html",
    )
    app.config.from_object(Config)

    db.init_app(app)
    CORS(app)  # útil em dev; restrinja a origem em produção

    app.register_blueprint(guindastes_controller.bp)
    app.register_blueprint(simulacao_controller.bp)
    app.register_blueprint(historico_controller.bp)

    return app
