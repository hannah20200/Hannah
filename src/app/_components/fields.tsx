"use client";

const base = "w-full rounded-lg border border-line bg-white px-3 py-2 text-sm outline-none focus:border-ink";

export function TextField({
  label,
  value,
  onChange,
  hint,
  mono,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  mono?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-xs font-bold text-muted">
        {label}
        <span className="font-medium">{hint ?? `${value.length}자`}</span>
      </span>
      <input value={value} onChange={(e) => onChange(e.target.value)} className={`${base} ${mono ? "font-mono text-xs" : ""}`} />
    </label>
  );
}

/** 문자열 배열 = 한 줄에 하나 */
export function LinesField({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: string[];
  onChange: (v: string[]) => void;
  min: number;
  max: number;
}) {
  const n = value.filter((s) => s.trim()).length;
  const bad = n < min || n > max;
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-xs font-bold text-muted">
        {label}
        <span className={bad ? "text-red-600" : "font-medium"}>
          {n}줄 / {min === max ? min : `${min}~${max}`}줄 · 가장 긴 줄 {Math.max(0, ...value.map((s) => s.length))}자
        </span>
      </span>
      <textarea
        value={value.join("\n")}
        onChange={(e) => onChange(e.target.value.split("\n"))}
        rows={Math.max(2, value.length)}
        className={`${base} resize-y ${bad ? "border-red-300" : ""}`}
      />
    </label>
  );
}

/** 저장 전에 빈 줄 정리 */
export const cleanLines = (v: string[]) => v.map((s) => s.trim()).filter(Boolean);
