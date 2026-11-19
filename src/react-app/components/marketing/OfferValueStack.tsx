import { CheckIcon, PhoneIcon } from "@heroicons/react/24/outline";
import { Link } from "react-router-dom";
import { OFFER_VALUE_DISCLAIMER, type OfferBonus, type OfferStack } from "../../../lib/offers";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "../ui/card";

function BonusBadge({ kind }: { kind: OfferBonus["kind"] }) {
  if (kind === "call") {
    return (
      <Badge variant="success" className="gap-1">
        <PhoneIcon className="size-3" aria-hidden />
        Bonus call
      </Badge>
    );
  }
  if (kind === "credit") return <Badge variant="secondary">Bonus credit</Badge>;
  return <Badge variant="success">Bonus</Badge>;
}

/** Main offer CTA, shared by the value stack and page sections. */
export function OfferCtaButton({
  stack,
  size = "lg",
  variant = "default",
  className,
  label,
}: {
  stack: OfferStack;
  size?: "default" | "sm" | "lg";
  variant?: "default" | "outline" | "secondary";
  className?: string;
  /** Override the stack CTA text while keeping its destination. */
  label?: string;
}) {
  const { label: defaultLabel, href } = stack.cta;
  const buttonLabel = label ?? defaultLabel;
  return (
    <Button size={size} variant={variant} className={className} asChild>
      {href.startsWith("#") ? <a href={href}>{buttonLabel}</a> : <Link to={href}>{buttonLabel}</Link>}
    </Button>
  );
}

/**
 * Hormozi-style value stack: core offer with an Included checklist, price
 * anchor, obstacle-focused bonuses and estimated values. Every dollar label
 * comes from src/lib/offers.ts.
 */
export function OfferValueStack({ stack, className }: { stack: OfferStack; className?: string }) {
  const discounted = stack.price !== null && stack.totalValue.amountMinor > stack.price.amountMinor;

  return (
    <Card className={className} aria-label={`${stack.core.name} value stack`}>
      <CardHeader className="space-y-2">
        <p className="text-xs font-semibold tracking-widest text-primary uppercase">{stack.eyebrow}</p>
        <CardTitle className="text-2xl">{stack.core.name}</CardTitle>
        <p className="text-sm text-muted-foreground">{stack.core.body}</p>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="rounded-lg border bg-muted/40 p-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Core offer</p>
              <p className="font-medium">{stack.core.name}</p>
            </div>
            {stack.core.value ? <p className="shrink-0 font-semibold">{stack.core.value.label}</p> : null}
          </div>
          <ul className="mt-3 space-y-1 border-t pt-3">
            {stack.core.features.map((feature) => (
              <li key={feature} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-muted-foreground">{feature}</span>
                <span className="flex shrink-0 items-center gap-1 font-medium text-primary">
                  <CheckIcon className="size-4" aria-hidden />
                  Included
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold">Bonuses included</p>
            <p className="text-xs text-muted-foreground">{stack.bonuses.length} bonuses</p>
          </div>
          <ul className="mt-3 space-y-2">
            {stack.bonuses.map((bonus) => (
              <li
                key={bonus.id}
                className="flex items-start justify-between gap-4 rounded-lg border bg-background p-3"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-medium">{bonus.name}</p>
                    <BonusBadge kind={bonus.kind} />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{bonus.body}</p>
                </div>
                <p className="shrink-0 text-sm font-semibold">{bonus.value.label}</p>
              </li>
            ))}
          </ul>
        </div>

        <dl className="space-y-1 rounded-lg border p-4 text-sm">
          <div className="flex items-baseline justify-between gap-4">
            <dt className="text-muted-foreground">{stack.totalLabel}</dt>
            <dd className={discounted ? "text-muted-foreground line-through" : "font-semibold"}>
              {stack.totalValue.label}
            </dd>
          </div>
          <div className="flex items-center justify-between gap-4">
            <dt className="text-muted-foreground">{stack.priceLabel}</dt>
            <dd>
              {stack.priceCta ? (
                <Button size="sm" asChild>
                  <Link to={stack.priceCta.href}>{stack.priceCta.label}</Link>
                </Button>
              ) : (
                <span className="flex items-center gap-2">
                  <span className="text-xl font-bold text-primary">
                    {stack.priceDisplay ?? stack.price?.label ?? ""}
                  </span>
                  {stack.discountPercent ? (
                    <Badge variant="success">{stack.discountPercent}% off</Badge>
                  ) : null}
                </span>
              )}
            </dd>
          </div>
        </dl>

        {stack.id === "engine" ? (
          <p className="mx-auto max-w-xl text-center text-xs text-muted-foreground">{stack.ctaNote}</p>
        ) : (
          <div className="space-y-2 pt-1 text-center">
            <OfferCtaButton stack={stack} />
            <p className="mx-auto max-w-xl text-xs text-muted-foreground">{stack.ctaNote}</p>
          </div>
        )}

        {stack.priceNote ? <p className="text-xs text-muted-foreground">{stack.priceNote}</p> : null}
        <p className="text-xs text-muted-foreground">{OFFER_VALUE_DISCLAIMER}</p>
      </CardContent>
    </Card>
  );
}
