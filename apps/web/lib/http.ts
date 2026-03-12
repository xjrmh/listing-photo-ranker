import { getApp } from "@listing-photo-ranker/core";

function safeBaseUrl(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return `${url.protocol}//${url.host}`;
  } catch {
    return null;
  }
}

export function getBaseUrlFromRequest(request: Request): string {
  const origin = safeBaseUrl(request.headers.get("origin"));
  if (origin) {
    return origin;
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (forwardedHost) {
    const proto = request.headers.get("x-forwarded-proto") ?? "http";
    return `${proto}://${forwardedHost}`.replace(/\/$/, "");
  }

  const host = request.headers.get("host");
  if (host) {
    const url = new URL(request.url);
    return `${url.protocol}//${host}`.replace(/\/$/, "");
  }

  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export function jsonError(message: string, status = 400): Response {
  return Response.json({ error: message }, { status });
}

export function checkApiKey(request: Request): Response | null {
  const requiredApiKey = process.env.API_KEY?.trim();
  if (!requiredApiKey) {
    return null;
  }

  const providedApiKey = request.headers.get("x-api-key") ?? "";
  if (providedApiKey !== requiredApiKey) {
    return jsonError("Unauthorized.", 401);
  }

  return null;
}

export function getServerApp() {
  return getApp();
}
