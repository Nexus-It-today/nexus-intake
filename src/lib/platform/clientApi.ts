export async function authedFetch<T = unknown>(
  accessToken: string | null,
  input: string,
  init: RequestInit = {}
): Promise<T> {
  const headers = new Headers(init.headers);
  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(input, { ...init, headers });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = typeof (payload as { error?: unknown })?.error === "string" ? (payload as { error: string }).error : `Request failed (${response.status})`;
    throw new Error(message);
  }

  return payload as T;
}
