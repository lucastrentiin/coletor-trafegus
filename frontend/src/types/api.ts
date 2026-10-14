/*
  Contratos da API do web/server.js. Os nomes dos campos seguem exatamente o
  que o backend devolve hoje — não renomear aqui sem mudar lá.
*/

export type PermissionCode =
  | 'dashboard.view'
  | 'consulta.view'
  | 'query.execute'
  | 'query.custom'
  | 'export.execute'
  | 'clients.view'
  | 'clients.manage'
  | 'config.view'
  | 'connections.manage'
  | 'attendance.view'
  | 'users.view'
  | 'users.manage'
  | 'profiles.view'
  | 'profiles.manage'
  | 'logs.view'
  | 'logs.manage';

export interface SessionUser {
  id: number | string;
  login: string;
  displayName: string;
  email: string;
  mustChangePassword: boolean;
}

export interface SessionProfile {
  id: number | string;
  code: string;
  name: string;
}

export interface AuthMe {
  ok: true;
  authEnabled: boolean;
  user: SessionUser | null;
  permissions: string[];
  profiles: SessionProfile[];
}

export interface Client {
  id: number | string;
  nome: string;
  name: string;
  enabled: boolean;
  host: string;
  port: number;
  database: string;
  credentialGroup: string;
  hasOwnDbCredential: boolean;
  dbUser: string;
  sshEnabled: boolean;
  sshHost: string;
  sshPort: number;
  sshCredentialGroup: string;
  hasOwnSshCredential: boolean;
  hasOwnSshKey: boolean;
  sshUser: string;
  sshDbHost: string;
  sshDbPort: number;
  attendanceName: string;
  lastError: string;
  lastErrorAt: string;
}

export interface CredentialGroup {
  id: string;
  number?: number;
  name: string;
  user: string;
  hasPassword: boolean;
  sshUser: string;
  hasSshPassword: boolean;
  hasSshKey: boolean;
  usedBy: number;
}

/** Corpo aceito por POST /api/config/client e /api/config/client/test. */
export interface ClientPayload {
  id: number | string | null;
  name: string;
  host: string;
  port: number | string;
  database: string;
  credentialGroup: string;
  attendanceName?: string;
  enabled?: boolean;
  dbUser: string;
  dbPassword?: string;
  sshEnabled: boolean;
  sshHost: string;
  sshPort: number | string;
  sshCredentialGroup: string;
  sshUser: string;
  sshPassword?: string;
  sshKey?: string;
  sshKeyPassphrase?: string;
  sshDbHost?: string;
  sshDbPort?: number | string;
}

/** Campos secretos vazios são omitidos: o backend mantém o valor salvo. */
export interface CredentialGroupPayload {
  id: string;
  name: string;
  user: string;
  password?: string;
  sshUser: string;
  sshPassword?: string;
  sshKey?: string;
  sshKeyPassphrase?: string;
}

export interface DashboardSummary {
  ok: true;
  total: number;
  enabled: number;
  disabled: number;
  withError: number;
  batch: number;
}

export type PeriodType = 'DIA' | 'SEMANA' | 'MES' | 'PERIODO';

export type PeriodPayload =
  | { period: 'DIA' | 'SEMANA'; date: string }
  | { period: 'MES'; month: string }
  | { period: 'PERIODO'; startDate: string; endDate: string };

export type Scope = 'PERIODO' | 'SISTEMA';

export interface IndicatorRow {
  categoria: string;
  indicador: string;
  evento?: string | null;
  quantidade: number | null;
  info?: string | null;
  escopo?: Scope;
  cliente?: string;
}

export interface QueryClientStatus {
  id: number | string;
  name: string;
  ok: boolean;
  error: string | null;
}

export interface SkippedClient {
  id: number | string;
  name: string;
  error: string;
}

export interface QueryTotals {
  eventosGerados: number;
  acessosTotal: number;
  usuariosConectados: number;
  viagens: number;
  terminaisAtivos: number;
}

export interface QueryResult {
  ok: true;
  period: string;
  mode: PeriodType;
  start: string;
  end: string;
  endInclusive: string;
  clients: QueryClientStatus[];
  failedClients: { id: number | string; name: string; error: string }[];
  rows: IndicatorRow[];
  totals: QueryTotals;
  skippedClients: SkippedClient[];
  attendance: { configured: boolean };
  byClient: {
    client: { id: number | string; name: string };
    ok: boolean;
    error: string | null;
    rows: IndicatorRow[];
  }[];
}

export type ExportMode = 'JUNTO' | 'SEPARADO';
export type ExportDetail = 'NORMAL' | 'DETALHADA';

export type CustomSource = 'CLIENTES' | 'ATENDIMENTOS' | 'CENTRAL';

export interface SavedQuery {
  id: number | string;
  name: string;
  category: string;
  description: string;
  sql: string;
  usesPeriod: boolean;
  source: CustomSource;
  createdAt?: string;
}

export type CellValue = string | number | boolean | null | Record<string, unknown> | unknown[];

export interface CustomQueryOutput {
  columns: string[];
  rows: Record<string, CellValue>[];
  source: string;
  query: string;
  category: string;
  description: string;
  clientId?: number | string;
  clientName?: string;
  ok: boolean;
  error?: string;
}

export interface CustomQueryResult {
  ok: true;
  source: CustomSource;
  custom: true;
  failed: boolean;
  errors: { name: string; error: string }[];
  results: CustomQueryOutput[];
  skippedClients: SkippedClient[];
}

export interface ExternalConnection {
  enabled: boolean;
  host: string;
  port: number;
  database: string;
  user: string;
  hasPassword: boolean;
  ssl: boolean;
}

export interface ExternalConfig {
  ok: true;
  atendimentos: ExternalConnection;
  central: ExternalConnection;
}

export type ExternalType = 'ATENDIMENTOS' | 'CENTRAL';

export interface CollectionLog {
  ok: true;
  files: string[];
  lines: string[];
}

export interface AuditEntry {
  action: string;
  resource: string;
  resourceId: string | number | null;
  status: string;
  at: string;
  userName: string;
}

export interface McpLogEntry {
  status: string;
  at: string;
  userName: string;
  details: {
    source?: string;
    nome?: string;
    categoria?: string;
    sql?: string;
    clientes?: { id?: number | string; nome?: string; ok?: boolean; linhas?: number }[];
    falhas?: { nome?: string; erro?: string }[];
  };
}

export type LogDestination = 'ARQUIVO' | 'AUDITORIA' | 'AMBOS';

export interface LogEventConfig {
  chave: string;
  grupo: string;
  rotulo: string;
  descricao: string;
  destino: LogDestination;
  padrao: boolean;
  ativo: boolean;
}

export type ClearLogsScope = 'ARQUIVOS' | 'AUDITORIA' | 'TUDO';

export interface AppUser {
  id: number | string;
  login: string;
  displayName: string;
  email: string;
  active: boolean;
  mustChangePassword: boolean;
  lastLoginAt: string | null;
  profiles: string[];
}

export interface Profile {
  id: number | string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  permissionIds: (number | string)[];
}

export interface Permission {
  id: number | string;
  code: string;
  name: string;
  area: string;
  action: string;
}
