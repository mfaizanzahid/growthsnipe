import { useEffect, useState, Fragment } from "react";
import { Link, useLocation } from "react-router-dom";
import { Bars3Icon, ChevronDownIcon, EnvelopeIcon, ArrowUpIcon } from "@heroicons/react/24/outline";
// Owner to supply real profile URLs later — "#" placeholders for now.
import {
  FacebookLogo,
  InstagramLogo,
  LinkedinLogo,
  TiktokLogo,
  XLogo,
  YoutubeLogo,
} from "@phosphor-icons/react";
import { Button } from "../ui/button";
import { Sheet, SheetContent, SheetTrigger } from "../ui/sheet";
import { BrandLogo } from "../BrandLogo";
import { usePortal } from "../../hooks/usePortalName";
import { useSession } from "../../lib/auth-client";
import { PAGE_META } from "./page-meta";
import { EmbedScripts } from "../EmbedScripts";

function AuthLinks({ signedIn, onNavigate }: { signedIn: boolean; onNavigate?: () => void }) {
  if (signedIn) {
    return (
      <Button size="sm" asChild onClick={onNavigate}>
        <Link to="/dashboard">Dashboard</Link>
      </Button>
    );
  }
  return (
    <>
      <Button variant="ghost" size="sm" asChild onClick={onNavigate}>
        <Link to="/login">Sign in</Link>
      </Button>
      <Button size="sm" asChild onClick={onNavigate}>
        <Link to="/signup">Start free trial</Link>
      </Button>
    </>
  );
}

const NAV_MENUS = [
  {
    label: "Product",
    links: [
      { to: "/how-it-works", label: "How it works" },
      { to: "/features", label: "Features" },
      { to: "/advisors", label: "Advisors" },
      { to: "/integrations", label: "Integrations" },
      { to: "/technology", label: "Technology" },
      { to: "/who-we-help", label: "Who we help" },
    ],
  },
  {
    label: "Resources",
    links: [
      { to: "/blog", label: "Blog" },
      { to: "/associations", label: "Associations" },
      { to: "/security", label: "Security" },
    ],
  },
  {
    label: "Company",
    links: [
      { to: "/about", label: "About" },
      { to: "/contact", label: "Contact" },
    ],
  },
];

const PRODUCT_LINKS = [
  { to: "/how-it-works", label: "How it works" },
  { to: "/features", label: "Features" },
  { to: "/advisors", label: "Advisors" },
  { to: "/integrations", label: "Integrations" },
  { to: "/technology", label: "Technology" },
  { to: "/who-we-help", label: "Who we help" },
  { to: "/pricing", label: "Pricing" },
];

const COMPANY_LINKS = [
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
  { to: "/login", label: "Sign in" },
  { to: "/signup", label: "Get started" },
];

const RESOURCE_LINKS = [
  { to: "/blog", label: "Blog" },
  { to: "/associations", label: "Associations" },
  { to: "/security", label: "Security" },
  { to: "/privacy", label: "Privacy" },
  { to: "/terms", label: "Terms" },
];

// Owner to supply real social profile URLs later — "#" placeholders for now.
const SOCIAL_LINKS = [
  { label: "Facebook", href: "#", Icon: FacebookLogo },
  { label: "Instagram", href: "#", Icon: InstagramLogo },
  { label: "YouTube", href: "#", Icon: YoutubeLogo },
  { label: "LinkedIn", href: "#", Icon: LinkedinLogo },
  { label: "TikTok", href: "#", Icon: TiktokLogo },
  { label: "X", href: "#", Icon: XLogo },
];

function FooterColumn({ title, links }: { title: string; links: { to: string; label: string }[] }) {
  return (
    <nav aria-label={title}>
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      <ul className="mt-3 space-y-2">
        {links.map((l) => (
          <li key={l.to + l.label}>
            <Link className="hover:underline" to={l.to}>
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Floating scroll-to-top button, bottom-left, appears after scrolling. */
function ScrollToTop() {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const onScroll = () => setVisible(window.scrollY > 400);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  if (!visible) return null;
  return (
    <Button
      size="icon"
      aria-label="Scroll to top"
      onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
      className="fixed bottom-6 left-6 z-50 rounded-full shadow-lg"
    >
      <ArrowUpIcon className="size-5" aria-hidden />
    </Button>
  );
}
/** Public marketing chrome: header + footer around the marketing site. */
export function MarketingLayout({ children }: { children: React.ReactNode }) {
  const { name: portalName, supportEmail } = usePortal();
  const { data: session, isPending } = useSession();
  const signedIn = !isPending && !!session?.user;
  const [drawer, setDrawer] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const year = new Date().getFullYear();
  const { pathname } = useLocation();
  // Marketing nav links must land at the top of the new page, not mid-scroll.
  // Static routes also pick up their per-page title + meta description here;
  // param routes (/integrations/:platform, /who-we-help/:trade) set their own
  // from page data and have no entry in PAGE_META, so there is no conflict.
  useEffect(() => {
    window.scrollTo(0, 0);
    const meta = PAGE_META[pathname];
    if (meta) {
      document.title = meta.title;
      let tag = document.querySelector('meta[name="description"]');
      if (!tag) {
        tag = document.createElement("meta");
        tag.setAttribute("name", "description");
        document.head.appendChild(tag);
      }
      tag.setAttribute("content", meta.description);
    }
  }, [pathname]);
  return (
    <div className="flex min-h-screen flex-col bg-background">
      {/* Operator-configured marketing snippet (chat widget etc.), injected as
          the last child of <body>. */}
      <EmbedScripts surface="marketing" />
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-12 w-full max-w-6xl items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2 text-lg font-bold tracking-tight text-primary">
            <BrandLogo name={portalName} />
          </Link>
          <nav className="hidden items-center gap-1 md:flex md:gap-2">
            {NAV_MENUS.map((menu) => (
              <Fragment key={menu.label}>
                <div className="group relative">
                <Button variant="ghost" size="sm" aria-haspopup="menu">
                  {menu.label}
                  <ChevronDownIcon
                    className="size-3.5 opacity-60 transition-transform duration-150 group-hover:rotate-180 group-focus-within:rotate-180"
                    aria-hidden
                  />
                </Button>
                <div className="invisible absolute left-0 top-full z-50 pt-1 opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                  <div className="min-w-44 rounded-lg border bg-popover/95 p-1 shadow-md ring-1 ring-foreground/10 backdrop-blur">
                    {menu.links.map((l) => (
                      <Link
                        key={l.to}
                        to={l.to}
                        className="flex min-h-7 select-none items-center rounded-md px-2 py-1 text-xs/relaxed text-popover-foreground outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                      >
                        {l.label}
                      </Link>
                    ))}
                  </div>
                </div>
                </div>
                {menu.label === "Product" && (
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/pricing">Pricing</Link>
                  </Button>
                )}
              </Fragment>
            ))}
            <AuthLinks signedIn={signedIn} />
          </nav>
          <div className="md:hidden">
            <Sheet
              open={drawer}
              onOpenChange={(v) => {
                setDrawer(v);
                if (!v) setOpenMenu(null);
              }}
            >
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Open menu">
                  <Bars3Icon className="size-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="flex w-72 flex-col gap-1 p-4">
                <Link to="/" onClick={() => setDrawer(false)} className="mb-2 flex items-center gap-2 text-lg font-bold tracking-tight text-primary">
                  <BrandLogo name={portalName} />
                </Link>
                {NAV_MENUS.map((menu) => {
                  const open = openMenu === menu.label;
                  return (
                    <Fragment key={menu.label}>
                      <div className="border-b last:border-b-0">
                      <Button
                        variant="ghost"
                        className="w-full justify-between"
                        aria-expanded={open}
                        onClick={() => setOpenMenu(open ? null : menu.label)}
                      >
                        {menu.label}
                        <ChevronDownIcon
                          className={`size-3.5 opacity-60 transition-transform ${open ? "rotate-180" : ""}`}
                          aria-hidden
                        />
                      </Button>
                      {open && (
                        <div className="mx-1 flex flex-col border-l border-border/70 pl-3 pb-2">
                          {menu.links.map((l) => (
                            <Button
                              key={l.to}
                              variant="ghost"
                              className="justify-start"
                              asChild
                              onClick={() => setDrawer(false)}
                            >
                              <Link to={l.to}>{l.label}</Link>
                            </Button>
                          ))}
                        </div>
                      )}
                      </div>
                      {menu.label === "Product" && (
                        <div className="border-b last:border-b-0">
                          <Button
                            variant="ghost"
                            className="w-full justify-start"
                            asChild
                            onClick={() => setDrawer(false)}
                          >
                            <Link to="/pricing">Pricing</Link>
                          </Button>
                        </div>
                      )}
                    </Fragment>
                  );
                })}
                <AuthLinks signedIn={signedIn} onNavigate={() => setDrawer(false)} />
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <ScrollToTop />
      <footer className="border-t">
        <div className="mx-auto w-full max-w-6xl px-4 py-10 text-sm text-muted-foreground">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <FooterColumn title="Product" links={PRODUCT_LINKS} />
            <FooterColumn title="Company" links={COMPANY_LINKS} />
            <FooterColumn title="Resources" links={RESOURCE_LINKS} />
            <div>
              <h3 className="text-sm font-semibold text-foreground">Contact</h3>
              <ul className="mt-3 space-y-2">
                <li>
                  <Link className="hover:underline" to="/contact">
                    Contact us
                  </Link>
                </li>
                {supportEmail && (
                  <li>
                    <a
                      className="inline-flex items-center gap-1.5 hover:underline"
                      href={`mailto:${supportEmail}`}
                    >
                      <EnvelopeIcon className="size-4" aria-hidden />
                      {supportEmail}
                    </a>
                  </li>
                )}
              </ul>
              <div className="mt-4 flex flex-wrap gap-1">
                {SOCIAL_LINKS.map(({ label, href, Icon }) => (
                  <a
                    key={label}
                    href={href}
                    aria-label={label}
                    className="flex size-8 items-center justify-center rounded-md hover:bg-muted hover:text-foreground"
                  >
                    <Icon className="size-5" aria-hidden />
                  </a>
                ))}
              </div>
            </div>
          </div>
          <div className="mt-8 flex flex-col gap-2 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <Link to="/" aria-label="Home">
                <BrandLogo name={portalName} />
              </Link>
              <p className="mt-2 text-xs">
                A product of{" "}
                <a
                  href="https://optasoft.net"
                  target="_blank"
                  rel="noreferrer"
                  className="hover:underline"
                >
                  Optasoft (Private) Limited
                </a>
              </p>
            </div>
            <p className="text-xs">© {year} {portalName}. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
