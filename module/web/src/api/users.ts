import { authFetch } from '../auth/apiClient'

/** Calls the JWT-protected user-service endpoint via authFetch, returning its plain-text body. */
export async function fetchMe(): Promise<string> {
  const res = await authFetch('/users/me')
  if (!res.ok) throw new Error(`user-service responded ${res.status}`)
  return res.text()
}
