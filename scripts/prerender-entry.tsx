/**
 * Static prerender for public marketing routes (built by
 * vite.prerender.config.ts into dist-prerender/prerender.js, then run with
 * node AFTER `vite build`). Renders each route to HTML with react-dom/server
 * and writes dist/client/<route>/index.html (+ robots.txt + sitemap.xml) so
 * crawlers and AI readers see full content without running JavaScript.
 *
 * Data policy (matches docs/agent-rules + portal rules):
 * - Portal brand uses static fallbacks (GrowthSnipe, no support email row);
 *   the client hydrates and patches from GET /api/portal within milliseconds.
 * - Pricing emits its static shell copy only — plans always render live from
 *   GET /api/plans after hydration. Never bake prices/names here.
 * - Signed-out auth UI is rendered (session effects don't run server-side).
 */
import type { ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "../src/react-app/components/ui/tooltip";
import { Toaster } from "../src/react-app/components/ui/sonner";
import { MARKETING_ROUTES } from "../src/react-app/marketing-routes";
import { PrerenderContext } from "../src/react-app/components/marketing/prerender-context";
import { PAGE_META } from "../src/react-app/components/marketing/page-meta";
import {
  INTEGRATION_PAGES,
  getIntegrationPage,
} from "../src/react-app/pages/marketing/integration-pages";
import { TRADE_PAGES, getTradePage } from "../src/react-app/pages/marketing/trade-pages";
import { POSTS, getPost } from "../src/react-app/pages/marketing/blog-posts";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const HOST = (process.env.PRERENDER_HOST ?? "https://growthsnipe.com").replace(/\/$/, "");
const OUT_DIR = path.resolve(process.env.PRERENDER_DIR ?? "dist/client");
const BUILD_DATE = new Date().toISOString().slice(0, 10);

interface PageTarget {
  url: string;
  Component: ComponentType;
  title: string;
  description: string;
  priority: string;
}

function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function targets(): PageTarget[] {
  const byPath = new Map(MARKETING_ROUTES.map((r) => [r.path, r.Component]));
  const list: PageTarget[] = [];
  const componentFor = (pattern: string): ComponentType => {
    const Component = byPath.get(pattern);
    if (!Component) throw new Error(`marketing route missing for pattern ${pattern}`);
    return Component;
  };
  for (const { path } of MARKETING_ROUTES) {
    if (path === "/integrations/:platform") {
      for (const slug of Object.keys(INTEGRATION_PAGES)) {
        const page = getIntegrationPage(slug);
        if (!page) throw new Error(`unknown integration slug ${slug}`);
        list.push({
          url: `/integrations/${slug}`,
          Component: componentFor(path),
          title: page.title,
          description: page.description,
          priority: "0.7",
        });
      }
    } else if (path === "/who-we-help/:trade") {
      for (const slug of Object.keys(TRADE_PAGES)) {
        const page = getTradePage(slug);
        if (!page) throw new Error(`unknown trade slug ${slug}`);
        list.push({
          url: `/who-we-help/${slug}`,
          Component: componentFor(path),
          title: page.title,
          description: page.description,
          priority: "0.7",
        });
      }
    } else if (path === "/blog/:slug") {
      for (const post of POSTS) {
        const found = getPost(post.slug);
        if (!found) throw new Error(`unknown blog slug ${post.slug}`);
        list.push({
          url: `/blog/${post.slug}`,
          Component: componentFor(path),
          title: `${found.title} | GrowthSnipe Blog`,
          description: found.metaDescription,
          priority: "0.6",
        });
      }
    } else {
      const meta = PAGE_META[path];
      if (!meta) throw new Error(`page-meta.ts missing entry for ${path}`);
      list.push({
        url: path,
        Component: componentFor(path),
        title: meta.title,
        description: meta.description,
        priority: path === "/" ? "1.0" : path === "/pricing" ? "0.9" : "0.8",
      });
    }
  }
  return list;
}

function renderPage(url: string, Component: ComponentType): string {
  return renderToString(
    <StaticRouter location={url}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
        <TooltipProvider>
          <PrerenderContext.Provider value>
            <Component />
          </PrerenderContext.Provider>
          <Toaster position="top-right" closeButton />
        </TooltipProvider>
      </ThemeProvider>
    </StaticRouter>,
  );
}

function withHead(template: string, target: PageTarget, body: string): string {
  // Canonical matches the served URL: Workers Static Assets 307-redirects
  // slashless folder URLs to the trailing-slash form that returns 200
  // (probed 2026-10-01). Root stays bare.
  const canonical = target.url === "/" ? `${HOST}/` : `${HOST}${target.url}/`;
  if (!template.includes('<div id="root"></div>')) {
    throw new Error("template root div not found — rebuild the client first");
  }
  // Stamp the source route so the client only hydrates when it matches the
  // live URL (see main.tsx): dashboard/auth/unknown URLs fall through to the
  // prerendered homepage shell, which must NOT be hydrated as-is.
  let html = template.replace(
    '<div id="root"></div>',
    `<div id="root" data-prerender-path="${esc(target.url)}">${body}</div>`,
  );
  if (!html.includes("<title>GrowthSnipe</title>")) {
    throw new Error("template title tag not found — rebuild the client first");
  }
  html = html.replace("<title>GrowthSnipe</title>", `<title>${esc(target.title)}</title>`);
  const tags = [
    `<meta name="description" content="${esc(target.description)}" />`,
    `<link rel="canonical" href="${esc(canonical)}" />`,
    `<meta property="og:title" content="${esc(target.title)}" />`,
    `<meta property="og:description" content="${esc(target.description)}" />`,
    '<meta property="og:type" content="website" />',
    `<meta property="og:url" content="${esc(canonical)}" />`,
    `<meta property="og:image" content="${esc(`${HOST}/logo.png`)}" />`,
    '<meta name="twitter:card" content="summary" />',
  ].join("\n    ");
  const anchor = '<meta name="theme-color" content="#0669ff" />';
  if (!html.includes(anchor)) throw new Error("template theme-color meta not found");
  return html.replace(anchor, `${anchor}\n    ${tags}`);
}

function robotsTxt(): string {
  return [
    "User-agent: *",
    "Allow: /",
    "Disallow: /api/",
    "Disallow: /auth/",
    "Disallow: /dashboard",
    "Disallow: /billing",
    "Disallow: /superadmin",
    "Disallow: /login",
    "Disallow: /signup",
    "Disallow: /onboarding",
    "",
    `Sitemap: ${HOST}/sitemap.xml`,
    "",
  ].join("\n");
}

function sitemapXml(list: PageTarget[]): string {
  const urls = list
    .map((t) => {
      const loc = t.url === "/" ? `${HOST}/` : `${HOST}${t.url}/`;
      return `  <url>\n    <loc>${esc(loc)}</loc>\n    <lastmod>${BUILD_DATE}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>${t.priority}</priority>\n  </url>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

function main(): void {
  const list = targets();
  const templatePath = path.join(OUT_DIR, "index.html");
  if (!existsSync(templatePath)) {
    throw new Error(`client template missing at ${templatePath} — run vite build first`);
  }
  const template = readFileSync(templatePath, "utf8");

  const failures: string[] = [];
  for (const target of list) {
    try {
      const body = renderPage(target.url, target.Component);
      if (!body.includes("<h1")) failures.push(`${target.url}: no <h1> in rendered HTML`);
      const html = withHead(template, target, body);
      if (!html.includes("/assets/")) failures.push(`${target.url}: asset tags missing`);
      if (!html.includes(`data-prerender-path="${target.url}"`)) {
        failures.push(`${target.url}: prerender-path stamp missing (route-aware hydration)`);
      }
      if (target.url === "/pricing" && /\$\d/.test(html)) {
        failures.push("/pricing: baked price literal — plans must stay API-driven");
      }
      const file =
        target.url === "/" ? templatePath : path.join(OUT_DIR, target.url, "index.html");
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(file, html);
    } catch (err) {
      failures.push(`${target.url}: ${(err as Error).message}`);
    }
  }
  writeFileSync(path.join(OUT_DIR, "robots.txt"), robotsTxt());
  writeFileSync(path.join(OUT_DIR, "sitemap.xml"), sitemapXml(list));

  if (failures.length > 0) {
    console.error(`prerender failed for ${failures.length} route(s):`);
    for (const f of failures) console.error(` - ${f}`);
    process.exit(1);
  }
  console.log(`prerendered ${list.length} routes + robots.txt + sitemap.xml → ${OUT_DIR}`);
  // Imported client libraries can leave handles/timers open (auth client,
  // theme provider); the work is done, so exit explicitly to keep CI builds
  // from hanging.
  process.exit(0);
}

main();
