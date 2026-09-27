from project.model import db


class Usuario(db.Model):
    __tablename__ = "usuario"
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False)
    login = db.Column(db.String(60), unique=True, nullable=False)
    senha_hash = db.Column(db.String(255), nullable=False)
    papel = db.Column(db.Enum("operador", "administrador"), default="operador")
    criado_em = db.Column(db.TIMESTAMP, server_default=db.func.now())


class Guindaste(db.Model):
    __tablename__ = "guindaste"
    id = db.Column(db.Integer, primary_key=True)
    modelo = db.Column(db.String(80), nullable=False)
    fabricante = db.Column(db.String(80), nullable=False)
    capacidade_maxima_kg = db.Column(db.Numeric(10, 2), nullable=False)
    comprimento_lanca_min_m = db.Column(db.Numeric(6, 2), nullable=False)
    comprimento_lanca_max_m = db.Column(db.Numeric(6, 2), nullable=False)
    angulo_min_graus = db.Column(db.Numeric(5, 2), default=0)
    angulo_max_graus = db.Column(db.Numeric(5, 2), nullable=False)
    possui_jib = db.Column(db.Boolean, default=False)
    comprimento_jib_m = db.Column(db.Numeric(6, 2), nullable=True)
    peso_total_kg = db.Column(db.Numeric(10, 2), nullable=True)
    observacoes = db.Column(db.Text, nullable=True)

    tabela_capacidade = db.relationship("TabelaCapacidade", backref="guindaste", lazy=True)

    def to_dict(self):
        return {
            "id": self.id,
            "modelo": self.modelo,
            "fabricante": self.fabricante,
            "capacidade_maxima_kg": float(self.capacidade_maxima_kg),
            "comprimento_lanca_min_m": float(self.comprimento_lanca_min_m),
            "comprimento_lanca_max_m": float(self.comprimento_lanca_max_m),
            "angulo_min_graus": float(self.angulo_min_graus),
            "angulo_max_graus": float(self.angulo_max_graus),
            "possui_jib": self.possui_jib,
            "comprimento_jib_m": float(self.comprimento_jib_m) if self.comprimento_jib_m else None,
        }


class TabelaCapacidade(db.Model):
    __tablename__ = "tabela_capacidade"
    id = db.Column(db.Integer, primary_key=True)
    guindaste_id = db.Column(db.Integer, db.ForeignKey("guindaste.id"), nullable=False)
    quadrante = db.Column(db.Enum("frontal", "lateral_traseira"), nullable=False)
    comprimento_lanca_m = db.Column(db.Numeric(6, 2), nullable=False)
    angulo_graus = db.Column(db.Numeric(5, 2), nullable=True)
    raio_m = db.Column(db.Numeric(6, 2), nullable=True)
    capacidade_kg = db.Column(db.Numeric(10, 2), nullable=False)


class Acessorio(db.Model):
    __tablename__ = "acessorio"
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(80), nullable=False)
    massa_kg = db.Column(db.Numeric(10, 2), default=0)
    fator_reducao = db.Column(db.Numeric(4, 3), default=1.000)
    observacoes = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "nome": self.nome,
            "massa_kg": float(self.massa_kg),
            "fator_reducao": float(self.fator_reducao),
        }


class Carga(db.Model):
    __tablename__ = "carga"
    id = db.Column(db.Integer, primary_key=True)
    descricao = db.Column(db.String(150), nullable=True)
    peso_kg = db.Column(db.Numeric(10, 2), nullable=False)
    tipo = db.Column(db.String(60), nullable=True)
    comprimento_m = db.Column(db.Numeric(6, 2), nullable=True)
    largura_m = db.Column(db.Numeric(6, 2), nullable=True)
    altura_m = db.Column(db.Numeric(6, 2), nullable=True)


simulacao_acessorio = db.Table(
    "simulacao_acessorio",
    db.Column("simulacao_id", db.Integer, db.ForeignKey("simulacao.id"), primary_key=True),
    db.Column("acessorio_id", db.Integer, db.ForeignKey("acessorio.id"), primary_key=True),
)


class Simulacao(db.Model):
    __tablename__ = "simulacao"
    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey("usuario.id"), nullable=False)
    guindaste_id = db.Column(db.Integer, db.ForeignKey("guindaste.id"), nullable=False)
    carga_id = db.Column(db.Integer, db.ForeignKey("carga.id"), nullable=False)
    comprimento_lanca_m = db.Column(db.Numeric(6, 2), nullable=False)
    angulo_graus = db.Column(db.Numeric(5, 2), nullable=False)
    raio_operacao_m = db.Column(db.Numeric(6, 2), nullable=False)
    quadrante = db.Column(db.Enum("frontal", "lateral_traseira"), nullable=False)
    usa_jib = db.Column(db.Boolean, default=False)
    massa_lingada_kg = db.Column(db.Numeric(10, 2), default=0)
    massa_cabo_kg = db.Column(db.Numeric(10, 2), default=0)
    usa_balancim = db.Column(db.Boolean, default=False)
    massa_balancim_kg = db.Column(db.Numeric(10, 2), default=0)
    velocidade_vento_ms = db.Column(db.Numeric(5, 2), nullable=True)
    condicao_terreno = db.Column(
        db.Enum("firme", "mole", "nao_informado"), default="nao_informado"
    )
    data_simulacao = db.Column(db.TIMESTAMP, server_default=db.func.now())

    acessorios = db.relationship("Acessorio", secondary=simulacao_acessorio, lazy="subquery")
    resultado = db.relationship("Resultado", backref="simulacao", uselist=False)


class Resultado(db.Model):
    __tablename__ = "resultado"
    id = db.Column(db.Integer, primary_key=True)
    simulacao_id = db.Column(db.Integer, db.ForeignKey("simulacao.id"), unique=True, nullable=False)
    capacidade_disponivel_kg = db.Column(db.Numeric(10, 2), nullable=False)
    carga_total_kg = db.Column(db.Numeric(10, 2), nullable=False)
    percentual_utilizado = db.Column(db.Numeric(6, 2), nullable=False)
    status = db.Column(db.Enum("seguro", "proximo_limite", "inseguro"), nullable=False)
    alerta_vento = db.Column(db.Boolean, default=False)
    mensagem = db.Column(db.String(255), nullable=True)


class Relatorio(db.Model):
    __tablename__ = "relatorio"
    id = db.Column(db.Integer, primary_key=True)
    simulacao_id = db.Column(db.Integer, db.ForeignKey("simulacao.id"), nullable=False)
    formato = db.Column(db.Enum("pdf", "csv"), default="pdf")
    caminho_arquivo = db.Column(db.String(255), nullable=True)
    gerado_em = db.Column(db.TIMESTAMP, server_default=db.func.now())
