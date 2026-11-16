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

> **Banco já criado numa versão anterior?** O `seed.sql` mudou várias vezes (tabela `objeto_cena`,
> `acessorio.soma_na_carga`, `resultado.mensagem` como TEXT, senhas com hash e, por último, as colunas de
> geometria e setores de `guindaste`: `altura_pe_lanca_m`, `recuo_pe_lanca_m`, `setor_frontal_graus` e
> `giro_max_graus`). Rode o script de novo num banco limpo (`DROP DATABASE boomcalc;` antes) — ele recria
> tudo. Sem as colunas novas o servidor não sobe (a mais recente é `simulacao.estado_json`: `ALTER TABLE simulacao ADD COLUMN estado_json TEXT NULL AFTER condicao_terreno;`). Os valores da geometria também podem ser editados em `/admin`.

### Usuários de teste (só com `AUTENTICACAO_ATIVA=1`)

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
  o gancho. Cada objeto é **personalizável**: nome, **forma** (caixa, cilindro
  em pé ou tubo deitado), **cor**, peso, dimensões, posição e **pontos de
  pega** (1, 2 ou 4, distância entre pegas e linga). O editor mostra o volume,
  o ângulo da linga e a tração por perna; no 3D aparecem os pontos de pega e
  um contorno no chão com a cor do estado (verde/amarelo/vermelho/cinza).
  A cena **começa sempre vazia** e os objetos existem só na página aberta (nada é gravado no banco).
  Para voltar a salvá-los por usuário, ligue `PERSISTIR_OBJETOS = true` no início do `app.js`.
- **Relatório da simulação** (PDF ou CSV, sem login; é o botão ao lado de "Adicionar objeto"): todos os objetos com forma,
  tamanho, volume, peso, posição, configuração da lança, capacidade, uso e
  status (recalculados no servidor com a tabela do banco), pontos de pega e
  tração por perna, mais as imagens do **radar** (com os nomes) e da **vista
  3D**, e uma página com as **dimensões do guindaste** (comprimento, largura,
  altura, abertura das patolas, lança, JIB, alcance e altura máximos), a
  configuração usada e a **vista lateral em escala**.
- **Radar (no 3D)**: desenhado no chão da cena 3D, em volta do guindaste: zonas de
  capacidade da configuração atual (verde até 80%, amarelo até 100%, vermelho acima ou
  sem capacidade tabelada), anéis de distância e setor frontal (±16°). O 2D é só a vista
  lateral do guindaste, para comparação. O relatório da simulação usa a mesma vista em planta.
- **Acessórios** (moitão, linga etc., vindos do banco): somam massa na carga
  quando não estão já inclusos na tabela e reduzem a capacidade pelo fator
  de redução cadastrado.
- **Condição do terreno** (firme / mole / não informado): fica salva na
  simulação e, se mole, a tela avisa para apoiar as patolas em pranchões.
- **Login (trabalho futuro)**: desligado no protótipo — não há tela de login e salvar, histórico,
  objetos, relatórios e `/admin` funcionam com um usuário padrão (o primeiro administrador).
  O código de login e permissões já existe e é testado; para ligá-lo, defina
  `AUTENTICACAO_ATIVA=1` em `config/.env`.
- **Histórico** com, para cada simulação salva: o número da coluna **Simulação**, clicável (reabre a simulação do jeito que foi salva: modelo, lança,
  ângulo, giro, cargas, acessórios, JIB, itens da lingada e pegas — o link é `./?simulacao=<id>`), **PDF** e **CSV**
  (RF11) e a **lixeira** (apaga a simulação, o resultado e os relatórios gerados dela, inclusive os arquivos).
  Simulações salvas numa versão antiga, sem essa "foto" da tela, abrem de forma aproximada (o giro não foi guardado).
- **Alcance máximo** e **Ficha técnica**.

## Instalador para Windows (para o professor testar)

O BoomCalc também roda como programa comum, **sem MySQL**: o computador de quem testa guarda tudo num arquivo
SQLite (`boomcalc.db`), criado sozinho na primeira vez com os mesmos dados do `seed.sql`. O servidor só escuta em
`127.0.0.1` (este computador), então nada fica visível na rede ou na internet, e não há tela de login.

- **Instalar:** duplo clique em `BoomCalc-Setup.exe` (instala só para o usuário, não pede administrador).
  Cria o atalho no Menu Iniciar (e, se marcado, na área de trabalho). Abre uma janela preta que é o programa
  rodando; o navegador abre sozinho. Para encerrar, feche a janela.
- **Dados:** `%LOCALAPPDATA%\BoomCalc` (banco, relatórios e log). Continuam ao reiniciar.
- **Desinstalar:** *Configurações > Aplicativos* ou Menu Iniciar > *Desinstalar o BoomCalc*. O desinstalador fecha o
  programa se estiver aberto, remove tudo e **pergunta** se também apaga as simulações salvas.
- **Aviso do Windows:** como o programa não tem assinatura paga, o SmartScreen pode avisar na 1ª vez:
  "Mais informações" > "Executar assim mesmo". Há um guia curto em `empacotar/LEIA-ME-professor.txt`.

**Como gerar o `BoomCalc-Setup.exe`** (o `.exe` só pode ser feito no Windows):

1. *Pelo GitHub, sem Windows:* aba **Actions** > **Instalador do Windows** > **Run workflow**. Ele gera o instalador e
   **testa num Windows de verdade** (abre o programa, salva uma simulação, gera PDF, instala, abre e desinstala).
   Baixe o arquivo em *Artifacts*.
2. *Num PC com Windows:* instale Python 3.12 e Inno Setup 6 e dê duplo clique em `empacotar\gerar_windows.bat`.
   O resultado fica em `empacotar\saida\BoomCalc-Setup.exe`.

Antes de gerar, `empacotar/verificar_antes_de_empacotar.py` confere que **não há senha de banco escrita no código**
(`config/env.py` com padrão `""`; a senha real vai só em `config/.env`), porque o código vai dentro do executável.
O `launcher.py` é o ponto de entrada (opções `--no-browser`, `--port` e `--datadir`, para testes). Se uma versão
futura acrescentar colunas, o arquivo SQLite que o professor já tiver não é migrado: ele deve desinstalar apagando os dados.

### Geometria, setores e giro (dados da empresa)

Valores da planilha "Informações gerais - içamento", guardados no banco (`guindaste`) e usados pela tela e
pelo servidor:

| | TM 130 | MD 300L |
|---|---|---|
| Altura do pé da lança | 2,8 m | 3,0 m |
| Recuo do pé da lança (atrás do eixo de giro) | 0 | 1,4 m |
| Setor frontal | Zona 1 = 32° (±16°) | Figura A = 110° (±55°) |
| Lateral/traseira | resto, até o giro máximo | Figura B = 250° (resto) |
| Giro máximo p/ cada lado | ±60° (120° no total) | livre (±180°) |

O **raio é medido a partir do eixo de giro**: `raio = recuo·(−1) + lança·cos(ângulo) [+ JIB·cos(ângulo do JIB)]`.
Conferido com o exemplo da figura da empresa (MD 300L, lança 32,1 m a 53°, JIB 9 m a 10°): raio 24,5 m
(figura: 25,0 m) e altura 34,8 m (figura: 34,7 m). Giro além do máximo do modelo é recusado (RN06).

### Itens da lingada (manilhas, cintas e outros)

Painel "Itens da lingada" na tela de simulação. Escolha **Manilha** (16 tamanhos), **Cinta plana** (11) ou
**Cinta tubular** (18) do catálogo da empresa, ou **Personalizado** (nome e massa). A massa dos itens é
**somada à massa da lingada**. Para as cintas, `massa = peso do 1º metro + comprimento × peso do metro adicional`
(a mesma fórmula da planilha). O catálogo está em `project/data/catalogo_lingada.json` e é servido por
`GET /api/catalogo/lingada`. Os itens existem só na página aberta.

### Cadastros (`/admin`, só administrador)

- **Usuários**: criar, editar (nome, login, senha, papel) e remover.
- **Acessórios**: massa, fator de redução e se soma na carga.
- **Guindastes**: capacidade nominal, limites de lança e ângulo, JIB e
  dimensões do equipamento (comprimento, largura, altura e abertura das
  patolas), que aparecem no relatório da simulação.
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
- `GET /api/simulacoes/<id>`: dados da simulação + `estado` (foto da tela) para reabri-la; `DELETE` na mesma rota exclui
- `POST /api/cena/relatorio`: relatório da simulação (objetos, radar, 3D e guindaste; não exige login)
- `GET /api/acessorios`, `POST /api/auth/login`, `POST /api/auth/logout`,
  `GET /api/auth/me`
- `GET /api/catalogo/lingada`: manilhas e cintas (massas) da planilha da empresa
- `GET|POST /api/objetos`, `PUT|DELETE /api/objetos/<id>`: objetos da cena (a tela não os usa enquanto `PERSISTIR_OBJETOS = false` no `app.js`; ver abaixo)
- `/api/admin/...`: cadastros (usuários, acessórios, guindastes, tabela)

Abrindo o `index.html` direto, sem servidor, tudo funciona só com o cálculo
local e a tela avisa que está offline.

> O cálculo **local** da tela (resposta imediata, radar, cores dos objetos) usa a **mesma tabela do
> banco e a mesma regra** do servidor (comprimento de lança tabelado imediatamente superior,
> interpolação, sem extrapolar o raio). A validação **oficial**, que também é a única registrada, é a do
> servidor e aparece abaixo do resultado. As curvas embutidas no `app.js` só valem com o servidor offline.
> Se a empresa cadastrar pontos novos em `/admin`, o servidor passa a usá-los na hora e a tela, ao recarregar a página.

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
7. Dimensões dos guindastes (comprimento, largura, altura e abertura das
   patolas): os campos existem, mas estão vazios no seed — o relatório da
   cena mostra "não cadastrado" até alguém preencher em `/admin` → Guindastes

Os itens 4 a 7 dependem da ficha e da tabela de carga **oficiais** do fabricante (não há
catálogo público do MD 300L nem do TM 130). Quando a empresa enviar, basta
lançar os pontos em `/admin` → Tabela de capacidade.