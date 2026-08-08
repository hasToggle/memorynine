import type { MetadataRoute } from "next";
import { env } from "@/env";

const url = new URL(env.NEXT_PUBLIC_WEB_URL);

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      allow: "/",
      userAgent: "*",
    },
    sitemap: new URL("/sitemap.xml", url.href).href,
  };
}
