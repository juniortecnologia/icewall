// Fuso fixo: o servidor e o navegador geram o mesmo texto, sem erro de hidratação.
const formato = new Intl.DateTimeFormat("pt-BR", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  timeZone: "America/Sao_Paulo",
});

export function formatarHora(iso: string): string {
  return formato.format(new Date(iso));
}
