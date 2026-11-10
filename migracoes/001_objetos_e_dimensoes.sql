-- Para bancos criados antes da personalização dos objetos da cena.
-- (Quem rodar o seed.sql de novo não precisa deste arquivo.)
USE boomcalc;

ALTER TABLE objeto_cena
  ADD COLUMN forma        VARCHAR(10) NOT NULL DEFAULT 'caixa'   AFTER rotacao_graus,
  ADD COLUMN cor          VARCHAR(7)  NOT NULL DEFAULT '#5b9bd1' AFTER forma,
  ADD COLUMN pernas       INT NOT NULL DEFAULT 2                 AFTER cor,
  ADD COLUMN dist_pegas_m DECIMAL(6,2) NOT NULL DEFAULT 0        AFTER pernas,
  ADD COLUMN linga_m      DECIMAL(6,2) NOT NULL DEFAULT 3        AFTER dist_pegas_m;

-- Dimensões do guindaste (usadas no relatório da cena; preencha em /admin)
ALTER TABLE guindaste
  ADD COLUMN comprimento_m      DECIMAL(6,2) NULL AFTER peso_total_kg,
  ADD COLUMN largura_m          DECIMAL(6,2) NULL AFTER comprimento_m,
  ADD COLUMN altura_m           DECIMAL(6,2) NULL AFTER largura_m,
  ADD COLUMN abertura_patolas_m DECIMAL(6,2) NULL AFTER altura_m;
