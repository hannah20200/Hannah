"use client";

import { useEffect, useState } from "react";
import { api } from "@/app/_components/client";
import { Spinner } from "@/app/_components/ui";

type Status = {
  configured: boolean;
  missing: string[];
  publicBaseUrl?: string;
  publicReachable?: boolean;
  publicError?: string;
  limit?: { quota_usage: number; config?: { quota_total?: number } } | null;
  limitError?: string;
};

/** Instagram 연결 상태 (설정 · 공개 주소 · 24시간 게시 한도) */
export function InstagramStatus({ onStatus }: { onStatus?: (ok: boolean) => void }) {
  const [s, setS] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Status>("/api/instagram/status")
      .then((r) => {
        setS(r);
        onStatus?.(r.configured && !!r.publicReachable && !r.limitError);
      })
      .catch((e) => setErr((e as Error).message));
  }, [onStatus]);

  const row = (ok: boolean | undefined, label: string, detail?: string) => (
    <div className="flex items-start gap-2 text-sm">
      <span className={ok ? "text-green-700" : "text-red-600"}>{ok ? "●" : "○"}</span>
      <span>
        <b>{label}</b>
        {detail && <span className="ml-1 text-muted">{detail}</span>}
      </span>
    </div>
  );

  return (
    <section className="rounded-2xl border border-line bg-paper p-4">
      <h3 className="mb-2 text-sm font-extrabold tracking-wide text-muted">Instagram 연결</h3>
      {err ? (
        <p className="text-sm text-red-700">{err}</p>
      ) : !s ? (
        <div className="flex items-center gap-2 text-sm text-muted">
          <Spinner /> 확인 중
        </div>
      ) : !s.configured ? (
        <div className="space-y-1 text-sm">
          {row(false, "설정 필요", `.env.local에 ${s.missing.join(", ")}`)}
          <p className="text-xs text-muted">비즈니스/크리에이터 계정과 Meta 앱 토큰이 필요해요. README의 ‘Instagram 게시 설정’을 참고하세요.</p>
        </div>
      ) : (
        <div className="space-y-1">
          {row(true, "토큰·계정 설정됨")}
          {row(s.publicReachable, "공개 주소", s.publicReachable ? s.publicBaseUrl : `${s.publicBaseUrl} 에 닿지 않아요 (${s.publicError ?? ""})`)}
          {s.limitError
            ? row(false, "API 확인 실패", s.limitError)
            : row(true, "24시간 게시 한도", s.limit ? `${s.limit.quota_usage} / ${s.limit.config?.quota_total ?? "?"}회 사용` : "")}
        </div>
      )}
    </section>
  );
}
