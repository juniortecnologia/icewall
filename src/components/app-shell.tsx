"use client";

import { usePathname } from "next/navigation";
import { Nav } from "./nav";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAuthRoute = pathname.startsWith("/login");
  const isFullscreenRoute = pathname.startsWith("/terminal");

  if (isAuthRoute) {
    return <main className="min-h-dvh w-full">{children}</main>;
  }

  if (isFullscreenRoute) {
    return (
      <div className="flex min-h-dvh flex-col md:flex-row">
        <Nav />
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <Nav />
      <main className="min-w-0 flex-1 px-4 py-5 md:px-8 md:py-7">{children}</main>
    </div>
  );
}
