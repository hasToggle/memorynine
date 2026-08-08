import fs from "node:fs";
import { getBlogSlugs, getLegalSlugs } from "@repo/cms";
import type { MetadataRoute } from "next";
import { env } from "@/env";

const appFolders = fs.readdirSync("app", { withFileTypes: true });
const pages = appFolders
  .filter((file) => file.isDirectory())
  .filter((folder) => !folder.name.startsWith("_"))
  .filter((folder) => !folder.name.startsWith("("))
  .filter((folder) => !folder.name.startsWith("["))
  .filter((folder) => !folder.name.startsWith("."))
  .filter((folder) => folder.name !== "api")
  .map((folder) => folder.name);
const blogs = getBlogSlugs();
const legals = getLegalSlugs();
const url = new URL(env.NEXT_PUBLIC_WEB_URL);

const sitemap = async (): Promise<MetadataRoute.Sitemap> => [
  {
    lastModified: new Date(),
    url: new URL("/", url).href,
  },
  ...pages.map((page) => ({
    lastModified: new Date(),
    url: new URL(page, url).href,
  })),
  ...blogs.map((blogSlug) => ({
    lastModified: new Date(),
    url: new URL(`blog/${blogSlug}`, url).href,
  })),
  ...legals.map((legalSlug) => ({
    lastModified: new Date(),
    url: new URL(`legal/${legalSlug}`, url).href,
  })),
];

export default sitemap;
