import re

from conftest import SEED, logar

MD = dict(guindaste_id=2, comprimento_lanca_m=10.5, angulo_graus=60, raio_operacao_m=4)


def simular(client, **campos):
    return client.post("/api/simular", json={**MD, "peso_carga_kg": 5000, **campos})


# ------------------------------------------------------------------ schema
def test_colunas_do_seed_batem_com_as_entidades(app):
    """Sem MySQL nos testes: garante que o seed.sql e as entidades têm as mesmas colunas."""
    from project.model import db
    sql = open(SEED, encoding="utf8").read()
    tabelas_seed = {}
    for nome, corpo in re.findall(r"CREATE TABLE (\w+) \((.*?)\) ENGINE", sql, re.S):
        cols = set()
        for linha in corpo.splitlines():
            m = re.match(r"\s*([a-z_]+)\s+(INT|VARCHAR|DECIMAL|TEXT|ENUM|BOOLEAN|TIMESTAMP)", linha)
            if m:
                cols.add(m.group(1))
        tabelas_seed[nome] = cols
    for tabela in db.metadata.sorted_tables:
        assert tabela.name in tabelas_seed, f"{tabela.name} não existe no seed.sql"
        assert {c.name for c in tabela.columns} == tabelas_seed[tabela.name], tabela.name


# ------------------------------------------------------------------ regras
def test_simulacao_segura(client):
    j = simular(client).get_json()
    assert j["status"] == "seguro" and j["capacidade_disponivel_kg"] == 22900


def test_sem_tabela_no_quadrante_e_inseguro(client):
    j = simular(client, angulo_giro_graus=90).get_json()
    assert j["status"] == "inseguro" and "RN05" in j["mensagem"]


def test_giro_negativo_tambem_e_frontal(client):
    assert simular(client, angulo_giro_graus=-10).get_json()["quadrante"] == "frontal"


def test_carga_acima_da_nominal(client):
    j = simular(client, peso_carga_kg=250000).get_json()
    assert j["status"] == "inseguro" and "capacidade nominal" in j["mensagem"]


def test_raio_alem_da_tabela_nao_extrapola(client):
    j = simular(client, comprimento_lanca_m=12, raio_operacao_m=7.5).get_json()
    assert j["status"] == "inseguro" and j["capacidade_disponivel_kg"] == 0


def test_lanca_arredonda_para_cima(client):
    # 12 m usa a tabela de 14,1 m (14500 em 6 m, 11500 em 7 m)
    j = simular(client, comprimento_lanca_m=12, raio_operacao_m=6.5).get_json()
    assert j["capacidade_disponivel_kg"] == 13000


def test_limites_do_guindaste(client):
    assert simular(client, comprimento_lanca_m=40).status_code == 400
    assert simular(client, angulo_graus=85).status_code == 400


def test_vento_acima_do_limite(client):
    j = simular(client, velocidade_vento_ms=15).get_json()
    assert j["status"] == "inseguro" and j["alerta_vento"]


def test_acessorios_somam_massa_so_quando_devem(client):
    # 3 = Balancim (0 kg), 4 = Linga têxtil (15 kg, soma); 1 = Moitão (já incluso)
    j = simular(client, acessorio_ids=[1, 4]).get_json()
    assert j["massa_acessorios_kg"] == 15 and j["carga_total_kg"] == 5015


def test_fator_de_reducao(client, admin):
    r = client.post("/api/admin/acessorios", json={"nome": "Teste", "massa_kg": 0, "fator_reducao": 0.9})
    aid = r.get_json()["id"]
    j = simular(client, acessorio_ids=[aid]).get_json()
    assert j["capacidade_disponivel_kg"] == 22900 * 0.9 and j["fator_acessorios"] == 0.9


def test_terreno_mole_gera_aviso(client):
    j = simular(client, condicao_terreno="mole").get_json()
    assert any("Terreno mole" in a for a in j["avisos"])
    assert simular(client, condicao_terreno="lama").status_code == 400


# ------------------------------------------------------------------ login e permissões
def test_login_errado(client):
    assert client.post("/api/auth/login", json={"login": "admin", "senha": "x"}).status_code == 401


def test_me_e_logout(client, operador):
    assert client.get("/api/auth/me").get_json()["login"] == "operador"
    client.post("/api/auth/logout")
    assert client.get("/api/auth/me").get_json() is None


def test_salvar_exige_login(client):
    assert simular(client, salvar=True).status_code == 401


def test_salvar_e_historico(client, operador):
    j = simular(client, salvar=True, condicao_terreno="firme", acessorio_ids=[4]).get_json()
    hist = client.get("/api/historico").get_json()
    assert hist[0]["id"] == j["simulacao_id"] and hist[0]["condicao_terreno"] == "firme"


def test_historico_de_outro_usuario(client, operador):
    assert client.get("/api/historico/1").status_code == 403


def test_operador_nao_acessa_cadastros(client, operador):
    assert client.get("/api/admin/usuarios").status_code == 403
    assert client.post("/api/admin/acessorios", json={"nome": "x"}).status_code == 403


def test_admin_cria_usuario_que_consegue_logar(client, admin):
    r = client.post("/api/admin/usuarios", json={"nome": "Novo", "login": "novo", "senha": "senha123", "papel": "operador"})
    assert r.status_code == 201
    assert client.post("/api/admin/usuarios", json={"nome": "Dup", "login": "novo", "senha": "senha123"}).status_code == 400
    client.post("/api/auth/logout")
    assert logar(client, "novo", "senha123")["papel"] == "operador"


def test_admin_nao_remove_a_si_mesmo(client, admin):
    assert client.delete(f"/api/admin/usuarios/{admin['id']}").status_code == 400


# ------------------------------------------------------------------ tabela de capacidade
def test_admin_cadastra_ponto_lateral_e_api_passa_a_usar(client, admin):
    for raio, cap in [(3.0, 20000), (6.0, 12000)]:
        r = client.post("/api/admin/guindastes/2/tabela", json={
            "quadrante": "lateral_traseira", "comprimento_lanca_m": 10.5, "raio_m": raio, "capacidade_kg": cap})
        assert r.status_code == 201
    j = simular(client, angulo_giro_graus=90, raio_operacao_m=4.5).get_json()
    assert j["capacidade_disponivel_kg"] == 16000 and j["status"] == "seguro"


def test_tabela_nao_mistura_angulo_e_raio(client, admin):
    r = client.post("/api/admin/guindastes/2/tabela", json={
        "quadrante": "frontal", "comprimento_lanca_m": 10.5, "angulo_graus": 30, "capacidade_kg": 1000})
    assert r.status_code == 400


def test_admin_edita_guindaste(client, admin):
    g = client.get("/api/guindastes/1").get_json()
    g["capacidade_maxima_kg"] = 25000
    assert client.put("/api/admin/guindastes/1", json=g).get_json()["capacidade_maxima_kg"] == 25000
    g["comprimento_lanca_min_m"] = 99
    assert client.put("/api/admin/guindastes/1", json=g).status_code == 400


# ------------------------------------------------------------------ objetos da cena
def test_objetos_crud_e_dono(client, operador):
    assert client.get("/api/objetos").get_json() == []
    o = client.post("/api/objetos", json={"nome": "Caixa", "peso": 900, "C": 2, "L": 1, "A": 1, "x": 5, "z": 2}).get_json()
    o2 = client.put(f"/api/objetos/{o['id']}", json={"x": 7.5, "peso": 950}).get_json()
    assert o2["x"] == 7.5 and o2["peso"] == 950
    assert client.post("/api/objetos", json={"nome": "Ruim", "peso": 1, "C": 0, "L": 1, "A": 1}).status_code == 400
    client.post("/api/auth/logout")
    logar(client, "admin", "admin123")
    assert client.get("/api/objetos").get_json() == []          # cada um vê os seus
    assert client.delete(f"/api/objetos/{o['id']}").status_code == 403
    client.post("/api/auth/logout")
    logar(client, "operador", "operador123")
    assert client.delete(f"/api/objetos/{o['id']}").status_code == 200


def test_objetos_exigem_login(client):
    assert client.get("/api/objetos").status_code == 401


# ------------------------------------------------------------------ relatório
def test_relatorio_pdf_e_csv(client, operador, app):
    sid = simular(client, salvar=True, comprimento_carga_m=4, largura_carga_m=2, altura_carga_m=1.5,
                  peso_carga_kg=250000).get_json()["simulacao_id"]
    pdf = client.get(f"/api/simulacoes/{sid}/relatorio?formato=pdf")
    assert pdf.status_code == 200 and pdf.data[:4] == b"%PDF"
    csv = client.get(f"/api/simulacoes/{sid}/relatorio?formato=csv")
    texto = csv.data.decode("utf-8-sig")
    assert "INSEGURO" in texto and "Operador Teste" in texto and "4,00 m x 2,00 m x 1,50 m" in texto
    from project.model.entities import Relatorio
    with app.app_context():
        assert Relatorio.query.filter_by(simulacao_id=sid).count() == 2


def test_relatorio_de_outro_usuario(client, operador):
    sid = simular(client, salvar=True).get_json()["simulacao_id"]
    client.post("/api/auth/logout")
    client.post("/api/admin/usuarios")  # sem login -> 401, só para garantir que saiu
    logar(client, "admin", "admin123")
    assert client.get(f"/api/simulacoes/{sid}/relatorio").status_code == 200  # admin pode
    client.post("/api/admin/usuarios", json={"nome": "Outro", "login": "outro", "senha": "senha123"})
    client.post("/api/auth/logout")
    logar(client, "outro", "senha123")
    assert client.get(f"/api/simulacoes/{sid}/relatorio").status_code == 403
