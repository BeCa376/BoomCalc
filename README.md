# BoomCalc — Içamento Inteligente

Software de apoio a operadores de guindaste: simula uma operação de içamento
e indica, em tempo real, se ela é segura, com base nas tabelas de capacidade
oficiais de cada modelo cadastrado.

## Estrutura do projeto

```
BoomCalc/
├── config/
│   ├── config.py             # configuração da app (conexão MySQL, limites RN08 etc.)
│   ├── env.py                # lê config/.env
│   └── .env.exemple          # exemplo de como é esperado o .env
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
│       └── app.js            # desenho 2D (SVG), 3D (Three.js), objetos, radar e chamadas à API
├── index.html                # tela principal (simulação) servida pelo Flask
├── app.py                    # ponto de entrada — roda o servidor
├── requirements.txt
├── .gitignore
├── README.md
└── seed.sql                  # criação das tabelas + dados iniciais (TM 130, MD 300L, acessórios)
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
mysql -u root -p < seed.sql
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
A tela de cadastros fica em `http://localhost:5000/admin`.

> **Banco já criado numa versão anterior?** O `seed.sql` mudou (tabela
> `objeto_cena`, coluna `acessorio.soma_na_carga`, `resultado.mensagem` como
> TEXT e senhas com hash). Rode o script de novo num banco limpo
> (`DROP DATABASE boomcalc;` antes) — ele recria tudo.

### Usuários de teste

O `seed.sql` cria dois usuários com senhas **de teste** (estão no comentário
acima do `INSERT INTO usuario`):

| Login | Papel | O que pode |
|---|---|---|
| `admin` | administrador | tudo + cadastros em `/admin` |
| `operador` | operador | simular, salvar, histórico, objetos e relatórios |

Troque as senhas em produção pela própria tela `/admin`.

### Testes automatizados

```bash
pip install pytest
python -m pytest tests
```

Os testes sobem o app com SQLite em memória, carregam os dados do
`seed.sql` e cobrem as regras (RN01–RN08), login e permissões, cadastros,
objetos e relatórios. Também conferem se as colunas do `seed.sql` batem com
as entidades — o que pega divergência entre o script MySQL e o código.

## 3. Configuração do ambiente (.env)

O projeto utiliza variáveis de ambiente para armazenar configurações sensíveis, como credenciais do banco de dados e chave de criptografia.

Antes de executar a aplicação, crie um arquivo `.env` dentro da pasta `config/`, utilizando o arquivo `.env.exemple` como base:

```bash
cp config/.env.exemple config/.env
```

Ou crie manualmente o arquivo `config/.env` preenchendo os valores necessários.

## O que a tela faz

- **Simulação 2D e 3D**, com sliders de ângulo, comprimento da lança e giro
  (de -180° a 180°), e arraste da ponta da lança no desenho.
- **JIB** (MD 300L): lances de 9, 15 ou 20 m, travado por pino nos furos de
  10°, 25° ou 40° **abaixo** da lança. Com o JIB, a lança não desce abaixo do
  ângulo do furo.
- **Carga**: peso, lingada, cabo, balancim e vento. Bloqueia peso acima da
  capacidade nominal do guindaste.
- **Dimensões e pontos de pega**: comprimento, largura e altura da carga,
  1, 2 ou 4 pernas de linga, distância entre pegas e comprimento da linga.
  Calcula o ângulo da linga, a tração por perna e se a carga sai do solo.
- **Objetos na cena (3D)**: adicione, edite, arraste e use **Içar** para o
  guindaste ir até o objeto e carregá-lo, e **Soltar aqui** para deixá-lo sob
  o gancho.
- **Radar**: visão de cima com alcance, setor frontal, zonas de capacidade
  da configuração atual, lança e objetos. Clique num objeto para selecionar
  ou num espaço vazio para mover o objeto selecionado.
- **Acessórios** (moitão, linga etc., vindos do banco): somam massa na carga
  quando não estão já inclusos na tabela e reduzem a capacidade pelo fator
  de redução cadastrado.
- **Condição do terreno** (firme / mole / não informado): fica salva na
  simulação e, se mole, a tela avisa para apoiar as patolas em pranchões.
- **Login** (canto superior direito): salvar simulações, histórico, objetos
  salvos no banco e relatórios exigem login; simular, não.
- **Histórico** com **relatório em PDF ou CSV** de cada simulação salva (RF11).
- **Alcance máximo** e **Ficha técnica**.

### Cadastros (`/admin`, só administrador)

- **Usuários**: criar, editar (nome, login, senha, papel) e remover.
- **Acessórios**: massa, fator de redução e se soma na carga.
- **Guindastes**: capacidade nominal, limites de lança e ângulo, JIB.
- **Tabela de capacidade**: adicionar e remover pontos por quadrante e
  comprimento de lança. É aqui que a empresa lança os valores **oficiais**
  do catálogo (ex.: a área lateral/traseira do MD 300L, que ainda falta).

### Integração com a API

Servida pelo `app.py`, a página usa:

- `GET /api/guindastes`: limites e capacidade nominal de cada modelo
- `POST /api/simular`: validação no servidor a cada mudança (RN01–RN08) e
  botão "Salvar simulação" (`salvar: true`)
- `POST /api/simular/alcance-maximo`
- `GET /api/historico`: aba Histórico (do usuário logado)
- `GET /api/simulacoes/<id>/relatorio?formato=pdf|csv`: relatório (RF11)
- `GET /api/acessorios`, `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me`
- `GET|POST /api/objetos`, `PUT|DELETE /api/objetos/<id>`: objetos da cena
- `/api/admin/...`: cadastros (usuários, acessórios, guindastes, tabela)

Abrindo o `index.html` direto, sem servidor, tudo funciona só com o cálculo
local e a tela avisa que está offline.

> O cálculo **local** da tela (desenho, radar, cores dos objetos) usa as
> curvas embutidas no `app.js`; a validação **oficial** é a do servidor, que
> usa a tabela do banco e aparece abaixo do resultado. Se a empresa cadastrar
> pontos novos em `/admin`, o servidor passa a usá-los na hora.

## Pendências / a confirmar com a empresa

1. Limite de velocidade de vento (hoje 12,5 m/s em `config.py`, ajustável pela
   variável `LIMITE_VENTO_MS`)
2. Valores dos fatores de redução por acessório — o cálculo já aplica o que
   for cadastrado em `/admin`; hoje todos estão em 1,000 (sem redução)
3. Condição de terreno (firme/mole) — já é registrada e gera aviso, mas
   ainda não há regra de redução de capacidade definida
4. Tabela completa e validada do **MD 300L** (a atual em `seed.sql` é
   aproximada, extraída de PDF — TM 130 está com mais confiança). Faltam,
   em especial, os pontos da área **lateral/traseira** do MD 300L: sem
   eles a API recusa a operação nessa área (RN05)
5. Tabela de capacidade **com JIB** (hoje a capacidade com JIB é estimada
   pela tabela da lança principal no raio da ponta do JIB)
6. TM 130: a tabela do seed só tem a lança de 12,4 m; a capacidade ainda
   não varia com o comprimento da lança

Os itens 4 a 6 dependem da tabela de carga **oficial** do fabricante (não há
catálogo público do MD 300L nem do TM 130). Quando a empresa enviar, basta
lançar os pontos em `/admin` → Tabela de capacidade.
