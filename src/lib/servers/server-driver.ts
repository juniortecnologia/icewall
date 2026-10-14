/**
 * Interface genérica de driver para servidores remotos.
 * Permite adicionar provedores (SSH, WSL, Docker-in-Docker…) sem
 * acoplar o core aos detalhes de cada protocolo.
 */

export interface BaseConfig {
  host: string;
  port?: number;
  user: string;
  keyPath: string;
}

/** Resultado da execução remota de um comando. */
export interface ExecResult {
  code: number;
  stdout: string;
  stderr: string;
  /** Duração em ms (inclui timeout se houver). */
  ms: number;
}

/** Interface padrão que todo driver de servidor precisa implementar. */
export abstract class ServerDriver {
  readonly config: BaseConfig;

  constructor(config: BaseConfig) {
    this.config = config;
  }

  /** Executar um comando remoto e esperar o resultado. */
  abstract exec(command: string, timeoutMs?: number): Promise<ExecResult>;

  /** Upload (put) de arquivo local → caminho remoto. */
  abstract put(localPath: string, remotePath: string): Promise<void>;

  /** Download (get) de arquivo remoto → caminho local. */
  abstract get(remotePath: string, localPath: string): Promise<void>;

  /** Listar diretório remoto. */
  abstract ls(dir: string): Promise<string[]>;

  /** Criar diretório remoto. */
  abstract mkdir(dir: string, mode?: string): Promise<void>;

  /** Verificar conectividade (ping/SSH connection test). */
  abstract ping(timeoutMs?: number): Promise<boolean>;

  /** Fechar recursos (conexões abertas, etc.). */
  close(): void {
    // noop por padrão
  }
}

/** Fábrica simples: recebe um nome de driver + config e produz o provedor. */
export type DriverFactory = (config: BaseConfig) => ServerDriver;

/** Registro global de drivers registrados. */
const drivers = new Map<string, DriverFactory>();

export function registerDriver(name: string, factory: DriverFactory): void {
  drivers.set(name, factory);
}

export function createDriver(name: string, config: BaseConfig): ServerDriver {
  const factory = drivers.get(name);
  if (!factory) throw new Error(`driver desconhecido: ${name}`);
  return factory(config);
}
