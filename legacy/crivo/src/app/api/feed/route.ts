import { connection } from "next/server";
import { respostaFeed } from "@/lib/respostas";

export async function GET() {
  // O SQLite é síncrono e o Next não o enxerga: sem isto, o feed seria congelado no build.
  await connection();
  return respostaFeed();
}
