"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { CheckCircle2, AlertCircle, Info, X } from "lucide-react";

type Kind = "success" | "error" | "info";
type ToastItem = { id: number; message: string; kind: Kind };
type Ctx = { toast: (message: string, kind?: Kind) => void };

const ToastContext = createContext<Ctx>({ toast: () => {} });
export const useToast = () => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setItems((l) => l.filter((t) => t.id !== id)), []);
  const toast = useCallback((message: string, kind: Kind = "success") => {
    const id = nextId.current++;
    setItems((l) => [...l.slice(-3), { id, message, kind }]);
    setTimeout(() => dismiss(id), kind === "error" ? 6000 : 3000);
  }, [dismiss]);

  const value = useMemo(() => ({ toast }), [toast]);
  const Icon = { success: CheckCircle2, error: AlertCircle, info: Info };
  const tone = { success: "text-emerald-400", error: "text-red-400", info: "text-accent" };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed z-[60] right-4 bottom-20 md:bottom-4 flex flex-col gap-2 w-[calc(100vw-2rem)] max-w-sm pointer-events-none" aria-live="polite">
        {items.map((t) => {
          const I = Icon[t.kind];
          return (
            <div key={t.id} className="toast-in card pointer-events-auto flex items-start gap-2 px-3 py-2.5 shadow-lg">
              <I size={16} className={`mt-0.5 shrink-0 ${tone[t.kind]}`} />
              <span className="flex-1 text-sm">{t.message}</span>
              <button onClick={() => dismiss(t.id)} aria-label="Dismiss" className="text-muted hover:text-foreground"><X size={14} /></button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
