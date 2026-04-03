"use client";

import { useEffect, useLayoutEffect, useState, useSyncExternalStore } from "react";

/**
 * `useSearchParams()` can stay stale after `router.replace()` in static export while
 * `window.location.search` is correct. We read the real URL and subscribe via
 * `useSyncExternalStore`. History must be wrapped in `useEffect` (not during
 * `subscribe()` render) so we run after App Router's own `history` patch.
 */

const listeners = new Set<() => void>();

let wrapped = false;
let origPush: typeof history.pushState;
let origReplace: typeof history.replaceState;

function notifyAll(): void {
  listeners.forEach((l) => l());
}

function ensureHistoryWrapped(): void {
  if (wrapped || typeof window === "undefined") return;
  origPush = history.pushState.bind(history);
  origReplace = history.replaceState.bind(history);
  history.pushState = function pushStateWrap(
    data: unknown,
    unused: string,
    url?: string | URL | null
  ) {
    const r = origPush(data as never, unused, url as never);
    queueMicrotask(notifyAll);
    return r;
  };
  history.replaceState = function replaceStateWrap(
    data: unknown,
    unused: string,
    url?: string | URL | null
  ) {
    const r = origReplace(data as never, unused, url as never);
    queueMicrotask(notifyAll);
    return r;
  };
  window.addEventListener("popstate", notifyAll);
  wrapped = true;
}

function unwrapHistory(): void {
  if (!wrapped || typeof window === "undefined") return;
  history.pushState = origPush;
  history.replaceState = origReplace;
  window.removeEventListener("popstate", notifyAll);
  wrapped = false;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
    if (listeners.size === 0) {
      unwrapHistory();
    }
  };
}

function getSnapshot(): string {
  if (typeof window === "undefined") return "";
  return window.location.search.slice(1);
}

function getServerSnapshot(): string {
  return "";
}

/**
 * Call after `router.replace` in case navigation updates the URL without firing our wrapper.
 */
export function bumpRankedQueryString(): void {
  queueMicrotask(notifyAll);
}

export function useRankedQueryString(): string {
  const [hydrated, setHydrated] = useState(false);
  useLayoutEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    // App Router patches `history` in its own `useEffect`; child effects can run first.
    // Defer so we wrap the router's implementation, not the native one.
    const id = window.setTimeout(() => {
      ensureHistoryWrapped();
    }, 0);
    return () => clearTimeout(id);
  }, []);

  const fromLocation = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  if (!hydrated) {
    return "";
  }

  return fromLocation;
}
