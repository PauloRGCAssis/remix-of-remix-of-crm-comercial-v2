import { Dispatch, SetStateAction, useCallback, useEffect, useState } from "react";

const PREFIX = "ti-delso:persistent-ui:";

function resolveInitial<T>(initialValue: T | (() => T)): T {
  return typeof initialValue === "function" ? (initialValue as () => T)() : initialValue;
}

function readValue<T>(key: string, initialValue: T | (() => T)): T {
  if (typeof window === "undefined") return resolveInitial(initialValue);
  try {
    const raw = window.localStorage.getItem(`${PREFIX}${key}`);
    if (!raw) return resolveInitial(initialValue);
    return JSON.parse(raw) as T;
  } catch {
    return resolveInitial(initialValue);
  }
}

export function usePersistentState<T>(
  key: string,
  initialValue: T | (() => T),
): [T, Dispatch<SetStateAction<T>>, () => void] {
  const [value, setValue] = useState<T>(() => readValue(key, initialValue));

  useEffect(() => {
    try {
      window.localStorage.setItem(`${PREFIX}${key}`, JSON.stringify(value));
    } catch {
      // iOS private mode / storage quota: keep in memory without breaking the page.
    }
  }, [key, value]);

  const clear = useCallback(() => {
    try {
      window.localStorage.removeItem(`${PREFIX}${key}`);
    } catch {
      // noop
    }
    setValue(resolveInitial(initialValue));
  }, [initialValue, key]);

  return [value, setValue, clear];
}