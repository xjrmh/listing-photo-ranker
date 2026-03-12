import { CreateSyncRankingOptionsSchema, CreateUploadRequestSchema, inferContentType } from "@listing-photo-ranker/core";

import { checkApiKey, getServerApp, jsonError } from "../../../../../lib/http";

export const runtime = "nodejs";

function parseBoolean(value: FormDataEntryValue | null): boolean | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    return undefined;
  }

  const normalized = value.toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "on") {
    return true;
  }
  if (normalized === "false" || normalized === "0" || normalized === "off") {
    return false;
  }
  return undefined;
}

export async function POST(request: Request): Promise<Response> {
  const authError = checkApiKey(request);
  if (authError) {
    return authError;
  }

  try {
    const formData = await request.formData();
    const fileEntries = formData.getAll("files");
    const files = fileEntries.filter((entry): entry is File => entry instanceof File);

    CreateUploadRequestSchema.parse({
      files: files.map((file) => ({
        file_name: file.name,
        content_type: file.type || inferContentType(file.name),
        size_bytes: file.size
      }))
    });

    const options = CreateSyncRankingOptionsSchema.parse({
      method: typeof formData.get("method") === "string" ? formData.get("method") : undefined,
      target_count:
        typeof formData.get("target_count") === "string" && formData.get("target_count")?.toString().trim()
          ? Number(formData.get("target_count"))
          : files.length,
      listing_context: {
        listing_intent: "sale",
        property_type: typeof formData.get("property_type") === "string" ? formData.get("property_type") : undefined
      },
      policy: {
        prefer_exterior_hero: parseBoolean(formData.get("prefer_exterior_hero")),
        dedupe: parseBoolean(formData.get("dedupe")),
        require_room_diversity: parseBoolean(formData.get("require_room_diversity"))
      }
    });

    const payload = await Promise.all(
      files.map(async (file) => ({
        file_name: file.name,
        content_type: file.type || inferContentType(file.name),
        bytes: Buffer.from(await file.arrayBuffer())
      }))
    );

    const ranking = await getServerApp().rankFilesSync(options, payload);
    return Response.json(ranking);
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Unable to rank uploaded files.");
  }
}
