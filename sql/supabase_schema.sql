-- Trafegus Collector - schema do banco de aplicacao (PostgreSQL/Supabase)
-- Importe este arquivo no SQL Editor do Supabase ou em qualquer PostgreSQL.
-- Senhas e chaves SSH nunca ficam em texto puro (ver colunas *_senha/*_chave).
--
-- Convencao de nomes: cada tabela tem um prefixo de 4 letras, e toda
-- coluna daquela tabela comeca com esse prefixo - o mesmo estilo usado
-- nas tabelas do sistema Trafegus (viag_viagem, term_terminal,
-- usua_usuario, etc.).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ===================== USUARIOS =====================
CREATE TABLE IF NOT EXISTS usua_usuario (
    usua_codigo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    usua_login VARCHAR(120) NOT NULL UNIQUE,
    usua_nome VARCHAR(200) NOT NULL,
    usua_email VARCHAR(320) UNIQUE,
    usua_senha_hash TEXT NOT NULL,
    usua_ativo BOOLEAN NOT NULL DEFAULT true,
    usua_trocar_senha BOOLEAN NOT NULL DEFAULT true,
    usua_senha_alterada_em TIMESTAMPTZ NOT NULL DEFAULT now(),
    usua_ultimo_acesso TIMESTAMPTZ,
    usua_data_cadastro TIMESTAMPTZ NOT NULL DEFAULT now(),
    usua_data_alteracao TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE usua_usuario ADD COLUMN IF NOT EXISTS usua_senha_alterada_em TIMESTAMPTZ NOT NULL DEFAULT now();

-- ===================== PERFIS E PERMISSOES =====================
CREATE TABLE IF NOT EXISTS perf_perfil (
    perf_codigo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    perf_sigla VARCHAR(80) NOT NULL UNIQUE,
    perf_nome VARCHAR(120) NOT NULL UNIQUE,
    perf_descricao TEXT,
    perf_ativo BOOLEAN NOT NULL DEFAULT true,
    perf_usua_codigo_cadastro UUID REFERENCES usua_usuario(usua_codigo) ON DELETE SET NULL,
    perf_data_cadastro TIMESTAMPTZ NOT NULL DEFAULT now(),
    perf_data_alteracao TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS perm_permissao (
    perm_codigo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    perm_sigla VARCHAR(120) NOT NULL UNIQUE,
    perm_nome VARCHAR(160) NOT NULL,
    perm_area VARCHAR(80) NOT NULL,
    perm_acao VARCHAR(40) NOT NULL,
    perm_descricao TEXT,
    perm_data_cadastro TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Perfil <-> Permissao (quais permissoes cada perfil tem)
CREATE TABLE IF NOT EXISTS pepe_perfil_permissao (
    pepe_perf_codigo UUID NOT NULL REFERENCES perf_perfil(perf_codigo) ON DELETE CASCADE,
    pepe_perm_codigo UUID NOT NULL REFERENCES perm_permissao(perm_codigo) ON DELETE CASCADE,
    pepe_data_cadastro TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (pepe_perf_codigo, pepe_perm_codigo)
);

-- Usuario <-> Perfil (quais perfis cada usuario tem)
CREATE TABLE IF NOT EXISTS usup_usuario_perfil (
    usup_usua_codigo UUID NOT NULL REFERENCES usua_usuario(usua_codigo) ON DELETE CASCADE,
    usup_perf_codigo UUID NOT NULL REFERENCES perf_perfil(perf_codigo) ON DELETE CASCADE,
    usup_data_cadastro TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (usup_usua_codigo, usup_perf_codigo)
);

-- ===================== SESSOES DE LOGIN =====================
CREATE TABLE IF NOT EXISTS sess_sessao (
    sess_codigo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sess_usua_codigo UUID NOT NULL REFERENCES usua_usuario(usua_codigo) ON DELETE CASCADE,
    sess_token_hash TEXT NOT NULL UNIQUE,
    sess_data_expiracao TIMESTAMPTZ NOT NULL,
    sess_data_revogacao TIMESTAMPTZ,
    sess_ip INET,
    sess_navegador TEXT,
    sess_data_cadastro TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================== GRUPOS DE CREDENCIAL =====================
CREATE TABLE IF NOT EXISTS cred_grupo_credencial (
    cred_codigo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- Numero sequencial (1, 2, 3...) so para facilitar localizar o
    -- registro direto no banco - a chave real continua sendo cred_codigo.
    cred_numero INTEGER UNIQUE,
    cred_sigla VARCHAR(80) NOT NULL UNIQUE,
    cred_nome VARCHAR(120) NOT NULL,
    cred_banco_usuario VARCHAR(120),
    cred_banco_senha TEXT,
    cred_ssh_usuario VARCHAR(120),
    cred_ssh_senha TEXT,
    cred_ssh_chave TEXT,
    cred_ativo BOOLEAN NOT NULL DEFAULT true,
    cred_usua_codigo_cadastro UUID REFERENCES usua_usuario(usua_codigo) ON DELETE SET NULL,
    cred_data_cadastro TIMESTAMPTZ NOT NULL DEFAULT now(),
    cred_data_alteracao TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================== CLIENTES TRAFEGUS =====================
CREATE TABLE IF NOT EXISTS clie_cliente (
    clie_codigo INTEGER PRIMARY KEY,
    clie_nome VARCHAR(200) NOT NULL,
    clie_ativo BOOLEAN NOT NULL DEFAULT false,
    clie_banco_host VARCHAR(255),
    clie_banco_porta INTEGER NOT NULL DEFAULT 5432 CHECK (clie_banco_porta BETWEEN 1 AND 65535),
    clie_banco_nome VARCHAR(200),
    clie_cred_codigo UUID REFERENCES cred_grupo_credencial(cred_codigo) ON DELETE SET NULL,
    -- Credencial de banco propria do cliente, usada quando NENHUM grupo
    -- compartilhado e selecionado (clie_cred_codigo fica NULL nesse caso).
    clie_banco_usuario VARCHAR(120),
    clie_banco_senha TEXT,
    clie_ssh_ativo BOOLEAN NOT NULL DEFAULT false,
    clie_ssh_host VARCHAR(255),
    clie_ssh_porta INTEGER NOT NULL DEFAULT 22 CHECK (clie_ssh_porta BETWEEN 1 AND 65535),
    clie_ssh_cred_codigo UUID REFERENCES cred_grupo_credencial(cred_codigo) ON DELETE SET NULL,
    -- Credencial de SSH propria do cliente, mesmo esquema da de banco acima.
    clie_ssh_usuario VARCHAR(120),
    clie_ssh_senha TEXT,
    clie_ssh_chave TEXT,
    clie_ssh_banco_host VARCHAR(255),
    clie_ssh_banco_porta INTEGER CHECK (clie_ssh_banco_porta IS NULL OR clie_ssh_banco_porta BETWEEN 1 AND 65535),
    clie_ultimo_erro TEXT,
    clie_ultimo_erro_data TIMESTAMPTZ,
    clie_data_cadastro TIMESTAMPTZ NOT NULL DEFAULT now(),
    clie_data_alteracao TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Nomes alternativos do cliente no banco de atendimentos (quando o
-- nome la e diferente do cadastrado aqui)
CREATE TABLE IF NOT EXISTS alia_cliente_alias (
    alia_codigo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alia_clie_codigo INTEGER NOT NULL REFERENCES clie_cliente(clie_codigo) ON DELETE CASCADE,
    alia_nome_atendimento VARCHAR(255) NOT NULL,
    alia_ativo BOOLEAN NOT NULL DEFAULT true,
    alia_data_cadastro TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (alia_clie_codigo, alia_nome_atendimento)
);

-- ===================== CONEXOES EXTERNAS (atendimentos/central) =====================
CREATE TABLE IF NOT EXISTS conx_conexao_externa (
    conx_codigo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    conx_sigla VARCHAR(40) NOT NULL UNIQUE,
    conx_nome VARCHAR(120) NOT NULL,
    conx_ativo BOOLEAN NOT NULL DEFAULT false,
    conx_host VARCHAR(255),
    conx_porta INTEGER NOT NULL DEFAULT 5432 CHECK (conx_porta BETWEEN 1 AND 65535),
    conx_banco_nome VARCHAR(200),
    conx_usuario VARCHAR(120),
    conx_senha BYTEA,
    conx_ssl_ativo BOOLEAN NOT NULL DEFAULT false,
    conx_ultimo_teste_data TIMESTAMPTZ,
    conx_ultimo_teste_ok BOOLEAN,
    conx_ultimo_erro TEXT,
    conx_data_alteracao TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================== BUSCAS PERSONALIZADAS (SQL salvo) =====================
CREATE TABLE IF NOT EXISTS busc_busca_personalizada (
    busc_codigo UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    busc_nome VARCHAR(160) NOT NULL,
    busc_categoria VARCHAR(100) NOT NULL DEFAULT 'PERSONALIZADA',
    busc_descricao TEXT,
    busc_origem VARCHAR(30) NOT NULL CHECK (busc_origem IN ('CLIENTES', 'ATENDIMENTOS', 'CENTRAL')),
    busc_sql TEXT NOT NULL,
    busc_usa_periodo BOOLEAN NOT NULL DEFAULT false,
    busc_ativo BOOLEAN NOT NULL DEFAULT true,
    busc_usua_codigo_cadastro UUID REFERENCES usua_usuario(usua_codigo) ON DELETE SET NULL,
    busc_data_cadastro TIMESTAMPTZ NOT NULL DEFAULT now(),
    busc_data_alteracao TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================== LOG DE AUDITORIA =====================
CREATE TABLE IF NOT EXISTS audi_log_auditoria (
    audi_codigo BIGSERIAL PRIMARY KEY,
    audi_usua_codigo UUID REFERENCES usua_usuario(usua_codigo) ON DELETE SET NULL,
    audi_acao VARCHAR(80) NOT NULL,
    audi_recurso VARCHAR(100) NOT NULL,
    audi_recurso_codigo VARCHAR(160),
    audi_status VARCHAR(20) NOT NULL DEFAULT 'OK',
    audi_ip INET,
    audi_detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
    audi_data_cadastro TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================== CONFIGURACAO DE LOGS =====================
-- Guarda apenas os eventos cuja escolha foi alterada pelo gestor. Eventos
-- ausentes desta tabela usam o padrao definido em backend/log-events.js.
CREATE TABLE IF NOT EXISTS logc_configuracao_log (
    logc_codigo VARCHAR(60) PRIMARY KEY,
    logc_ativo BOOLEAN NOT NULL DEFAULT true,
    logc_usua_codigo UUID REFERENCES usua_usuario(usua_codigo) ON DELETE SET NULL,
    logc_data_alteracao TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ===================== INDICES =====================
CREATE INDEX IF NOT EXISTS idx_sess_sessao_usuario ON sess_sessao(sess_usua_codigo, sess_data_expiracao);
CREATE INDEX IF NOT EXISTS idx_audi_log_data ON audi_log_auditoria(audi_data_cadastro DESC);
CREATE INDEX IF NOT EXISTS idx_audi_log_usuario ON audi_log_auditoria(audi_usua_codigo, audi_data_cadastro DESC);
CREATE INDEX IF NOT EXISTS idx_clie_cliente_ativo ON clie_cliente(clie_ativo);
CREATE INDEX IF NOT EXISTS idx_alia_cliente ON alia_cliente_alias(alia_clie_codigo);
CREATE INDEX IF NOT EXISTS idx_busc_origem ON busc_busca_personalizada(busc_origem, busc_ativo);

-- ===================== TRIGGERS (data_alteracao automatica) =====================
CREATE OR REPLACE FUNCTION set_usua_data_alteracao() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.usua_data_alteracao = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_usua_data_alteracao ON usua_usuario;
CREATE TRIGGER trg_usua_data_alteracao BEFORE UPDATE ON usua_usuario FOR EACH ROW EXECUTE FUNCTION set_usua_data_alteracao();

CREATE OR REPLACE FUNCTION set_perf_data_alteracao() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.perf_data_alteracao = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_perf_data_alteracao ON perf_perfil;
CREATE TRIGGER trg_perf_data_alteracao BEFORE UPDATE ON perf_perfil FOR EACH ROW EXECUTE FUNCTION set_perf_data_alteracao();

CREATE OR REPLACE FUNCTION set_cred_data_alteracao() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.cred_data_alteracao = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_cred_data_alteracao ON cred_grupo_credencial;
CREATE TRIGGER trg_cred_data_alteracao BEFORE UPDATE ON cred_grupo_credencial FOR EACH ROW EXECUTE FUNCTION set_cred_data_alteracao();

CREATE OR REPLACE FUNCTION set_clie_data_alteracao() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.clie_data_alteracao = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_clie_data_alteracao ON clie_cliente;
CREATE TRIGGER trg_clie_data_alteracao BEFORE UPDATE ON clie_cliente FOR EACH ROW EXECUTE FUNCTION set_clie_data_alteracao();

CREATE OR REPLACE FUNCTION set_conx_data_alteracao() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.conx_data_alteracao = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_conx_data_alteracao ON conx_conexao_externa;
CREATE TRIGGER trg_conx_data_alteracao BEFORE UPDATE ON conx_conexao_externa FOR EACH ROW EXECUTE FUNCTION set_conx_data_alteracao();

CREATE OR REPLACE FUNCTION set_busc_data_alteracao() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.busc_data_alteracao = now(); RETURN NEW; END; $$;
DROP TRIGGER IF EXISTS trg_busc_data_alteracao ON busc_busca_personalizada;
CREATE TRIGGER trg_busc_data_alteracao BEFORE UPDATE ON busc_busca_personalizada FOR EACH ROW EXECUTE FUNCTION set_busc_data_alteracao();

-- ===================== DADOS INICIAIS (perfis e permissoes padrao) =====================
INSERT INTO perf_perfil (perf_sigla, perf_nome, perf_descricao)
VALUES
    ('GESTOR', 'Gestor', 'Acesso administrativo ao sistema'),
    ('USUARIO_PADRAO', 'Usuario padrao', 'Acesso operacional basico')
ON CONFLICT (perf_sigla) DO NOTHING;

INSERT INTO perm_permissao (perm_sigla, perm_nome, perm_area, perm_acao, perm_descricao)
VALUES
    ('dashboard.view', 'Visualizar dashboard', 'dashboard', 'view', 'Acessar o dashboard'),
    ('consulta.view', 'Acessar consulta', 'consulta', 'view', 'Abrir a tela de Consulta'),
    ('query.execute', 'Executar consultas', 'consulta', 'execute', 'Consultar indicadores'),
    ('query.custom', 'Busca SQL personalizada', 'consulta', 'custom', 'Criar e executar buscas SQL personalizadas'),
    ('export.execute', 'Exportar relatorios', 'consulta', 'export', 'Exportar Excel e relatorios'),
    ('clients.view', 'Visualizar clientes', 'clientes', 'view', 'Acessar cadastro de clientes'),
    ('clients.manage', 'Gerenciar clientes', 'clientes', 'manage', 'Criar, editar e habilitar clientes e grupos de credencial'),
    ('config.view', 'Acessar configuração', 'configuracao', 'view', 'Abrir a tela de Configuração'),
    ('connections.manage', 'Gerenciar conexoes', 'configuracao', 'manage', 'Alterar conexoes externas (atendimentos/central)'),
    ('attendance.view', 'Visualizar atendimentos', 'atendimentos', 'view', 'Acessar a tela de Atendimentos'),
    ('users.view', 'Visualizar usuarios', 'usuarios', 'view', 'Acessar usuarios do sistema'),
    ('users.manage', 'Gerenciar usuarios', 'usuarios', 'manage', 'Criar e editar usuarios'),
    ('profiles.view', 'Visualizar perfis', 'perfis', 'view', 'Acessar perfis e permissoes'),
    ('profiles.manage', 'Gerenciar perfis', 'perfis', 'manage', 'Criar e editar perfis'),
    ('logs.view', 'Visualizar logs', 'logs', 'view', 'Acessar auditoria e logs'),
    ('logs.manage', 'Gerenciar logs', 'logs', 'manage', 'Limpar os arquivos de log')
ON CONFLICT (perm_sigla) DO NOTHING;

INSERT INTO pepe_perfil_permissao (pepe_perf_codigo, pepe_perm_codigo)
SELECT p.perf_codigo, x.perm_codigo
FROM perf_perfil p
CROSS JOIN perm_permissao x
WHERE p.perf_sigla = 'GESTOR'
ON CONFLICT DO NOTHING;

INSERT INTO pepe_perfil_permissao (pepe_perf_codigo, pepe_perm_codigo)
SELECT p.perf_codigo, x.perm_codigo
FROM perf_perfil p
JOIN perm_permissao x ON x.perm_sigla IN ('dashboard.view', 'consulta.view', 'query.execute', 'export.execute', 'clients.view', 'attendance.view', 'logs.view')
WHERE p.perf_sigla = 'USUARIO_PADRAO'
ON CONFLICT DO NOTHING;

-- ===================== VIEW: PERMISSOES EFETIVAS POR USUARIO =====================
CREATE OR REPLACE VIEW vw_permissoes_usuario AS
SELECT
    u.usua_codigo,
    u.usua_login,
    u.usua_nome,
    p.perf_sigla,
    pm.perm_sigla,
    pm.perm_area,
    pm.perm_acao
FROM usua_usuario u
JOIN usup_usuario_perfil up ON up.usup_usua_codigo = u.usua_codigo
JOIN perf_perfil p ON p.perf_codigo = up.usup_perf_codigo AND p.perf_ativo
JOIN pepe_perfil_permissao pp ON pp.pepe_perf_codigo = p.perf_codigo
JOIN perm_permissao pm ON pm.perm_codigo = pp.pepe_perm_codigo
WHERE u.usua_ativo;
