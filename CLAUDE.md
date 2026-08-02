# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a **has-toggle** monorepo - a production-grade Turborepo template for Next.js SaaS applications. The codebase is built around five core principles: Fast, Cheap, Opinionated, Modern, and Safe. It uses Bun workspaces and Turborepo for managing multiple applications and shared packages.

## Development Commands

### Setup & Installation
```bash
bun install                    # Install all dependencies
bun migrate                   # Format, generate, and push Prisma schema to database
```

### Running Applications
```bash
bun dev                       # Run all apps in development mode
turbo dev --filter=app         # Run only the main app (port 3000)
turbo dev --filter=web         # Run only the web/marketing site (port 3001)
turbo dev --filter=api         # Run only the API (port 3002, includes Stripe webhook listener)
```

### Testing
```bash
bun test                      # Run tests across all workspaces
turbo test --filter=app        # Run tests for specific app
bun test                       # Run Bun test runner in apps/app or apps/api
```

### Code Quality
```bash
bun run check                     # Run Biome linter/formatter checks (uses ultracite presets)
bun run fix                       # Auto-fix linting/formatting issues
turbo boundaries               # Check package boundaries
```

### Building
```bash
bun run build                     # Build all apps (depends on tests passing)
turbo build --filter=app       # Build specific app
turbo analyze --filter=app     # Analyze bundle size
```

### Database
```bash
bun migrate                   # Format schema, generate Prisma client, push to DB
cd packages/database && bunx prisma studio    # Open Prisma Studio
cd packages/database && bunx prisma generate  # Regenerate Prisma client only
```

### Maintenance
```bash
bun run bump-deps                 # Update dependencies (excludes recharts)
bun run bump-ui                   # Update shadcn/ui components
bun run clean                     # Clean node_modules from root
turbo clean                    # Clean build artifacts and node_modules from all workspaces
```

## Architecture

### Monorepo Structure

The repository uses **Bun workspaces** with two main directories:

- **apps/** - Deployable applications (independently deployable)
- **packages/** - Shared packages consumed by apps

### Applications (apps/)

1. **app** (port 3000) - Main SaaS application
   - Authentication via Clerk (route groups: `(authenticated)` and `(unauthenticated)`)
   - Uses Next.js 16 with App Router
   - Server actions in `app/actions/`
   - API routes in `app/api/`
   - Tests configured with Bun test runner

2. **web** (port 3001) - Marketing/landing page
   - Internationalization support (uses `[locale]` route)
   - Content management via CMS package
   - Rate limiting via Arcjet

3. **api** (port 3002) - RESTful API server
   - Health check endpoint at `/health`
   - Webhook handlers in `app/webhooks/`
   - Cron jobs in `app/cron/`
   - Development includes Stripe webhook listener (requires Stripe CLI)

4. **docs** - Documentation site (Mintlify)
5. **email** - Email templates (React Email)
6. **storybook** - Component development environment
7. **studio** - Database management UI

### Shared Packages (packages/)

Core infrastructure packages:

- **@repo/auth** - Clerk authentication (client, server, middleware, provider)
- **@repo/database** - Prisma ORM with Neon PostgreSQL adapter
  - Schema at `packages/database/prisma/schema.prisma`
  - Generated client at `packages/database/generated/client/`
- **@repo/knowledge** - MongoDB data layer for the knowledge hub (source-only, no build)
  - Zod v4 schemas in `schemas/` (organizations, people, engagements, sources, facts, proposals)
  - Typed collections + idempotent indexes (`getCollections`, `ensureIndexes`)
  - GDPR Art. 17 erasure cascade (`erasePerson`) and the review write path (`resolveProposalItems`)
  - Atlas Search definitions/pipelines in `search.ts`; `bun setup-indexes` provisions them
  - DB bootstrapping lives behind `@repo/knowledge/client` so the barrel stays runtime-portable
  - Tests need `MONGODB_TEST_URI` (they skip cleanly without it)
- **@repo/design-system** - shadcn/ui component library
  - Components in `components/` (auto-generated, excluded from Biome linting)
  - Providers for themes, tooltips, etc.
  - Dark mode support via next-themes
- **@repo/observability** - Sentry error tracking and logging
- **@repo/security** - Arcjet integration for application security
- **@repo/analytics** - Google Analytics and PostHog
- **@repo/payments** - Stripe integration
- **@repo/email** - Resend email service
- **@repo/webhooks** - Webhook handling (inbound/outbound)
- **@repo/collaboration** - Real-time features (Liveblocks)
- **@repo/feature-flags** - Feature flag management
- **@repo/notifications** - In-app notifications
- **@repo/internationalization** - i18n support
- **@repo/cms** - Content management (BaseHub)
- **@repo/seo** - SEO utilities
- **@repo/storage** - File upload/management
- **@repo/ai** - AI integration utilities

### Technology Stack

- **Framework**: Next.js 16 with App Router, React 19
- **Language**: TypeScript 5.9 (strict mode, NodeNext module resolution)
- **Package Manager**: Bun 1.1.43
- **Build Tool**: Turborepo 2.5.8
- **Database**: PostgreSQL (Neon) via Prisma 6.18
- **Auth**: Clerk
- **Styling**: Tailwind CSS 4.1
- **Linting**: Biome 2.3.1 with ultracite presets (core, react, next)
- **Testing**: Bun test runner
- **Bundling**: tsup for package builds

### Important Patterns

1. **Workspace Dependencies**: Internal packages use `workspace:*` protocol
   - Example: `"@repo/auth": "workspace:*"`

2. **Route Groups**: Apps use Next.js route groups for layout separation
   - app: `(authenticated)` and `(unauthenticated)` groups
   - web: `[locale]` for internationalization

3. **Server/Client Separation**: Packages use `server-only` for server-side code
   - Database and auth server utilities are server-only
   - Client components/utilities are separate files

4. **Environment Variables**: Uses @t3-oss/env-nextjs for type-safe env validation

5. **Path Aliases**: Apps configure aliases via tsconfig.json paths
   - `@/` - points to app root
   - `@repo/` - points to packages directory

6. **Biome Exclusions**: Auto-generated code excluded from linting:
   - `packages/design-system/components/ui` (shadcn components)
   - `packages/collaboration/config.ts` (Liveblocks config)
   - `packages/cms/basehub-types.d.ts` (CMS types)

7. **Build Dependencies**: `turbo.json` configures build to depend on tests passing
   - Builds run `^build` (dependency builds) then `test` before building

## Key Files

- `turbo.json` - Turborepo task pipeline configuration
- `biome.jsonc` - Linter/formatter configuration (extends ultracite presets)
- `packages/database/prisma/schema.prisma` - Database schema
- Root `package.json` - Monorepo scripts, workspace configuration, and CLI entry point (`dist/index.js`)

## Development Notes

- The main branch is not explicitly configured in git - PRs should target the default branch
- Apps have independent dev ports: app (3000), web (3001), api (3002)
- API development automatically runs Stripe CLI webhook forwarding to localhost:3002/webhooks/payments
- Prisma client is generated to a custom output directory: `packages/database/generated/client/`
- Tests must pass before builds complete (enforced by Turborepo pipeline)
- The design system excludes shadcn auto-generated UI components from version control linting

<!-- NEXT-AGENTS-MD-START -->[Next.js Docs Index]|root: ./.next-docs|STOP. What you remember about Next.js is WRONG for this project. Always search docs and read before any task.|If docs missing, run this command first: npx @next/codemod agents-md --output CLAUDE.md|01-app:{04-glossary.mdx}|01-app/01-getting-started:{01-installation.mdx,02-project-structure.mdx,03-layouts-and-pages.mdx,04-linking-and-navigating.mdx,05-server-and-client-components.mdx,06-cache-components.mdx,07-fetching-data.mdx,08-updating-data.mdx,09-caching-and-revalidating.mdx,10-error-handling.mdx,11-css.mdx,12-images.mdx,13-fonts.mdx,14-metadata-and-og-images.mdx,15-route-handlers.mdx,16-proxy.mdx,17-deploying.mdx,18-upgrading.mdx}|01-app/02-guides:{analytics.mdx,authentication.mdx,backend-for-frontend.mdx,caching.mdx,ci-build-caching.mdx,content-security-policy.mdx,css-in-js.mdx,custom-server.mdx,data-security.mdx,debugging.mdx,draft-mode.mdx,environment-variables.mdx,forms.mdx,incremental-static-regeneration.mdx,instrumentation.mdx,internationalization.mdx,json-ld.mdx,lazy-loading.mdx,local-development.mdx,mcp.mdx,mdx.mdx,memory-usage.mdx,multi-tenant.mdx,multi-zones.mdx,open-telemetry.mdx,package-bundling.mdx,prefetching.mdx,production-checklist.mdx,progressive-web-apps.mdx,public-static-pages.mdx,redirecting.mdx,sass.mdx,scripts.mdx,self-hosting.mdx,single-page-applications.mdx,static-exports.mdx,tailwind-v3-css.mdx,third-party-libraries.mdx,videos.mdx}|01-app/02-guides/migrating:{app-router-migration.mdx,from-create-react-app.mdx,from-vite.mdx}|01-app/02-guides/testing:{cypress.mdx,jest.mdx,playwright.mdx,vitest.mdx}|01-app/02-guides/upgrading:{codemods.mdx,version-14.mdx,version-15.mdx,version-16.mdx}|01-app/03-api-reference:{07-edge.mdx,08-turbopack.mdx}|01-app/03-api-reference/01-directives:{use-cache-private.mdx,use-cache-remote.mdx,use-cache.mdx,use-client.mdx,use-server.mdx}|01-app/03-api-reference/02-components:{font.mdx,form.mdx,image.mdx,link.mdx,script.mdx}|01-app/03-api-reference/03-file-conventions/01-metadata:{app-icons.mdx,manifest.mdx,opengraph-image.mdx,robots.mdx,sitemap.mdx}|01-app/03-api-reference/03-file-conventions:{default.mdx,dynamic-routes.mdx,error.mdx,forbidden.mdx,instrumentation-client.mdx,instrumentation.mdx,intercepting-routes.mdx,layout.mdx,loading.mdx,mdx-components.mdx,not-found.mdx,page.mdx,parallel-routes.mdx,proxy.mdx,public-folder.mdx,route-groups.mdx,route-segment-config.mdx,route.mdx,src-folder.mdx,template.mdx,unauthorized.mdx}|01-app/03-api-reference/04-functions:{after.mdx,cacheLife.mdx,cacheTag.mdx,connection.mdx,cookies.mdx,draft-mode.mdx,fetch.mdx,forbidden.mdx,generate-image-metadata.mdx,generate-metadata.mdx,generate-sitemaps.mdx,generate-static-params.mdx,generate-viewport.mdx,headers.mdx,image-response.mdx,next-request.mdx,next-response.mdx,not-found.mdx,permanentRedirect.mdx,redirect.mdx,refresh.mdx,revalidatePath.mdx,revalidateTag.mdx,unauthorized.mdx,unstable_cache.mdx,unstable_noStore.mdx,unstable_rethrow.mdx,updateTag.mdx,use-link-status.mdx,use-params.mdx,use-pathname.mdx,use-report-web-vitals.mdx,use-router.mdx,use-search-params.mdx,use-selected-layout-segment.mdx,use-selected-layout-segments.mdx,userAgent.mdx}|01-app/03-api-reference/05-config/01-next-config-js:{adapterPath.mdx,allowedDevOrigins.mdx,appDir.mdx,assetPrefix.mdx,authInterrupts.mdx,basePath.mdx,browserDebugInfoInTerminal.mdx,cacheComponents.mdx,cacheHandlers.mdx,cacheLife.mdx,compress.mdx,crossOrigin.mdx,cssChunking.mdx,devIndicators.mdx,distDir.mdx,env.mdx,expireTime.mdx,exportPathMap.mdx,generateBuildId.mdx,generateEtags.mdx,headers.mdx,htmlLimitedBots.mdx,httpAgentOptions.mdx,images.mdx,incrementalCacheHandlerPath.mdx,inlineCss.mdx,isolatedDevBuild.mdx,logging.mdx,mdxRs.mdx,onDemandEntries.mdx,optimizePackageImports.mdx,output.mdx,pageExtensions.mdx,poweredByHeader.mdx,productionBrowserSourceMaps.mdx,proxyClientMaxBodySize.mdx,reactCompiler.mdx,reactMaxHeadersLength.mdx,reactStrictMode.mdx,redirects.mdx,rewrites.mdx,sassOptions.mdx,serverActions.mdx,serverComponentsHmrCache.mdx,serverExternalPackages.mdx,staleTimes.mdx,staticGeneration.mdx,taint.mdx,trailingSlash.mdx,transpilePackages.mdx,turbopack.mdx,turbopackFileSystemCache.mdx,typedRoutes.mdx,typescript.mdx,urlImports.mdx,useLightningcss.mdx,viewTransition.mdx,webVitalsAttribution.mdx,webpack.mdx}|01-app/03-api-reference/05-config:{02-typescript.mdx,03-eslint.mdx}|01-app/03-api-reference/06-cli:{create-next-app.mdx,next.mdx}|02-pages/01-getting-started:{01-installation.mdx,02-project-structure.mdx,04-images.mdx,05-fonts.mdx,06-css.mdx,11-deploying.mdx}|02-pages/02-guides:{analytics.mdx,authentication.mdx,babel.mdx,ci-build-caching.mdx,content-security-policy.mdx,css-in-js.mdx,custom-server.mdx,debugging.mdx,draft-mode.mdx,environment-variables.mdx,forms.mdx,incremental-static-regeneration.mdx,instrumentation.mdx,internationalization.mdx,lazy-loading.mdx,mdx.mdx,multi-zones.mdx,open-telemetry.mdx,package-bundling.mdx,post-css.mdx,preview-mode.mdx,production-checklist.mdx,redirecting.mdx,sass.mdx,scripts.mdx,self-hosting.mdx,static-exports.mdx,tailwind-v3-css.mdx,third-party-libraries.mdx}|02-pages/02-guides/migrating:{app-router-migration.mdx,from-create-react-app.mdx,from-vite.mdx}|02-pages/02-guides/testing:{cypress.mdx,jest.mdx,playwright.mdx,vitest.mdx}|02-pages/02-guides/upgrading:{codemods.mdx,version-10.mdx,version-11.mdx,version-12.mdx,version-13.mdx,version-14.mdx,version-9.mdx}|02-pages/03-building-your-application/01-routing:{01-pages-and-layouts.mdx,02-dynamic-routes.mdx,03-linking-and-navigating.mdx,05-custom-app.mdx,06-custom-document.mdx,07-api-routes.mdx,08-custom-error.mdx}|02-pages/03-building-your-application/02-rendering:{01-server-side-rendering.mdx,02-static-site-generation.mdx,04-automatic-static-optimization.mdx,05-client-side-rendering.mdx}|02-pages/03-building-your-application/03-data-fetching:{01-get-static-props.mdx,02-get-static-paths.mdx,03-forms-and-mutations.mdx,03-get-server-side-props.mdx,05-client-side.mdx}|02-pages/03-building-your-application/06-configuring:{12-error-handling.mdx}|02-pages/04-api-reference:{06-edge.mdx,08-turbopack.mdx}|02-pages/04-api-reference/01-components:{font.mdx,form.mdx,head.mdx,image-legacy.mdx,image.mdx,link.mdx,script.mdx}|02-pages/04-api-reference/02-file-conventions:{instrumentation.mdx,proxy.mdx,public-folder.mdx,src-folder.mdx}|02-pages/04-api-reference/03-functions:{get-initial-props.mdx,get-server-side-props.mdx,get-static-paths.mdx,get-static-props.mdx,next-request.mdx,next-response.mdx,use-params.mdx,use-report-web-vitals.mdx,use-router.mdx,use-search-params.mdx,userAgent.mdx}|02-pages/04-api-reference/04-config/01-next-config-js:{adapterPath.mdx,allowedDevOrigins.mdx,assetPrefix.mdx,basePath.mdx,bundlePagesRouterDependencies.mdx,compress.mdx,crossOrigin.mdx,devIndicators.mdx,distDir.mdx,env.mdx,exportPathMap.mdx,generateBuildId.mdx,generateEtags.mdx,headers.mdx,httpAgentOptions.mdx,images.mdx,isolatedDevBuild.mdx,onDemandEntries.mdx,optimizePackageImports.mdx,output.mdx,pageExtensions.mdx,poweredByHeader.mdx,productionBrowserSourceMaps.mdx,proxyClientMaxBodySize.mdx,reactStrictMode.mdx,redirects.mdx,rewrites.mdx,serverExternalPackages.mdx,trailingSlash.mdx,transpilePackages.mdx,turbopack.mdx,typescript.mdx,urlImports.mdx,useLightningcss.mdx,webVitalsAttribution.mdx,webpack.mdx}|02-pages/04-api-reference/04-config:{01-typescript.mdx,02-eslint.mdx}|02-pages/04-api-reference/05-cli:{create-next-app.mdx,next.mdx}|03-architecture:{accessibility.mdx,fast-refresh.mdx,nextjs-compiler.mdx,supported-browsers.mdx}|04-community:{01-contribution-guide.mdx,02-rspack.mdx}<!-- NEXT-AGENTS-MD-END -->
