/**
 * Reads the claims of a JWT without verifying it: the services verify every token, the SPA only looks at its own.
 * Returns null for anything that is not a readable JWT.
 */
export function readJwtClaims(token: string | null | undefined): Record<string, unknown> | null {
  const payload = token?.split('.')[1]
  if (!payload) return null
  try {
    const json = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    const claims: unknown = JSON.parse(json)
    return claims !== null && typeof claims === 'object' ? (claims as Record<string, unknown>) : null
  } catch {
    return null
  }
}
