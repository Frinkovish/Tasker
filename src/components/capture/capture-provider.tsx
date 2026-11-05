"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

interface CaptureContextValue {
  isQuickCaptureOpen: boolean;
  setQuickCaptureOpen: (open: boolean) => void;
  openQuickCapture: () => void;
  /** Empty until the browser's platform is known, to avoid a hydration mismatch. */
  shortcutLabel: string;
}

const CaptureContext = createContext<CaptureContextValue | null>(null);

const subscribeToNothing = () => () => {};
const getShortcutLabel = () =>
  /Mac|iPhone|iPad/.test(navigator.userAgent) ? "⌘K" : "Ctrl K";
const getServerShortcutLabel = () => "";

export function CaptureProvider({ children }: { children: ReactNode }) {
  const [isQuickCaptureOpen, setQuickCaptureOpen] = useState(false);

  const shortcutLabel = useSyncExternalStore(
    subscribeToNothing,
    getShortcutLabel,
    getServerShortcutLabel,
  );

  const openQuickCapture = useCallback(() => setQuickCaptureOpen(true), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuickCaptureOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(
    () => ({
      isQuickCaptureOpen,
      setQuickCaptureOpen,
      openQuickCapture,
      shortcutLabel,
    }),
    [isQuickCaptureOpen, openQuickCapture, shortcutLabel],
  );

  return (
    <CaptureContext.Provider value={value}>{children}</CaptureContext.Provider>
  );
}

export function useCapture(): CaptureContextValue {
  const value = useContext(CaptureContext);
  if (!value) {
    throw new Error("useCapture must be used inside CaptureProvider.");
  }
  return value;
}
