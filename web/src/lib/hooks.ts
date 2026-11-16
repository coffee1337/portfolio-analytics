import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window === "undefined" ? false : window.matchMedia(query).matches,
  );
  useEffect(() => {
    const list = window.matchMedia(query);
    const handler = () => setMatches(list.matches);
    handler();
    list.addEventListener("change", handler);
    return () => list.removeEventListener("change", handler);
  }, [query]);
  return matches;
}

export function usePath(): string {
  const [path, setPath] = useState(() => window.location.pathname);
  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  return path;
}

export function navigate(path: string): void {
  if (window.location.pathname + window.location.search === path) return;
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
  window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
}

export function useSearchParams(): [URLSearchParams, (next: URLSearchParams, replace?: boolean) => void] {
  const [search, setSearch] = useState(() => window.location.search);
  useEffect(() => {
    const handler = () => setSearch(window.location.search);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  const params = useMemo(() => new URLSearchParams(search), [search]);
  const update = useCallback((next: URLSearchParams, replace = true) => {
    const query = next.toString();
    const url = `${window.location.pathname}${query ? `?${query}` : ""}`;
    if (replace) window.history.replaceState({}, "", url);
    else window.history.pushState({}, "", url);
    setSearch(window.location.search);
  }, []);
  return [params, update];
}

type DocumentWithTransition = Document & {
  startViewTransition?: (callback: () => void) => { ready: Promise<void> };
};

export function applyTheme(next: "dark" | "light", origin?: { x: number; y: number }): void {
  const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const commit = () => {
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("et-theme", next);
    } catch {
      /* private mode */
    }
  };
  const doc = document as DocumentWithTransition;
  if (reduce || !doc.startViewTransition) {
    commit();
    return;
  }
  const x = origin?.x ?? window.innerWidth / 2;
  const y = origin?.y ?? 0;
  const transition = doc.startViewTransition(commit);
  void transition.ready.then(() => {
    const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y));
    document.documentElement.animate(
      { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
      {
        duration: 520,
        easing: "cubic-bezier(.22,1,.36,1)",
        pseudoElement: "::view-transition-new(root)",
      },
    );
  });
}

export function useInterval(callback: () => void, delay: number | null): void {
  const saved = useRef(callback);
  useEffect(() => {
    saved.current = callback;
  }, [callback]);
  useEffect(() => {
    if (delay === null) return;
    const id = window.setInterval(() => saved.current(), delay);
    return () => window.clearInterval(id);
  }, [delay]);
}

export async function copyText(value: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    /* clipboard blocked */
  }
}
