import { useCallback, useEffect, useState } from "react";

export type ClientStatusOverride = "ativo" | "atencao" | "inativo";

const STORAGE_KEY = "client-status-overrides:v1";

function readStore(): Record<string, ClientStatusOverride> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(value: Record<string, ClientStatusOverride>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

const listeners = new Set<() => void>();

export function useClientStatusOverride() {
  const [map, setMap] = useState<Record<string, ClientStatusOverride>>(() => readStore());

  useEffect(() => {
    const listener = () => setMap(readStore());
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }, []);

  const setOverride = useCallback((nome: string, value: ClientStatusOverride | null) => {
    const next = { ...readStore() };
    if (value === null) delete next[nome];
    else next[nome] = value;
    writeStore(next);
    listeners.forEach((l) => l());
  }, []);

  return { overrides: map, setOverride };
}
