"use client";

import { useCallback, useEffect, useState } from "react";
import type { Slot, PhotoState } from "@/lib/photo-plan";
import type { Analysis, Draft } from "@/lib/schema";
import type { PostMeta } from "@/lib/store";

export type PostData = {
  meta: PostMeta;
  analysis: Analysis | null;
  draft: Draft | null;
  photoState: PhotoState | null;
  slots: Slot[];
  rendered: string[];
};

/** fetch + JSON + 에러 메시지 */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<T> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    ...(json !== undefined ? { body: JSON.stringify(json), headers: { "content-type": "application/json" } } : {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw Object.assign(new Error((data as { error?: string }).error ?? `요청 실패 (HTTP ${res.status})`), { data });
  }
  return data as T;
}

export function usePost(id: string) {
  const [post, setPost] = useState<PostData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      setPost(await api<PostData>(`/api/posts/${encodeURIComponent(id)}`));
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { post, setPost, error, reload };
}

export const fileUrl = (id: string, rel: string, area: "work" | "out" = "work") =>
  `/api/posts/${encodeURIComponent(id)}/file?area=${area}&path=${encodeURIComponent(rel)}`;

/** 원고 사진 src(photos/a.jpg 또는 http URL) → 브라우저에서 볼 수 있는 URL */
export const photoUrl = (id: string, src: string) => (/^https?:/.test(src) ? src : fileUrl(id, src));
