"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";

/**
 * A request captured during this browser session. Phase 1 has no database or
 * AI extraction, so these live in memory and are lost on a full page reload.
 */
export interface SessionCapture {
  id: string;
  text: string;
  capturedAt: Date;
}

interface CaptureContextValue {
  captures: readonly SessionCapture[];
  addCapture: (text: string) => void;
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
  const [captures, setCaptures] = useState<SessionCapture[]>([]);
  const [isQuickCaptureOpen, setQuickCaptureOpen] = useState(false);
  const nextId = useRef(1);

  const shortcutLabel = useSyncExternalStore(
    subscribeToNothing,
    getShortcutLabel,
    getServerShortcutLabel,
  );

  const addCapture = useCallback((text: string) => {
    const id = `capture-${nextId.current++}`;
    setCaptures((current) => [
      { id, text, capturedAt: new Date() },
      ...current,
    ]);
  }, []);

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
      captures,
      addCapture,
      isQuickCaptureOpen,
      setQuickCaptureOpen,
      openQuickCapture,
      shortcutLabel,
    }),
    [captures, addCapture, isQuickCaptureOpen, openQuickCapture, shortcutLabel],
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
