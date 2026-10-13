"use client";

import React, { createContext, useContext, useEffect, useState } from "react";

export interface ActiveServer {
  id: string;
  name: string;
  type: string;
  endpoint: string;
  sshHost?: string;
  sshPort?: number;
  sshUser?: string;
  status: string;
}

interface ServerContextType {
  activeServer: ActiveServer | null;
  setActiveServer: (server: ActiveServer | null) => void;
  clearActiveServer: () => void;
}

const ServerContext = createContext<ServerContextType>({
  activeServer: null,
  setActiveServer: () => {},
  clearActiveServer: () => {},
});

const STORAGE_KEY = "icewall_active_server";

export function ServerProvider({ children }: { children: React.ReactNode }) {
  const [activeServer, setActiveServerState] = useState<ActiveServer | null>(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setActiveServerState(JSON.parse(stored));
      }
    } catch {
      // ignore
    }
  }, []);

  const setActiveServer = (server: ActiveServer | null) => {
    setActiveServerState(server);
    try {
      if (server) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(server));
      } else {
        localStorage.removeItem(STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  };

  const clearActiveServer = () => {
    setActiveServer(null);
  };

  return (
    <ServerContext.Provider value={{ activeServer, setActiveServer, clearActiveServer }}>
      {children}
    </ServerContext.Provider>
  );
}

export function useServer() {
  return useContext(ServerContext);
}
