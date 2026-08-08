import { ArrowLeftIcon } from "@radix-ui/react-icons";
import {
  getBlogPost,
  getBlogSlugs,
  mdxComponents,
  TableOfContents,
} from "@repo/cms";
import { JsonLd } from "@repo/seo/json-ld";
import { createMetadata } from "@repo/seo/metadata";
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Sidebar } from "@/components/sidebar";
import { env } from "@/env";

const protocol = env.VERCEL_PROJECT_PRODUCTION_URL?.startsWith("https")
  ? "https"
  : "http";
const url = new URL(`${protocol}://${env.VERCEL_PROJECT_PRODUCTION_URL}`);

interface BlogPostProperties {
  readonly params: Promise<{
    slug: string;
  }>;
}

export const generateMetadata = async ({
  params,
}: BlogPostProperties): Promise<Metadata> => {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    return {};
  }

  return createMetadata({
    description: post.description,
    image: post.image,
    title: post.title,
  });
};

export const generateStaticParams = (): { slug: string }[] =>
  getBlogSlugs().map((slug) => ({ slug }));

const BlogPostPage = async ({ params }: BlogPostProperties) => {
  const { slug } = await params;
  const post = await getBlogPost(slug);

  if (!post) {
    notFound();
  }

  const Content = post.content;

  return (
    <>
      <JsonLd
        code={{
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          author: post.authors.at(0)?.name,
          dateModified: post.date,
          datePublished: post.date,
          description: post.description,
          headline: post.title,
          image: post.image,
          isAccessibleForFree: true,
          mainEntityOfPage: {
            "@id": new URL(`/blog/${post.slug}`, url).toString(),
            "@type": "WebPage",
          },
        }}
      />
      <div className="container mx-auto py-16">
        <Link
          className="mb-4 inline-flex items-center gap-1 text-muted-foreground text-sm focus:underline focus:outline-none"
          href="/blog"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Blog
        </Link>
        <div className="mt-16 flex flex-col items-start gap-8 sm:flex-row">
          <div className="sm:flex-1">
            <div className="prose prose-neutral dark:prose-invert max-w-none">
              <h1 className="scroll-m-20 text-balance font-extrabold text-4xl tracking-tight lg:text-5xl">
                {post.title}
              </h1>
              <p className="not-first:mt-6 text-balance leading-7">
                {post.description}
              </p>
              {post.image ? (
                <Image
                  alt={post.imageAlt}
                  className="my-16 h-full w-full rounded-xl"
                  height={400}
                  priority
                  src={post.image}
                  width={800}
                />
              ) : null}
              <div className="mx-auto max-w-prose">
                <Content components={mdxComponents} />
              </div>
            </div>
          </div>
          <div className="sticky top-24 hidden shrink-0 md:block">
            <Sidebar
              date={new Date(post.date)}
              readingTime={`${post.readingTime} min read`}
              toc={<TableOfContents entries={post.toc} />}
            />
          </div>
        </div>
      </div>
    </>
  );
};

export default BlogPostPage;
