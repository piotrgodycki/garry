import { GarryClient } from "garry-client";
import { apiBase } from "./api";

// The dashboard's client. On the server's own origin it needs no token: this
// machine is trusted, and a paired browser sends its session cookie.
export const client = new GarryClient({ baseUrl: apiBase });
