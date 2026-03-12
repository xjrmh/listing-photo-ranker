import { CreateUploadRequestSchema } from "@listing-photo-ranker/core";

import { checkApiKey, getBaseUrlFromRequest, getServerApp, jsonError, requireStatefulMode } from "../../../../lib/http";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const authError = checkApiKey(request);
  if (authError) {
    return authError;
  }

  const modeError = requireStatefulMode();
  if (modeError) {
    return modeError;
  }

  try {
    const payload = CreateUploadRequestSchema.parse(await request.json());
    const response = await getServerApp().createUploadSession(payload, {
      baseUrl: getBaseUrlFromRequest(request)
    });
    return Response.json(response);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to create upload targets.");
  }
}
