import { GarryError, type ClientOptions, type FetchLike } from "./connect";

/** The transport every part of the client shares: the server's address, the token, JSON in and out. */
export class HttpClient {
  protected readonly base: string;
  protected readonly f: FetchLike;

  constructor(protected readonly opts: ClientOptions) {
    this.base = opts.baseUrl.replace(/\/$/, "");
    this.f = opts.fetch ?? ((input, init) => fetch(input, init));
  }

  protected headers(extra: Record<string, string> = {}): Record<string, string> {
    return this.opts.token ? { authorization: `Bearer ${this.opts.token}`, ...extra } : extra;
  }

  protected async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const res = await this.f(`${this.base}${path}`, { ...init, headers: this.headers((init.headers as Record<string, string>) ?? {}) });
    const body = (await res.json().catch(() => ({}))) as T & { error?: string };
    if (!res.ok) throw new GarryError(body.error ?? `${path}: ${res.status}`, res.status);
    return body;
  }

  protected post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  }
}
