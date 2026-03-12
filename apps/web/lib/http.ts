import { getApp } from "@listing-photo-ranker/core";
import { createHmac, timingSafeEqual } from "node:crypto";

import { readCookie, WEB_UI_API_COOKIE_NAME, WEB_UI_API_TOKEN_CONTEXT } from "./api-auth";

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

function hasValidBrowserApiCookie(request: Request, apiKey: string): boolean {
  const cookie = readCookie(request.headers.get("cookie"), WEB_UI_API_COOKIE_NAME);
  if (!cookie) {
    return false;
  }

  const provided = Buffer.from(cookie);
  const expected = Buffer.from(createHmac("sha256", apiKey).update(WEB_UI_API_TOKEN_CONTEXT).digest("base64url"));
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function checkApiKey(request: Request): Response | null {
  const requiredApiKey = process.env.API_KEY?.trim();
  if (!requiredApiKey) {
    return null;
  }

  const providedApiKey = request.headers.get("x-api-key") ?? "";
  if (providedApiKey === requiredApiKey || hasValidBrowserApiCookie(request, requiredApiKey)) {
    return null;
  }

  return jsonError("Unauthorized.", 401);
}

export function getServerApp() {
  return getApp();
}
