import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingIncludes: {
    "/api/queue": ["./data/seed/queue.json"],
    "/api/metrics": ["./data/seed/metrics.json"],
    "/api/demo": ["./data/seed/demo.json"],
    "/api/report": ["./data/seed/report.md"],
    "/api/cases/[id]": ["./data/seed/cases/**/*"],
  },
};

export default nextConfig;
