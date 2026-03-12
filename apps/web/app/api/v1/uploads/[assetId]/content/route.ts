import { getServerApp, jsonError, requireStatefulMode } from "../../../../../../lib/http";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  context: { params: Promise<{ assetId: string }> }
): Promise<Response> {
  const modeError = requireStatefulMode();
  if (modeError) {
    return modeError;
  }

  const params = await context.params;

  try {
    const content = await getServerApp().getAssetContent(params.assetId);
    return new Response(new Uint8Array(content.body), {
      status: 200,
      headers: {
        "content-type": content.contentType,
        "content-disposition": `inline; filename="${content.fileName}"`
      }
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to load asset.", 404);
  }
}

export async function PUT(
  request: Request,
  context: { params: Promise<{ assetId: string }> }
): Promise<Response> {
  const modeError = requireStatefulMode();
  if (modeError) {
    return modeError;
  }

  const params = await context.params;
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return jsonError("Missing upload token.");
  }

  try {
    const bytes = Buffer.from(await request.arrayBuffer());
    const asset = await getServerApp().putUploadedAsset(
      params.assetId,
      token,
      bytes,
      request.headers.get("content-type") ?? "application/octet-stream"
    );
    return Response.json({
      asset_id: asset.asset_id,
      upload_status: asset.upload_status,
      byte_size: asset.byte_size
    });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to store uploaded asset.");
  }
}
