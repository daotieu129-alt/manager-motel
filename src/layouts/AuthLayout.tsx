// src/layouts/AuthLayout.tsx
import React, { useEffect, useRef } from "react";
import { AnimatePresence, motion } from "framer-motion";

export type ToastType = "success" | "error" | "info";
export type ToastState =
  | { open: true; type: ToastType; title: string; message?: string }
  | { open: false; type?: ToastType; title?: string; message?: string };

function cn(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function ToastIcon({ type }: { type: ToastType }) {
  const base = "h-5 w-5";
  if (type === "success") {
    return (
      <svg viewBox="0 0 24 24" className={cn(base, "text-green-600")} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === "error") {
    return (
      <svg viewBox="0 0 24 24" className={cn(base, "text-red-600")} fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 9v4" strokeLinecap="round" />
        <path d="M12 17h.01" strokeLinecap="round" />
        <path
          d="M10.29 3.86l-7.4 12.82A2 2 0 0 0 4.62 20h14.76a2 2 0 0 0 1.73-3.32l-7.4-12.82a2 2 0 0 0-3.42 0z"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className={cn(base, "text-blue-600")} fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 16v-4" strokeLinecap="round" />
      <path d="M12 8h.01" strokeLinecap="round" />
      <path d="M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" strokeLinejoin="round" />
    </svg>
  );
}

function Blobs() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute top-0 right-0 h-96 w-96 -translate-y-1/2 translate-x-1/2 rounded-full bg-yellow-400/5 blur-3xl" />
      <div className="absolute bottom-0 left-0 h-80 w-80 translate-y-1/2 -translate-x-1/2 rounded-full bg-yellow-400/5 blur-3xl" />
    </div>
  );
}

export default function AuthLayout({
  children,
  toast,
  onDismissToast,
}: {
  children: React.ReactNode;
  toast?: ToastState;
  onDismissToast?: () => void;
}) {
  const timerRef = useRef<number | null>(null);

  // Optional: auto-dismiss if parent passes toast but no timer logic
  useEffect(() => {
    if (!toast?.open) return;
    if (onDismissToast) {
      if (timerRef.current) window.clearTimeout(timerRef.current);
      timerRef.current = window.setTimeout(() => onDismissToast(), 3200);
    }
    return () => {
      if (timerRef.current) window.clearTimeout(timerRef.current);
    };
  }, [toast?.open, onDismissToast]);

  return (
    <div className="relative min-h-screen bg-gray-50">
      <Blobs />

      <div className="relative mx-auto flex min-h-screen w-full max-w-lg items-center px-4 py-10 sm:px-6">
        <motion.div
          className="w-full"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", stiffness: 360, damping: 28 }}
        >
          <AnimatePresence>
            {toast?.open && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ type: "spring", stiffness: 420, damping: 30 }}
                className={cn(
                  "mb-5 rounded-lg border-2 bg-white p-4 shadow-sm",
                  toast.type === "success"
                    ? "border-green-200"
                    : toast.type === "error"
                      ? "border-red-200"
                      : "border-blue-200"
                )}
                role="status"
                aria-live="polite"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "mt-0.5 grid h-9 w-9 place-items-center rounded-lg border bg-gray-50",
                      toast.type === "success"
                        ? "border-green-200"
                        : toast.type === "error"
                          ? "border-red-200"
                          : "border-blue-200"
                    )}
                  >
                    <ToastIcon type={toast.type} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-gray-900">{toast.title}</p>
                    {toast.message ? <p className="mt-1 text-sm text-gray-600">{toast.message}</p> : null}
                  </div>
                  {onDismissToast ? (
                    <button
                      type="button"
                      className="rounded-md border-2 border-gray-200 bg-white px-2 py-1 text-sm text-gray-600 transition-all hover:bg-gray-50 active:bg-gray-100"
                      onClick={onDismissToast}
                      aria-label="Dismiss toast"
                    >
                      ✕
                    </button>
                  ) : null}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {children}
        </motion.div>
      </div>
    </div>
  );
}
