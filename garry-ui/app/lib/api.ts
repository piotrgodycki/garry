// Base URL of the garry server. Empty means the server that serves this page
// (garry serve, or the Vite dev proxy). VITE_GARRY_SERVER points elsewhere.
export const apiBase: string = import.meta.env.VITE_GARRY_SERVER ?? "";
