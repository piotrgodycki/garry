/** @type {import('next').NextConfig} */
const nextConfig = {
  // `next dev` blocks dev assets (HMR, chunks) for origins other than localhost.
  // Allow the tailnet so the UI works from a phone through `tailscale serve`.
  // Extra hosts (comma separated) come from GARRY_DEV_ORIGINS.
  allowedDevOrigins: ["**.ts.net", ...(process.env.GARRY_DEV_ORIGINS?.split(",").map((s) => s.trim()).filter(Boolean) ?? [])],
};
export default nextConfig;
