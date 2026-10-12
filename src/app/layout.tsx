import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Nav } from "@/components/nav";
import { Providers } from "@/components/providers";
import "./globals.css";

const inter = Inter({ variable: "--font-inter", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({ variable: "--font-jetbrains", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "ICEWALL",
  description: "Painel de controle do DGX Spark e dos modelos locais",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${inter.variable} ${jetbrains.variable}`}>
      <body className="min-h-dvh">
        <Providers>
          <div className="flex min-h-dvh flex-col md:flex-row">
            <Nav />
            <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7">{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
