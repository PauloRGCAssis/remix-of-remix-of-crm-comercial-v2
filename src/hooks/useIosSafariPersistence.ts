import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";

const SNAPSHOT_KEY = "ti-delso:ios-ui-snapshot:v2";
const SNAPSHOT_TTL_MS = 24 * 60 * 60 * 1000;
const AUTH_ROUTES = new Set(["/auth", "/reset-password"]);

type FieldSnapshot =
  | { kind: "checkbox"; checked: boolean }
  | { kind: "value"; value: string };

interface UiSnapshot {
  savedAt: number;
  path: string;
  search: string;
  hash: string;
  windowScroll: { x: number; y: number };
  mainScroll: { left: number; top: number } | null;
  fields: Record<string, FieldSnapshot>;
}

const fieldSelector = [
  "input:not([type='file']):not([type='password'])",
  "textarea",
  "select",
].join(",");

function readSnapshot(): UiSnapshot | null {
  try {
    const raw = window.localStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    const snapshot = JSON.parse(raw) as UiSnapshot;
    if (!snapshot?.savedAt || Date.now() - snapshot.savedAt > SNAPSHOT_TTL_MS) return null;
    return snapshot;
  } catch {
    return null;
  }
}

function fieldKey(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, index: number): string {
  const label = element.labels?.[0]?.textContent?.trim();
  return [
    element.getAttribute("data-persist-key"),
    element.name,
    element.id,
    element.getAttribute("aria-label"),
    element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement ? element.placeholder : "",
    label,
    `${element.tagName.toLowerCase()}:${(element as HTMLInputElement).type || "text"}:${index}`,
  ].find(Boolean)!;
}

function collectFields(): Record<string, FieldSnapshot> {
  const fields: Record<string, FieldSnapshot> = {};
  const elements = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(fieldSelector));
  elements.forEach((element, index) => {
    if (element.disabled || element.closest("[data-no-draft='true']")) return;
    const key = fieldKey(element, index);
    if (element instanceof HTMLInputElement && (element.type === "checkbox" || element.type === "radio")) {
      fields[key] = { kind: "checkbox", checked: element.checked };
      return;
    }
    fields[key] = { kind: "value", value: element.value };
  });
  return fields;
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : element instanceof HTMLSelectElement
      ? HTMLSelectElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
}

function restoreFields(fields: Record<string, FieldSnapshot>) {
  const elements = Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(fieldSelector));
  elements.forEach((element, index) => {
    if (element.disabled || element.closest("[data-no-draft='true']")) return;
    const snapshot = fields[fieldKey(element, index)];
    if (!snapshot) return;

    if (snapshot.kind === "checkbox" && element instanceof HTMLInputElement) {
      element.checked = snapshot.checked;
    } else if (snapshot.kind === "value") {
      setNativeValue(element, snapshot.value);
    }

    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

export function useIosSafariPersistence() {
  const location = useLocation();
  const navigate = useNavigate();
  const didRouteRestore = useRef(false);

  useEffect(() => {
    if (didRouteRestore.current) return;
    didRouteRestore.current = true;
    const snapshot = readSnapshot();
    if (!snapshot) return;
    const currentPath = `${location.pathname}${location.search}${location.hash}`;
    const savedPath = `${snapshot.path}${snapshot.search}${snapshot.hash}`;
    const isRootBoot = location.pathname === "/" || location.pathname === "/index";
    if (isRootBoot && AUTH_ROUTES.has(snapshot.path)) {
      navigate("/dashboard", { replace: true });
      return;
    }
    if (isRootBoot && savedPath && savedPath !== currentPath) {
      navigate(savedPath, { replace: true });
    }
  }, [location.hash, location.pathname, location.search, navigate]);

  useEffect(() => {
    const saveSnapshot = () => {
      try {
        if (AUTH_ROUTES.has(location.pathname)) return;
        const main = document.querySelector<HTMLElement>("[data-app-main-scroll='true']");
        const snapshot: UiSnapshot = {
          savedAt: Date.now(),
          path: location.pathname,
          search: location.search,
          hash: location.hash,
          windowScroll: { x: window.scrollX, y: window.scrollY },
          mainScroll: main ? { left: main.scrollLeft, top: main.scrollTop } : null,
          fields: collectFields(),
        };
        window.localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshot));
      } catch {
        // Safari can deny storage in low-storage/private contexts; never interrupt the app.
      }
    };

    const restoreSnapshot = () => {
      const snapshot = readSnapshot();
      if (!snapshot) return;
      if (snapshot.path !== location.pathname) return;

      const apply = () => {
        const main = document.querySelector<HTMLElement>("[data-app-main-scroll='true']");
        restoreFields(snapshot.fields ?? {});
        if (snapshot.mainScroll && main) {
          main.scrollTo({ left: snapshot.mainScroll.left, top: snapshot.mainScroll.top });
        }
        window.scrollTo(snapshot.windowScroll.x, snapshot.windowScroll.y);
      };

      window.requestAnimationFrame(apply);
      window.setTimeout(apply, 150);
      window.setTimeout(apply, 600);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") saveSnapshot();
      if (document.visibilityState === "visible") restoreSnapshot();
    };

    const handlePageShow = () => restoreSnapshot();
    const handleInput = () => saveSnapshot();

    restoreSnapshot();
    window.addEventListener("pagehide", saveSnapshot);
    window.addEventListener("pageshow", handlePageShow);
    window.addEventListener("beforeunload", saveSnapshot);
    window.addEventListener("blur", saveSnapshot);
    window.addEventListener("freeze", saveSnapshot as EventListener);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    document.addEventListener("input", handleInput, true);
    document.addEventListener("change", handleInput, true);

    return () => {
      saveSnapshot();
      window.removeEventListener("pagehide", saveSnapshot);
      window.removeEventListener("pageshow", handlePageShow);
      window.removeEventListener("beforeunload", saveSnapshot);
      window.removeEventListener("blur", saveSnapshot);
      window.removeEventListener("freeze", saveSnapshot as EventListener);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      document.removeEventListener("input", handleInput, true);
      document.removeEventListener("change", handleInput, true);
    };
  }, [location.hash, location.pathname, location.search]);
}