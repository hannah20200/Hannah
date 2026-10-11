"use client";

import type { ButtonHTMLAttributes, ReactNode } from "react";

export function Button({
  variant = "primary",
  busy,
  children,
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" | "butter"; busy?: boolean }) {
  const styles = {
    primary: "bg-ink text-white hover:bg-black",
    butter: "bg-butter text-ink hover:brightness-95",
    ghost: "border border-line bg-paper text-ink hover:bg-white",
  }[variant];
  return (
    <button
      {...rest}
      disabled={rest.disabled || busy}
      className={`inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-bold transition disabled:cursor-not-allowed disabled:opacity-50 ${styles} ${className}`}
    >
      {busy && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner() {
  return <span className="inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

export function ErrorBox({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="whitespace-pre-wrap rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{children}</div>;
}

export function Notice({ children }: { children: ReactNode }) {
  if (!children) return null;
  return <div className="whitespace-pre-wrap rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{children}</div>;
}

export function Card({ title, children, className = "", aside }: { title?: ReactNode; children: ReactNode; className?: string; aside?: ReactNode }) {
  return (
    <section className={`rounded-2xl border border-line bg-paper p-5 ${className}`}>
      {(title || aside) && (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h3 className="text-sm font-extrabold tracking-wide text-muted">{title}</h3>
          {aside}
        </div>
      )}
      {children}
    </section>
  );
}

export function Loading({ label = "불러오는 중" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-10 text-muted">
      <Spinner /> {label}
    </div>
  );
}

/** 오래 걸리는 작업 안내 */
export function Working({ label, hint }: { label: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-line bg-paper py-14 text-center">
      <span className="size-8 animate-spin rounded-full border-4 border-butter border-r-transparent" />
      <div className="font-bold">{label}</div>
      {hint && <div className="text-sm text-muted">{hint}</div>}
    </div>
  );
}
