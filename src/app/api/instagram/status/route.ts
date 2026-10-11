import { handle } from "@/lib/api";
import { configFromEnv, getPublishingLimit } from "@/lib/instagram";

/** GET /api/instagram/status → 설정·공개 주소 연결·게시 한도 확인 */
export async function GET() {
  return handle(async () => {
    const { config, missing } = configFromEnv();
    if (!config) return { configured: false, missing };

    let publicReachable = false;
    let publicError: string | undefined;
    try {
      const res = await fetch(`${config.publicBaseUrl}/api/public/ping`, { signal: AbortSignal.timeout(8000) });
      publicReachable = res.ok && (await res.json()).app === "small-magazine-maker";
      if (!publicReachable) publicError = `HTTP ${res.status}`;
    } catch (err) {
      publicError = (err as Error).message;
    }

    let limit = null;
    let limitError: string | undefined;
    try {
      limit = await getPublishingLimit(config);
    } catch (err) {
      limitError = (err as Error).message;
    }

    return {
      configured: true,
      missing,
      host: config.host,
      version: config.version,
      publicBaseUrl: config.publicBaseUrl,
      publicReachable,
      publicError,
      limit,
      limitError,
    };
  });
}
