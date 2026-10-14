-- ================================================================
-- BANCO CENTRAL DO COLETOR TRAFEGUS
-- Execute este arquivo conectado ao banco que voce criou para o coletor.
-- ================================================================

CREATE TABLE IF NOT EXISTS coleta_indicadores (
    id BIGSERIAL PRIMARY KEY,
    data_referencia DATE NOT NULL,
    periodicidade VARCHAR(10) NOT NULL CHECK (periodicidade IN ('DIARIO','MENSAL')),
    cliente_id INTEGER NOT NULL,
    cliente_nome VARCHAR(200) NOT NULL,
    categoria VARCHAR(50) NOT NULL,
    indicador VARCHAR(120) NOT NULL,
    escopo VARCHAR(12) NOT NULL DEFAULT 'PERIODO' CHECK (escopo IN ('SISTEMA','PERIODO')),
    evento VARCHAR(500) NOT NULL DEFAULT '',
    quantidade BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'OK',
    erro TEXT,
    data_coleta TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_coleta_indicadores UNIQUE (
        data_referencia, periodicidade, cliente_id, categoria, indicador, evento
    )
);

ALTER TABLE coleta_indicadores ADD COLUMN IF NOT EXISTS escopo VARCHAR(12) NOT NULL DEFAULT 'PERIODO';
UPDATE coleta_indicadores SET escopo='PERIODO' WHERE escopo IS NULL;

CREATE INDEX IF NOT EXISTS idx_coleta_data
    ON coleta_indicadores (data_referencia, periodicidade);

CREATE INDEX IF NOT EXISTS idx_coleta_cliente
    ON coleta_indicadores (cliente_id, data_referencia);

CREATE INDEX IF NOT EXISTS idx_coleta_categoria
    ON coleta_indicadores (categoria, indicador, data_referencia);

CREATE TABLE IF NOT EXISTS coleta_execucao (
    id BIGSERIAL PRIMARY KEY,
    data_referencia DATE NOT NULL,
    periodicidade VARCHAR(10) NOT NULL CHECK (periodicidade IN ('DIARIO','MENSAL')),
    cliente_id INTEGER NOT NULL,
    cliente_nome VARCHAR(200) NOT NULL,
    tentativa INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL,
    inicio TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    fim TIMESTAMPTZ,
    erro TEXT,
    CONSTRAINT uq_execucao_tentativa UNIQUE (
        data_referencia, periodicidade, cliente_id, tentativa
    )
);

CREATE INDEX IF NOT EXISTS idx_execucao_data_status
    ON coleta_execucao (data_referencia, periodicidade, status);

CREATE TABLE IF NOT EXISTS coleta_execucao_log (
    id BIGSERIAL PRIMARY KEY,
    data_referencia DATE NOT NULL,
    periodicidade VARCHAR(10) NOT NULL,
    cliente_id INTEGER,
    cliente_nome VARCHAR(200),
    tentativa INTEGER,
    etapa VARCHAR(100) NOT NULL,
    status VARCHAR(20) NOT NULL,
    mensagem TEXT,
    data_registro TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_execucao_log_data
    ON coleta_execucao_log (data_referencia, periodicidade);

-- ATENDIMENTOS FICAM EM TABELA PROPRIA.
-- A origem desses dados e OUTRO banco central, portanto o coletor nao mistura
-- o SQL dos atendimentos com os SQLs dos bancos Trafegus.
CREATE TABLE IF NOT EXISTS atendimentos (
    id BIGSERIAL PRIMARY KEY,
    data_referencia DATE NOT NULL,
    periodicidade VARCHAR(10) NOT NULL CHECK (periodicidade IN ('DIARIO','MENSAL')),
    cliente_nome VARCHAR(200) NOT NULL,
    status VARCHAR(200) NOT NULL,
    quantidade BIGINT NOT NULL,
    data_coleta TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_atendimentos UNIQUE (
        data_referencia, periodicidade, cliente_nome, status
    )
);

CREATE INDEX IF NOT EXISTS idx_atendimentos_data_cliente
    ON atendimentos (data_referencia, cliente_nome);

CREATE INDEX IF NOT EXISTS idx_atendimentos_status
    ON atendimentos (status, data_referencia);

-- VIEW FACILITADORA PARA RELATORIOS
CREATE OR REPLACE VIEW vw_coleta_indicadores AS
SELECT
    data_referencia,
    periodicidade,
    cliente_id,
    cliente_nome,
    categoria,
    indicador,
    escopo,
    evento,
    quantidade,
    status,
    erro,
    data_coleta
FROM coleta_indicadores;
