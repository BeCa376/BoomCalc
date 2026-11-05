from werkzeug.security import generate_password_hash, check_password_hash
from project.model import db


class Usuario(db.Model):
    __tablename__ = "usuario"
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False)
    login = db.Column(db.String(60), unique=True, nullable=False)
    senha_hash = db.Column(db.String(255), nullable=False)
    papel = db.Column(db.Enum("operador", "administrador"), default="operador")
    criado_em = db.Column(db.TIMESTAMP, server_default=db.func.now())

    def definir_senha(self, senha):
        self.senha_hash = generate_password_hash(senha)

    def confere_senha(self, senha):
        try:
            return check_password_hash(self.senha_hash, senha)
        except (ValueError, TypeError):  # hash inválido/antigo no banco
            return False

    @property
    def is_admin(self):
        return self.papel == "administrador"

    def to_dict(self):
        return {"id": self.id, "nome": self.nome, "login": self.login, "papel": self.papel}


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
    criado_em = db.Column(db.TIMESTAMP, server_default=db.func.now())

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
            "peso_total_kg": float(self.peso_total_kg) if self.peso_total_kg else None,
            "observacoes": self.observacoes,
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

    def to_dict(self):
        return {
            "id": self.id,
            "guindaste_id": self.guindaste_id,
            "quadrante": self.quadrante,
            "comprimento_lanca_m": float(self.comprimento_lanca_m),
            "angulo_graus": float(self.angulo_graus) if self.angulo_graus is not None else None,
            "raio_m": float(self.raio_m) if self.raio_m is not None else None,
            "capacidade_kg": float(self.capacidade_kg),
        }


class Acessorio(db.Model):
    __tablename__ = "acessorio"
    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(80), nullable=False)
    massa_kg = db.Column(db.Numeric(10, 2), default=0)
    fator_reducao = db.Column(db.Numeric(4, 3), default=1.000)
    # False quando a massa já está considerada na tabela do fabricante
    # (ex.: moitão padrão) — aí o acessório não soma de novo na carga.
    soma_na_carga = db.Column(db.Boolean, default=True, nullable=False)
    observacoes = db.Column(db.Text, nullable=True)

    def to_dict(self):
        return {
            "id": self.id,
            "nome": self.nome,
            "massa_kg": float(self.massa_kg or 0),
            "fator_reducao": float(self.fator_reducao if self.fator_reducao is not None else 1),
            "soma_na_carga": bool(self.soma_na_carga),
            "observacoes": self.observacoes,
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
    usuario = db.relationship("Usuario")
    guindaste = db.relationship("Guindaste")
    carga = db.relationship("Carga")
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
    mensagem = db.Column(db.Text, nullable=True)  # várias regras podem falhar juntas


class Relatorio(db.Model):
    __tablename__ = "relatorio"
    id = db.Column(db.Integer, primary_key=True)
    simulacao_id = db.Column(db.Integer, db.ForeignKey("simulacao.id"), nullable=False)
    formato = db.Column(db.Enum("pdf", "csv"), default="pdf")
    caminho_arquivo = db.Column(db.String(255), nullable=True)
    gerado_em = db.Column(db.TIMESTAMP, server_default=db.func.now())


class ObjetoCena(db.Model):
    """Objeto que o operador coloca na cena 3D para o guindaste içar."""
    __tablename__ = "objeto_cena"
    id = db.Column(db.Integer, primary_key=True)
    usuario_id = db.Column(db.Integer, db.ForeignKey("usuario.id"), nullable=False)
    nome = db.Column(db.String(80), nullable=False)
    peso_kg = db.Column(db.Numeric(10, 2), nullable=False)
    comprimento_m = db.Column(db.Numeric(6, 2), nullable=False)
    largura_m = db.Column(db.Numeric(6, 2), nullable=False)
    altura_m = db.Column(db.Numeric(6, 2), nullable=False)
    pos_x_m = db.Column(db.Numeric(8, 2), nullable=False, default=0)
    pos_z_m = db.Column(db.Numeric(8, 2), nullable=False, default=0)
    rotacao_graus = db.Column(db.Numeric(6, 2), nullable=False, default=0)
    criado_em = db.Column(db.TIMESTAMP, server_default=db.func.now())

    CAMPOS = {  # nome no JSON -> coluna
        "nome": "nome", "peso": "peso_kg", "C": "comprimento_m", "L": "largura_m",
        "A": "altura_m", "x": "pos_x_m", "z": "pos_z_m", "rot": "rotacao_graus",
    }

    def to_dict(self):
        d = {"id": self.id}
        for chave, coluna in self.CAMPOS.items():
            v = getattr(self, coluna)
            d[chave] = v if chave == "nome" else float(v)
        return d

