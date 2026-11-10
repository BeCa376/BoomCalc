-- ---------------------------------------------------------------------
-- Database
-- ---------------------------------------------------------------------
CREATE DATABASE IF NOT EXISTS boomcalc;

USE boomcalc;
-- ---------------------------------------------------------------------
-- Usuário (Operador / Administrador)
-- ---------------------------------------------------------------------
CREATE TABLE usuario (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  nome          VARCHAR(120) NOT NULL,
  login         VARCHAR(60)  NOT NULL UNIQUE,
  senha_hash    VARCHAR(255) NOT NULL,
  papel         ENUM('operador','administrador') NOT NULL DEFAULT 'operador',
  criado_em     TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Guindaste (modelo cadastrado)
-- ---------------------------------------------------------------------
CREATE TABLE guindaste (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  modelo              VARCHAR(80)  NOT NULL,          -- ex: MD 300L, TM 130
  fabricante          VARCHAR(80)  NOT NULL,
  capacidade_maxima_kg DECIMAL(10,2) NOT NULL,
  comprimento_lanca_min_m DECIMAL(6,2) NOT NULL,
  comprimento_lanca_max_m DECIMAL(6,2) NOT NULL,
  angulo_min_graus    DECIMAL(5,2) NOT NULL DEFAULT 0,
  angulo_max_graus    DECIMAL(5,2) NOT NULL,
  possui_jib          BOOLEAN NOT NULL DEFAULT FALSE,
  comprimento_jib_m   DECIMAL(6,2) NULL,
  peso_total_kg       DECIMAL(10,2) NULL,
  comprimento_m       DECIMAL(6,2) NULL,              -- dimensões em posição de transporte
  largura_m           DECIMAL(6,2) NULL,
  altura_m            DECIMAL(6,2) NULL,
  abertura_patolas_m  DECIMAL(6,2) NULL,              -- distância entre patolas abertas
  observacoes         TEXT NULL,
  criado_em           TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Tabela de Capacidade (RN05, RN06) — curva raio/ângulo x capacidade
-- Cada linha é um "ponto" da tabela oficial do fabricante.
-- quadrante: distingue área frontal x lateral/traseira (RF/observações
-- da planilha "Quadrante de operação")
-- ---------------------------------------------------------------------
CREATE TABLE tabela_capacidade (
  id                INT AUTO_INCREMENT PRIMARY KEY,
  guindaste_id      INT NOT NULL,
  quadrante         ENUM('frontal','lateral_traseira') NOT NULL,
  comprimento_lanca_m DECIMAL(6,2) NOT NULL,
  angulo_graus      DECIMAL(5,2) NULL,        -- usado quando a tabela é por ângulo (ex: TM130)
  raio_m            DECIMAL(6,2) NULL,        -- usado quando a tabela é por raio (ex: MD300L)
  capacidade_kg     DECIMAL(10,2) NOT NULL,   -- já com a redução de 85% aplicada, conforme catálogo
  FOREIGN KEY (guindaste_id) REFERENCES guindaste(id) ON DELETE CASCADE,
  INDEX idx_guindaste_quad (guindaste_id, quadrante)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Acessório (RN07) — moitão, jib, lingas etc.
-- fator_reducao: multiplicador aplicado sobre a capacidade da tabela
-- (ex.: 0.95 = reduz 5%). Usar 1.0 quando o acessório só soma massa.
-- ---------------------------------------------------------------------
CREATE TABLE acessorio (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  nome            VARCHAR(80) NOT NULL,        -- ex: Moitão, Balancim, Linga
  massa_kg        DECIMAL(10,2) NOT NULL DEFAULT 0,
  fator_reducao   DECIMAL(4,3) NOT NULL DEFAULT 1.000,
  soma_na_carga   BOOLEAN NOT NULL DEFAULT TRUE, -- FALSE = massa já inclusa na tabela do fabricante
  observacoes     TEXT NULL
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Carga (peso, tipo, dimensões do objeto a ser içado)
-- ---------------------------------------------------------------------
CREATE TABLE carga (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  descricao   VARCHAR(150) NULL,
  peso_kg     DECIMAL(10,2) NOT NULL,          -- RN01: deve ser > 0
  tipo        VARCHAR(60) NULL,
  comprimento_m DECIMAL(6,2) NULL,
  largura_m   DECIMAL(6,2) NULL,
  altura_m    DECIMAL(6,2) NULL,
  CONSTRAINT chk_peso_positivo CHECK (peso_kg > 0)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Simulação (RF01-RF09) — registro de uma operação simulada
-- ---------------------------------------------------------------------
CREATE TABLE simulacao (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id          INT NOT NULL,
  guindaste_id        INT NOT NULL,
  carga_id            INT NOT NULL,
  comprimento_lanca_m DECIMAL(6,2) NOT NULL,
  angulo_graus        DECIMAL(5,2) NOT NULL,
  raio_operacao_m     DECIMAL(6,2) NOT NULL,   -- RN02: deve ser > 0
  quadrante           ENUM('frontal','lateral_traseira') NOT NULL,
  usa_jib             BOOLEAN NOT NULL DEFAULT FALSE,
  massa_lingada_kg    DECIMAL(10,2) NOT NULL DEFAULT 0,
  massa_cabo_kg       DECIMAL(10,2) NOT NULL DEFAULT 0,
  usa_balancim        BOOLEAN NOT NULL DEFAULT FALSE,
  massa_balancim_kg   DECIMAL(10,2) NOT NULL DEFAULT 0,
  velocidade_vento_ms DECIMAL(5,2) NULL,
  condicao_terreno    ENUM('firme','mole','nao_informado') NOT NULL DEFAULT 'nao_informado',
  data_simulacao      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT chk_raio_positivo CHECK (raio_operacao_m > 0),
  FOREIGN KEY (usuario_id) REFERENCES usuario(id),
  FOREIGN KEY (guindaste_id) REFERENCES guindaste(id),
  FOREIGN KEY (carga_id) REFERENCES carga(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Simulação_Acessório (N:M entre Simulação e Acessório) — RN07
-- ---------------------------------------------------------------------
CREATE TABLE simulacao_acessorio (
  simulacao_id  INT NOT NULL,
  acessorio_id  INT NOT NULL,
  PRIMARY KEY (simulacao_id, acessorio_id),
  FOREIGN KEY (simulacao_id) REFERENCES simulacao(id) ON DELETE CASCADE,
  FOREIGN KEY (acessorio_id) REFERENCES acessorio(id)
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Resultado (1:1 com Simulação) — RN04, RN08
-- ---------------------------------------------------------------------
CREATE TABLE resultado (
  id                    INT AUTO_INCREMENT PRIMARY KEY,
  simulacao_id          INT NOT NULL UNIQUE,
  capacidade_disponivel_kg DECIMAL(10,2) NOT NULL,
  carga_total_kg        DECIMAL(10,2) NOT NULL,
  percentual_utilizado   DECIMAL(6,2) NOT NULL,
  status                ENUM('seguro','proximo_limite','inseguro') NOT NULL,
  alerta_vento          BOOLEAN NOT NULL DEFAULT FALSE,
  mensagem              TEXT NULL,             -- várias regras podem falhar juntas
  FOREIGN KEY (simulacao_id) REFERENCES simulacao(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Relatório (N:1 com Simulação) — RF11
-- ---------------------------------------------------------------------
CREATE TABLE relatorio (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  simulacao_id  INT NOT NULL,
  formato       ENUM('pdf','csv') NOT NULL DEFAULT 'pdf',
  caminho_arquivo VARCHAR(255) NULL,
  gerado_em     TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (simulacao_id) REFERENCES simulacao(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- ---------------------------------------------------------------------
-- Objetos da cena 3D (cargas posicionadas pelo operador para içar)
-- ---------------------------------------------------------------------
CREATE TABLE objeto_cena (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  usuario_id     INT NOT NULL,
  nome           VARCHAR(80) NOT NULL,
  peso_kg        DECIMAL(10,2) NOT NULL,
  comprimento_m  DECIMAL(6,2) NOT NULL,
  largura_m      DECIMAL(6,2) NOT NULL,
  altura_m       DECIMAL(6,2) NOT NULL,
  pos_x_m        DECIMAL(8,2) NOT NULL DEFAULT 0,
  pos_z_m        DECIMAL(8,2) NOT NULL DEFAULT 0,
  rotacao_graus  DECIMAL(6,2) NOT NULL DEFAULT 0,
  forma          VARCHAR(10) NOT NULL DEFAULT 'caixa',   -- caixa | cilindro | tubo
  cor            VARCHAR(7)  NOT NULL DEFAULT '#5b9bd1', -- cor do objeto na cena (#rrggbb)
  pernas         INT NOT NULL DEFAULT 2,                 -- pontos de pega: 1, 2 ou 4
  dist_pegas_m   DECIMAL(6,2) NOT NULL DEFAULT 0,        -- distância entre pegas
  linga_m        DECIMAL(6,2) NOT NULL DEFAULT 3,        -- comprimento de cada perna da linga
  criado_em      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuario(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Usuários de teste (senhas de TESTE — troque em produção pela tela /admin)
--   admin    / admin123     (administrador)
--   operador / operador123  (operador)
INSERT INTO usuario (nome, login, senha_hash, papel) VALUES
('Administrador', 'admin', 'scrypt:32768:8:1$8O2FYrknSJQvTnXg$527f2dac4a92682e612abded6284d3764fe5dfd27d316505784ba900ef6cf96dec7a26b72d16e2f617aaf77181aa6b517140664a9cd115cf1bf85d1b26e69136', 'administrador'),
('Operador Teste', 'operador', 'scrypt:32768:8:1$b9hlHWI8eIiedVEG$d7961502e42d5216db22c5b9e0af581ccc380ddcfd0804c8cc0b75f999b265dd616bd1293ce988b3503ba3539a8aa938d184dd47954f18b1d71546bfced77214', 'operador');

-- Guindastes
INSERT INTO guindaste
(modelo, fabricante, capacidade_maxima_kg, comprimento_lanca_min_m, comprimento_lanca_max_m,
 angulo_min_graus, angulo_max_graus, possui_jib, comprimento_jib_m, peso_total_kg, observacoes)
VALUES
('TM 130', 'Grupo Luna', 26000, 5.9, 12.4, 0, 70, FALSE, NULL, 25500,
 'Indicado para locais de pé direito baixo. Tabela por ângulo/zona de giro.'),
('MD 300L', 'Madal Palfinger', 30000, 10.5, 32.1, 0, 82, TRUE, 20.0, 29000,
 'Tabela de capacidade aproximada — validar célula a célula com catálogo oficial completo.');

-- Tabela de capacidade — TM 130 (Zona I / Zona II, por ângulo)
-- guindaste_id = 1
INSERT INTO tabela_capacidade (guindaste_id, quadrante, comprimento_lanca_m, angulo_graus, capacidade_kg) VALUES
(1,'frontal',12.4,0,3000),(1,'frontal',12.4,10,3100),(1,'frontal',12.4,20,3200),
(1,'frontal',12.4,30,3300),(1,'frontal',12.4,35,3500),(1,'frontal',12.4,55,3800),(1,'frontal',12.4,70,3800),
(1,'lateral_traseira',12.4,0,2100),(1,'lateral_traseira',12.4,10,2150),(1,'lateral_traseira',12.4,20,2200),
(1,'lateral_traseira',12.4,30,2300),(1,'lateral_traseira',12.4,35,2550),(1,'lateral_traseira',12.4,40,2700),
(1,'lateral_traseira',12.4,45,2900),(1,'lateral_traseira',12.4,50,3300),(1,'lateral_traseira',12.4,55,3500),
(1,'lateral_traseira',12.4,60,3700),(1,'lateral_traseira',12.4,70,3800);

-- Tabela de capacidade — MD 300L (por comprimento de lança / raio, área frontal)
-- guindaste_id = 2  ** valores aproximados, revisar com catálogo completo **
INSERT INTO tabela_capacidade (guindaste_id, quadrante, comprimento_lanca_m, raio_m, capacidade_kg) VALUES
(2,'frontal',10.5,3.0,30000),(2,'frontal',10.5,3.5,25000),(2,'frontal',10.5,4.0,22900),
(2,'frontal',10.5,4.5,21000),(2,'frontal',10.5,5.0,19200),(2,'frontal',10.5,6.0,15500),
(2,'frontal',14.1,3.5,20000),(2,'frontal',14.1,4.0,20000),(2,'frontal',14.1,4.5,20000),
(2,'frontal',14.1,5.0,18000),(2,'frontal',14.1,6.0,14500),(2,'frontal',14.1,7.0,11500),
(2,'frontal',17.7,4.0,16000),(2,'frontal',17.7,5.0,15000),(2,'frontal',17.7,6.0,13000),
(2,'frontal',17.7,7.0,10800),(2,'frontal',17.7,8.0,7500),
(2,'frontal',21.3,4.5,12000),(2,'frontal',21.3,6.0,12000),(2,'frontal',21.3,7.0,10500),
(2,'frontal',21.3,8.0,8500),(2,'frontal',21.3,9.0,6500),
(2,'frontal',24.9,6.0,11500),(2,'frontal',24.9,8.0,8000),(2,'frontal',24.9,10.0,5000),
(2,'frontal',28.5,7.0,9000),(2,'frontal',28.5,10.0,5000),(2,'frontal',28.5,14.0,2100),
(2,'frontal',32.1,8.0,7000),(2,'frontal',32.1,12.0,3500),(2,'frontal',32.1,20.0,500);

-- Acessórios de exemplo
INSERT INTO acessorio (nome, massa_kg, fator_reducao, soma_na_carga, observacoes) VALUES
('Moitão padrão', 235, 1.000, FALSE, 'Já incluso no peso do gancho principal considerado na tabela'),
('Gancho JIB', 67, 1.000, FALSE, 'Já incluso no peso do gancho considerado na tabela da JIB'),
('Balancim', 0, 1.000, TRUE, 'Massa variável, informada pelo operador na simulação'),
('Linga têxtil', 15, 1.000, TRUE, NULL);

