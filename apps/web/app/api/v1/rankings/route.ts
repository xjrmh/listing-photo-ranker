import { CreateRankingRequestSchema } from "@listing-photo-ranker/core";

import { checkApiKey, getServerApp, jsonError } from "../../../../lib/http";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const authError = checkApiKey(request);
  if (authError) {
    return authError;
  }

  try {
    const payload = CreateRankingRequestSchema.parse(await request.json());
    const ranking = await getServerApp().createRankingJob(payload);
    return Response.json(ranking, { status: 202 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to create ranking job.");
  }
}
