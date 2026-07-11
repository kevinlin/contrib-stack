import type { NextConfig } from "next";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

const widgetSrc = path.resolve(__dirname, "../../packages/widget/dist/widget.js");
const widgetPublicDir = path.join(__dirname, "public");
const widgetDest = path.join(widgetPublicDir, "widget.js");

function syncWidgetToPublic(): string | null {
  if (!existsSync(widgetSrc)) {
    return null;
  }
  mkdirSync(widgetPublicDir, { recursive: true });
  copyFileSync(widgetSrc, widgetDest);
  return createHash("sha256").update(readFileSync(widgetSrc)).digest("hex").slice(0, 12);
}

const widgetHash = syncWidgetToPublic();

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    const cacheControl = widgetHash
      ? `public, max-age=31536000, immutable`
      : "public, max-age=0, must-revalidate";

    return [
      {
        source: "/widget.js",
        headers: [
          { key: "Cache-Control", value: cacheControl },
          ...(widgetHash ? [{ key: "ETag", value: `"${widgetHash}"` }] : []),
        ],
      },
    ];
  },
};

export default nextConfig;
