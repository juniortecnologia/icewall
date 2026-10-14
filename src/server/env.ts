/**
 * Fail-fast validation for required environment variables.
 * Called at application startup to ensure critical secrets are configured.
 */

function assertEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`[ICEWALL] Variável de ambiente obrigatória ausente: ${name}. Configure no .env.local antes de iniciar.`);
  }
  return value;
}

export function validateRequiredEnv(): void {
  // Fail-fast para segredos críticos
  assertEnv("JWT_SECRET");
  
  // Outras variáveis críticas podem ser adicionadas aqui no futuro
  // assertEnv("DATABASE_URL"); // se migrar para PostgreSQL
}

export { assertEnv };