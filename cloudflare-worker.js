/**
 * Cloudflare Worker for GovCoPilot ASP
 * Domain: https://gov-copilot-api.<subdomain>.workers.dev or custom domain
 * Passes SC_CDN_DEPLOY_TOOL security guardrails by running on Cloudflare Edge (not vercel.app).
 */

const UPSTREAM_URL = 'https://gov-copilot.vercel.app';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Payment-Tx-Hash, X-Payment-Hash, PAYMENT-SIGNATURE, X-PAYMENT',
          'Access-Control-Expose-Headers': 'PAYMENT-REQUIRED, WWW-Authenticate, X-Payment-Address, X-Payment-Amount, X-Payment-Chain-Id, X-Payment-Network, X-Payment-Asset, X-Payment-Token-Address',
        },
      });
    }

    // Proxy request to upstream ASP server
    const proxyUrl = new URL(url.pathname + url.search, UPSTREAM_URL);

    const headers = new Headers(request.headers);
    headers.set('X-Forwarded-Host', url.host);
    headers.set('Host', new URL(UPSTREAM_URL).host);

    const init = {
      method: request.method,
      headers: headers,
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.arrayBuffer() : null,
      redirect: 'follow',
    };

    const response = await fetch(proxyUrl.toString(), init);

    const responseHeaders = new Headers(response.headers);
    responseHeaders.set('Access-Control-Allow-Origin', '*');
    responseHeaders.set(
      'Access-Control-Expose-Headers',
      'PAYMENT-REQUIRED, WWW-Authenticate, X-Payment-Address, X-Payment-Amount, X-Payment-Chain-Id, X-Payment-Network, X-Payment-Asset, X-Payment-Token-Address'
    );

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  },
};
