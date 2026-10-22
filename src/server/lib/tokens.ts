export function makeMcpToken(): { token: string; prefix: string } {
  const bytes = crypto.getRandomValues(new Uint8Array(32)); let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const value = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { token: `bs_mcp_${value}`, prefix: value.slice(0, 8) };
}
export async function sha256(value: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Store only the hash of an MCP token. The server pepper (when configured)
 * binds hashes to the deployment; verification must use the same helper. */
export async function hashMcpToken(token: string, pepper?: string): Promise<string> {
  return sha256(pepper ? `${pepper}:${token}` : token);
}

/** Opaque random bearer token with a readable prefix (e.g. `bsoa_…`). */
export function randomOpaqueToken(prefix: string): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const value = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${prefix}_${value}`;
}

/** RFC7636 S256 code challenge: base64url(sha256(ascii(verifier))). */
export async function pkceS256Challenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const bytes = new Uint8Array(digest);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
