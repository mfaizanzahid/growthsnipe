import { Link } from "react-router-dom";
import { ShieldCheckIcon } from "@heroicons/react/24/outline";
import type { ComponentType, ReactNode } from "react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "../ui/accordion";

/** Small uppercase section label used above headings. */
export function Eyebrow({ children }: { children: ReactNode }) {
  return (
    <p className="mb-3 inline-block rounded-full border px-3 py-1 text-xs font-medium text-muted-foreground">
      {children}
    </p>
  );
}

/** Minimalist hero backdrop motif: hand-built inline SVG, no assets. */
export function HeroBackdrop() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full text-brand-100 dark:text-brand-950"
      preserveAspectRatio="xMidYMid slice"
      viewBox="0 0 800 400"
    >
      <defs>
        <pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
          <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="800" height="400" fill="url(#hero-grid)" opacity="0.55" />
      <circle cx="400" cy="150" r="120" fill="currentColor" opacity="0.35" />
      <circle cx="400" cy="150" r="70" fill="currentColor" opacity="0.4" />
      <path d="M 120 300 L 400 150 L 680 300" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.8" />
      <circle cx="120" cy="300" r="6" fill="currentColor" />
      <circle cx="400" cy="150" r="6" fill="currentColor" />
      <circle cx="680" cy="300" r="6" fill="currentColor" />
    </svg>
  );
}

/** Centered page hero used across marketing pages. */
export function PageHero({ eyebrow, title, lede }: { eyebrow: string; title: ReactNode; lede: ReactNode }) {
  return (
    <section className="relative overflow-hidden">
      <HeroBackdrop />
      <div className="mx-auto w-full max-w-6xl px-4 py-14 text-center sm:py-20">
        <Eyebrow>{eyebrow}</Eyebrow>
        <h1 className="mx-auto max-w-3xl text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">{lede}</p>
      </div>
    </section>
  );
}

/** Section heading block: centered title + supporting line. */
export function SectionHeading({
  eyebrow,
  title,
  body,
}: {
  eyebrow?: string;
  title: string;
  body?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow && (
        <p className="mb-2 text-xs font-semibold tracking-widest text-primary uppercase">{eyebrow}</p>
      )}
      <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      {body && <p className="mt-3 text-muted-foreground">{body}</p>}
    </div>
  );
}

/** Bordered icon tile: glyph in a bordered box above title + one-line body. */
export function IconTile({
  icon: Icon,
  title,
  body,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  body: string;
}) {
  return (
    <Card>
      <CardHeader>
        <span className="mb-2 flex size-10 items-center justify-center rounded-lg border bg-muted/50">
          <Icon className="size-5 text-primary" aria-hidden />
        </span>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <CardDescription>{body}</CardDescription>
      </CardContent>
    </Card>
  );
}

/** Horizontal stat band: big values with small labels. */
export function StatBand({ stats }: { stats: { value: string; label: string }[] }) {
  return (
    <section className="border-y bg-muted/40">
      <dl className="mx-auto grid w-full max-w-6xl grid-cols-2 gap-6 px-4 py-8 text-center lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="flex flex-col">
            <dt className="order-2 mt-1 block text-sm text-muted-foreground">{s.label}</dt>
            <dd className="order-1 text-3xl font-bold tracking-tight text-primary">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** 3-step connector visual: three numbered nodes joined by a line. Inline SVG only. */
export function StepsConnector() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 600 48"
      className="mx-auto mt-8 hidden h-12 w-full max-w-2xl text-primary md:block"
      fill="none"
    >
      <line x1="60" y1="20" x2="540" y2="20" stroke="currentColor" strokeWidth="2" strokeDasharray="6 6" opacity="0.5" />
      {[60, 300, 540].map((cx, i) => (
        <g key={cx}>
          <circle cx={cx} cy="20" r="18" fill="currentColor" opacity="0.12" />
          <circle cx={cx} cy="20" r="18" stroke="currentColor" strokeWidth="2" />
          <text x={cx} y="26" textAnchor="middle" fontSize="16" fontWeight="700" fill="currentColor">
            {i + 1}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Blog/empty-state illustration: minimalist inline SVG, no assets. */
export function BlogArt() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 200 120"
      className="mx-auto h-28 w-auto text-brand-200 dark:text-brand-900"
      fill="none"
    >
      <rect x="30" y="14" width="140" height="92" rx="8" stroke="currentColor" strokeWidth="3" />
      <line x1="30" y1="36" x2="170" y2="36" stroke="currentColor" strokeWidth="3" />
      <circle cx="42" cy="25" r="3" fill="currentColor" />
      <circle cx="52" cy="25" r="3" fill="currentColor" />
      <line x1="46" y1="56" x2="154" y2="56" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      <line x1="46" y1="70" x2="130" y2="70" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.6" />
      <line x1="46" y1="84" x2="110" y2="84" stroke="currentColor" strokeWidth="5" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

/** Revenue line chart with gradient area fill and a flagged dip. Inline SVG, brand tokens, dark-mode safe. */
export function TrendChart() {
  return (
    <svg viewBox="0 0 320 160" fill="none" aria-hidden className="w-full text-primary">
      <defs>
        <linearGradient id="trend-area-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="currentColor" stopOpacity="0.25" />
          <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[24, 58, 92, 126].map((y) => (
        <line key={y} x1="12" x2="308" y1={y} y2={y} stroke="currentColor" strokeOpacity="0.14" strokeDasharray="3 5" />
      ))}
      <path
        d="M20 116 C 60 112 90 122 128 124 C 166 126 186 92 216 84 C 246 76 280 52 300 44 L300 140 L20 140 Z"
        fill="url(#trend-area-fill)"
      />
      <path
        d="M20 116 C 60 112 90 122 128 124 C 166 126 186 92 216 84 C 246 76 280 52 300 44"
        stroke="currentColor"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <line x1="128" x2="128" y1="124" y2="140" stroke="currentColor" strokeOpacity="0.4" strokeDasharray="3 4" />
      <circle cx="128" cy="124" r="10" stroke="#f59e0b" strokeOpacity="0.35" />
      <circle cx="128" cy="124" r="5" fill="#f59e0b" />
    </svg>
  );
}

/** Referral-source bar chart with one flagged bar. Inline SVG, brand tokens. */
export function BarsChart() {
  const bars = [
    { label: "Realtor", height: 44, className: "text-amber-500" },
    { label: "Past client", height: 92, className: "text-primary" },
    { label: "Repeat", height: 78, className: "text-primary" },
    { label: "Online", height: 62, className: "text-primary" },
  ];
  return (
    <svg viewBox="0 0 320 160" fill="none" aria-hidden className="w-full">
      {[24, 58, 92, 126].map((y) => (
        <line
          key={y}
          x1="12"
          x2="308"
          y1={y}
          y2={y}
          stroke="currentColor"
          strokeOpacity="0.12"
          strokeDasharray="3 5"
          className="text-muted-foreground"
        />
      ))}
      {bars.map((b, i) => {
        const x = 26 + i * 70;
        const y = 140 - b.height;
        return (
          <g key={b.label}>
            <rect
              x={x}
              y={y}
              width="46"
              height={b.height}
              rx="6"
              fill="currentColor"
              className={b.className}
              opacity={i === 0 ? 1 : 0.85}
            />
            <text
              x={x + 23}
              y="156"
              textAnchor="middle"
              fontSize="11"
              fill="currentColor"
              className="text-muted-foreground"
            >
              {b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Composition donut (revenue by source). Inline SVG, brand + semantic colors. */
export function DonutChart() {
  const r = 40;
  const c = 2 * Math.PI * r;
  const segments = [
    { pct: 0.64, className: "text-primary", label: "Repeat" },
    { pct: 0.21, className: "text-amber-500", label: "Realtor" },
    { pct: 0.15, className: "text-emerald-500", label: "Online" },
  ];
  let offset = 0;
  return (
    <svg viewBox="0 0 120 120" fill="none" aria-hidden className="h-full w-full">
      <g transform="rotate(-90 60 60)">
        {segments.map((s) => {
          const len = s.pct * c;
          const el = (
            <circle
              key={s.label}
              cx="60"
              cy="60"
              r={r}
              strokeWidth="18"
              stroke="currentColor"
              strokeLinecap="butt"
              className={s.className}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset * c}
            />
          );
          offset += s.pct;
          return el;
        })}
      </g>
      <text
        x="60"
        y="57"
        textAnchor="middle"
        fontSize="20"
        fontWeight="700"
        fill="currentColor"
        className="text-foreground"
      >
        64%
      </text>
      <text
        x="60"
        y="70"
        textAnchor="middle"
        fontSize="10"
        fill="currentColor"
        className="text-muted-foreground"
      >
        Repeat
      </text>
    </svg>
  );
}

/** Hub-and-spoke visual: your live data in the middle, seven advisors around it. */
export function AdvisorHub() {
  const satellites = [
    { x: 300, y: 12 },
    { x: 384, y: 52 },
    { x: 405, y: 144 },
    { x: 347, y: 217 },
    { x: 253, y: 217 },
    { x: 195, y: 144 },
    { x: 216, y: 52 },
  ];
  return (
    <svg viewBox="0 0 600 240" fill="none" aria-hidden className="mx-auto w-full max-w-lg text-primary">
      {satellites.map((s) => (
        <line
          key={`line-${s.x}`}
          x1="300"
          y1="120"
          x2={s.x}
          y2={s.y}
          stroke="currentColor"
          strokeOpacity="0.35"
          strokeDasharray="4 6"
        />
      ))}
      <circle cx="300" cy="120" r="30" fill="currentColor" opacity="0.1" />
      <circle cx="300" cy="120" r="30" stroke="currentColor" strokeWidth="2" />
      <circle cx="300" cy="120" r="6" fill="currentColor" />
      {satellites.map((s) => (
        <circle key={`dot-${s.x}`} cx={s.x} cy={s.y} r="8" fill="currentColor" opacity="0.85" />
      ))}
    </svg>
  );
}

/** Product-style morning briefing mockup: line chart, referral bars, and three decisions. */
export function BriefingMockup() {
  return (
    <Card className="mx-auto w-full max-w-2xl border-0 bg-background/90 shadow-xl backdrop-blur">
      <CardHeader className="pb-2">
        <p className="text-xs font-semibold tracking-wide text-primary uppercase">Tuesday · Morning briefing</p>
        <CardTitle className="text-lg">This morning's briefing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-lg border bg-muted/30 p-4">
          <p className="mb-2 flex flex-wrap items-center gap-2 text-sm font-semibold">
            Revenue, trailing 30 days
            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-400">
              ▲ ticket +9%
            </span>
          </p>
          <TrendChart />
        </div>
        <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="mb-2 text-sm font-semibold">Referrals by source</p>
            <BarsChart />
          </div>
          <div className="rounded-lg border bg-muted/30 p-4">
            <p className="mb-2 text-sm font-semibold">Decision list</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-amber-500" />
                Realtor flow down 40% — call Prather, 2nd St listing.
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary" />
                Add-on quoting is leaking ~$35. Fix the template.
              </li>
              <li className="flex gap-2">
                <span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-emerald-500" />
                Repeat clients are climbing. Extend the referral ask.
              </li>
            </ul>
          </div>
        </div>
        <p className="text-center text-xs text-muted-foreground">
          Illustrative briefing — shown with sample figures.
        </p>
      </CardContent>
    </Card>
  );
}

/** Accordion FAQ list used by every marketing FAQ section. */
export function Faq({ items }: { items: { q: string; a: string }[] }) {
  return (
    <Accordion type="single" collapsible className="mx-auto mt-8 max-w-3xl rounded-lg border px-4">
      {items.map((item, i) => (
        <AccordionItem key={item.q} value={`faq-${i}`}>
          <AccordionTrigger>{item.q}</AccordionTrigger>
          <AccordionContent>{item.a}</AccordionContent>
        </AccordionItem>
      ))}
    </Accordion>
  );
}

/** Trust strip: the no-storage differentiator, reused across pages. */
export function TrustCallout() {
  return (
    <section className="border-t bg-muted/40">
      <div className="mx-auto flex w-full max-w-4xl flex-col items-center gap-3 px-4 py-12 text-center">
        <ShieldCheckIcon className="size-8 text-primary" aria-hidden />
        <h2 className="text-2xl font-bold tracking-tight">Nothing stored. Nothing exported.</h2>
        <p className="max-w-2xl text-muted-foreground">
          Tradesmatic reads your data live from your own software. Nothing sits on our servers.
          Disconnect any time — access ends with it.
        </p>
        <Button variant="outline" asChild>
          <Link to="/security">How we handle your data</Link>
        </Button>
      </div>
    </section>
  );
}

/**
 * Customer testimonial card with 5 gold stars, full name, designation, and company.
 */
export function Testimonial({
  quote,
  name,
  detail,
}: {
  quote: string;
  name: string;
  detail: string;
}) {
  return (
    <Card>
      <CardHeader>
        <div className="mb-1 flex gap-0.5">
          {[...Array(5)].map((_, i) => (
            <svg
              key={i}
              aria-hidden="true"
              className="size-4 text-yellow-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          ))}
        </div>
        <CardTitle className="text-base font-medium leading-relaxed">"{quote}"</CardTitle>
      </CardHeader>
      <CardContent className="flex items-center gap-3">
        <span
          aria-hidden
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary"
        >
          {name.charAt(0)}
        </span>
        <CardDescription>
          <span className="font-semibold text-foreground">{name}</span>
          <br />
          {detail}
        </CardDescription>
      </CardContent>
    </Card>
  );
}

/** Badge + single-question callout used on feature pages. */
export function FeatureBadge({ children }: { children: ReactNode }) {
  return <Badge variant="secondary">{children}</Badge>;
}

/** Closing call-to-action band used at the foot of marketing pages. */
export function CtaBand({ title, body }: { title: string; body: string }) {
  return (
    <section className="border-t">
      <div className="mx-auto w-full max-w-6xl px-4 py-14">
        <div className="rounded-2xl border bg-primary px-6 py-12 text-center text-primary-foreground">
          <h2 className="mx-auto max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
          <p className="mx-auto mt-3 max-w-xl opacity-90">{body}</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" variant="secondary" asChild>
              <Link to="/signup">Start your free trial</Link>
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
              asChild
            >
              <Link to="/pricing">Compare plans</Link>
            </Button>
          </div>
          <p className="mt-4 text-xs opacity-75">30-day free trial · No card required</p>
        </div>
      </div>
    </section>
  );
}
