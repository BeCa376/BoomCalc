# BoomCalc — Içamento Inteligente

Software de apoio a operadores de guindaste: simula uma operação de içamento
e indica, em tempo real, se ela é segura, com base nas tabelas de capacidade
oficiais de cada modelo cadastrado.

## Estrutura do projeto

```
BoomCalc/
├── config/
│   └── config.py             # configuração da app (conexão MySQL, limites RN08 etc.)
│       └── .env.exemple      # exemplo de como é experado o .env
├── database/
│   ├── schema.sql            # criação das tabelas (a partir do modelo ER)
│   └── seed.sql              # dados iniciais: TM130, MD300L, acessórios
├── project/
│   ├── __init__.py           # app factory Flask (create_app)
│   ├── controller/           # rotas HTTP (recebem request, chamam o model, devolvem JSON)
│   │   ├── guindastes_controller.py
│   │   ├── simulacao_controller.py
│   │   └── historico_controller.py
│   ├── model/                # entidades (SQLAlchemy) + regras de negócio RN01-RN08
│   │   ├── entities.py
│   │   └── regras_negocio.py
│   ├── functions/            # utilitários genéricos (sem regra de negócio)
│   │   └── utils.py          # interpolação, formatação, validação de campos
│   ├── html/                 # páginas adicionais (login, cadastro...) — a definir
│   ├── css/
│   │   └── style.css
│   └── js/
│       └── app.js            # lógica do desenho SVG interativo + chamadas à API
├── index.html                # tela principal (simulação) servida pelo Flask
├── app.py                    # ponto de entrada — roda o servidor
├── requirements.txt
├── .gitignore
├── README.md
└── seed.sql                  # Script de criação e inserção de dados no banco de dados
```

### Por que a lógica de cálculo (RN01–RN08) está em `model` e não em `functions`?

`project/functions` guarda utilitários genéricos que não sabem nada sobre
guindaste (interpolação linear, formatação de número, validação de campos
obrigatórios). `project/model/regras_negocio.py` é o lugar da lógica de
domínio — o que significa "operação segura", "quadrante frontal x lateral"
etc. Isso mantém os controllers finos: eles só recebem a requisição,
chamam o model e devolvem a resposta.

## Como executar:

### 1. MySQL (linha de comando)

```bash
mysql -u root -p < database/seed.sql
```

### 1.1 MySQL Workbench ou DBeaver

1. Crie uma conexão com o servidor MySQL.
2. Abra o arquivo `seed.sql`.
3. Execute o script completo.
4. O banco de dados `boomcalc` será criado automaticamente e populado com os dados iniciais.

### 2. Back-end

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
pip install -r requirements.txt
python app.py
```

Acesse `http://localhost:5000` — o Flask já serve o `index.html` da raiz.

## 3. Configuração do ambiente (.env)

O projeto utiliza variáveis de ambiente para armazenar configurações sensíveis, como credenciais do banco de dados e chave de criptografia.

Antes de executar a aplicação, crie um arquivo `.env` dentro da pasta `config/`, utilizando o arquivo `.env.exemple` como base:

```bash
cp config/.env.exemple config/.env
```

Ou crie manualmente o arquivo `config/.env` preenchendo os valores necessários.

## Estado atual do front-end

O `index.html` + `project/js/app.js` ainda têm os dados de capacidade
**embutidos no próprio JS** (herdados do protótipo). Trocar isso por
chamadas `fetch()` às rotas abaixo é o próximo passo:

- `GET /api/guindastes`
- `GET /api/guindastes/<id>/tabela-capacidade`
- `POST /api/simular`
- `POST /api/simular/alcance-maximo`
- `GET /api/historico/<usuario_id>`

## Pendências / a confirmar com a empresa

1. Limite de velocidade de vento (hoje é um valor fixo em `config.py`)
2. Fatores de redução por acessório (moitão, lingas etc.)
3. Condição de terreno (firme/mole) — ainda sem regra de cálculo definida
4. Tabela completa e validada do **MD 300L** (a atual em `seed.sql` é
   aproximada, extraída de PDF — TM 130 está com mais confiança)
5. Autenticação (Usuário/Operador/Administrador) e telas de cadastro
6. Geração de relatório (RF11)
