import { checkApiKey, getBaseUrlFromRequest, getServerApp, jsonError, requireStatefulMode } from "../../../../../lib/http";

export const runtime = "nodejs";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const authError = checkApiKey(request);
  if (authError) {
    return authError;
  }

  const modeError = requireStatefulMode();
  if (modeError) {
    return modeError;
  }

  try {
    const params = await context.params;
    const ranking = await getServerApp().getRankingJob(params.id, {
      baseUrl: getBaseUrlFromRequest(request)
    });

    if (!ranking) {
      return jsonError("Ranking not found.", 404);
    }

    return Response.json(ranking);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to fetch ranking.");
  }
}
