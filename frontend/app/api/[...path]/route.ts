import type { NextRequest } from "next/server";

/**
 * Runtime proxy to the NestJS API.
 *
 * A rewrite would bake `API_URL` in at build time; this route handler reads it
 * per request, so the same build can point at any API host. The browser still
 * only talks to this origin (no CORS, no mixed-content surprises) and the
 * backend response is streamed back unchanged.
 */
const API_URL = process.env.API_URL ?? "http://127.0.0.1:3000";

const HOP_BY_HOP = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "host",
  "content-length",
]);

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await context.params;
  const incoming = new URL(request.url);
  const target = `${API_URL.replace(/\/$/, "")}/${path.join("/")}${incoming.search}`;

  const headers = new Headers(request.headers);
  for (const header of HOP_BY_HOP) headers.delete(header);

  const hasBody = request.method !== "GET" && request.method !== "HEAD";

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: hasBody ? await request.arrayBuffer() : undefined,
    redirect: "manual",
    cache: "no-store",
  });

  const responseHeaders = new Headers(upstream.headers);
  // fetch already decoded the body, so the original encoding/length no longer apply.
  responseHeaders.delete("content-encoding");
  responseHeaders.delete("content-length");
  responseHeaders.delete("transfer-encoding");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export {
  proxy as GET,
  proxy as POST,
  proxy as PATCH,
  proxy as PUT,
  proxy as DELETE,
  proxy as OPTIONS,
  proxy as HEAD,
};
