const USER_SERVICE_URL = import.meta.env.VITE_USER_SERVICE_URL ?? 'http://localhost:8080'

export class UnauthorizedError extends Error {
  constructor() {
    super('Unauthorized')
    this.name = 'UnauthorizedError'
  }
}

/** Calls the JWT-protected user-service endpoint, returning its plain-text body. */
export async function fetchMe(accessToken: string): Promise<string> {
  const res = await fetch(`${USER_SERVICE_URL}/users/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })
  if (res.status === 401 || res.status === 403) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`user-service responded ${res.status}`)
  return res.text()
}
