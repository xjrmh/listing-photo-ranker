import { FeedbackRequestSchema } from "@listing-photo-ranker/core";

import { checkApiKey, getServerApp, jsonError, requireStatefulMode } from "../../../../../../lib/http";

export const runtime = "nodejs";

export async function POST(
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
    const payload = FeedbackRequestSchema.parse(await request.json());
    const feedback = await getServerApp().submitFeedback(params.id, payload);
    return Response.json(feedback, { status: 201 });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to submit feedback.");
  }
}
