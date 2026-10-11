import type { Metadata } from "next";
import { Archivo, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
// Archivo tem eixo de largura: os títulos usam a versão condensada, como letreiro de painel.
const rotulo = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-archivo" });

export const metadata: Metadata = {
  title: "Crivo",
  description: "Os dois portões do Claude Code",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${mono.variable} ${rotulo.variable}`}>
      {/* extensões do navegador (ex.: ColorZilla) injetam atributos no <body> antes da hidratação */}
      <body className="min-h-dvh font-rotulo antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
