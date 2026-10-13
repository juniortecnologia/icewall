"use client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ServerProvider } from "./server-context";

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { staleTime: 2000, retry: 1, refetchOnWindowFocus: true } } }),
  );
  return (
    <QueryClientProvider client={client}>
      <ServerProvider>{children}</ServerProvider>
    </QueryClientProvider>
  );
}
