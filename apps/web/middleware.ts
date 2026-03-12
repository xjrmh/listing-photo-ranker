import { NextResponse, type NextRequest } from "next/server";

import { WEB_UI_API_COOKIE_NAME, WEB_UI_API_TOKEN_CONTEXT } from "./lib/api-auth";

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function createBrowserApiToken(apiKey: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(apiKey), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(WEB_UI_API_TOKEN_CONTEXT));
  return bytesToBase64Url(new Uint8Array(signature));
}

export async function middleware(request: NextRequest) {
  const requiredApiKey = process.env.API_KEY?.trim();
  if (!requiredApiKey) {
    return NextResponse.next();
  }

  const token = await createBrowserApiToken(requiredApiKey);
  if (request.cookies.get(WEB_UI_API_COOKIE_NAME)?.value === token) {
    return NextResponse.next();
  }

  const response = NextResponse.next();
  response.cookies.set(WEB_UI_API_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
    path: "/"
  });
  return response;
}

export const config = {
  matcher: ["/", "/rankings/:path*"]
};
