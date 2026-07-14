import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Keep pdfkit outside the bundle so it can load Helvetica.afm from node_modules
  serverExternalPackages: ["pdfkit", "fontkit", "linebreak", "png-js", "archiver"],
};

export default nextConfig;
