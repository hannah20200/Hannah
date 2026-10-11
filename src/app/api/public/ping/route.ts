/** GET /api/public/ping — PUBLIC_BASE_URL이 이 서버에 닿는지 확인용 */
export async function GET() {
  return Response.json({ ok: true, app: "small-magazine-maker" });
}
