import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { LockClosedIcon } from "@heroicons/react/24/outline";
import { MarketingLayout } from "../../components/marketing/MarketingLayout";
import { PageHero } from "../../components/marketing/MarketingBits";
import { Button } from "../../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import { Checkbox } from "../../components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { SafepayPayment } from "../../components/SafepayPayment";
import { BillingAddressFields, EMPTY_BILLING_ADDRESS, billingAddressValid, requiresStateCode, type BillingAddress } from "../../components/BillingAddressFields";
import { COUNTRIES, DEFAULT_COUNTRY_CODE } from "../../lib/countries";
import { formatMoney } from "../../lib/money";

interface Product {
  slug: string;
  name: string;
  amountMinor: number;
  currency: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Guest one-time checkout: order summary, buyer details, Safepay card capture, confirm. */
export function OneTimeCheckout({
  slug,
  eyebrow,
  title,
  lede,
  includes,
  checkoutNote,
  thankYouPath,
}: {
  slug: string;
  eyebrow: string;
  title: string;
  lede: string;
  includes: string[];
  checkoutNote: string;
  thankYouPath: string;
}) {
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [failed, setFailed] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [countryCode, setCountryCode] = useState(DEFAULT_COUNTRY_CODE);
  const [businessName, setBusinessName] = useState("");
  const [billingAddress, setBillingAddress] = useState<BillingAddress>(EMPTY_BILLING_ADDRESS);
  const [agreed, setAgreed] = useState(false);
  const [session, setSession] = useState<{ orderId: string; tracker: string; clientToken: string; environment: string; amountMinor: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<{
    code: string;
    discountMinor: number;
    amountMinor: number;
    currency: string;
    expiresOn: string;
  } | null>(null);
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [showCouponField, setShowCouponField] = useState(false);

  useEffect(() => {
    fetch("/api/one-time/products")
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load products");
        return (await r.json()) as { products?: Product[] };
      })
      .then((data) => {
        const found = (data.products ?? []).find((p) => p.slug === slug) ?? null;
        if (!found) setFailed(true);
        else setProduct(found);
      })
      .catch(() => setFailed(true));
  }, [slug]);

  async function applyCoupon() {
    if (!product) return;
    if (!EMAIL_RE.test(email.trim())) {
      toast.error("Enter a valid email first");
      return;
    }
    if (!couponCode.trim()) {
      toast.error("Enter a credit or discount code");
      return;
    }
    setApplyingCoupon(true);
    try {
      const res = await fetch("/api/one-time/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug, email: email.trim(), code: couponCode.trim() }),
      });
      const data = (await res.json()) as {
        code?: string;
        discountMinor?: number;
        amountMinor?: number;
        currency?: string;
        expiresOn?: string;
        error?: string;
      };
      if (!res.ok || !data.code || data.discountMinor == null || data.amountMinor == null) {
        throw new Error(data.error ?? "Could not apply this code");
      }
      setAppliedCoupon({
        code: data.code,
        discountMinor: data.discountMinor,
        amountMinor: data.amountMinor,
        currency: data.currency ?? product.currency,
        expiresOn: data.expiresOn ?? "",
      });
      toast.success(`Code applied. You save ${formatMoney(data.discountMinor, product.currency)}.`);
    } catch (err) {
      setAppliedCoupon(null);
      toast.error(err instanceof Error ? err.message : "Could not apply this code");
    } finally {
      setApplyingCoupon(false);
    }
  }

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!product) return;
    if (!name.trim()) {
      toast.error("Enter your name");
      return;
    }
    if (!EMAIL_RE.test(email.trim())) {
      toast.error("Enter a valid email address");
      return;
    }
    if (couponCode.trim() && !appliedCoupon) {
      toast.error("Apply your code first, or clear it");
      return;
    }
    const selected = COUNTRIES.find((c) => c.code === countryCode);
    const digits = phone.replace(/\D/g, "");
    if (!selected || digits.length < 7 || digits.length > 15) {
      toast.error("Enter a valid phone number");
      return;
    }
    if (!billingAddressValid(billingAddress, countryCode)) {
      toast.error(
        requiresStateCode(countryCode)
          ? "Enter your billing street address, city and 2-letter state code"
          : "Enter your billing street address, city and state",
      );
      return;
    }
    setPending(true);
    try {
      const res = await fetch("/api/one-time/session", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Idempotency-Key": crypto.randomUUID() },
        body: JSON.stringify({
          slug,
          email: email.trim(),
          name: name.trim(),
          phone: `+${selected.dial}${digits}`,
          country: selected.code,
          businessName: businessName.trim() || undefined,
          couponCode: appliedCoupon?.code,
        }),
      });
      const data = (await res.json()) as {
        orderId?: string;
        tracker?: string;
        clientToken?: string;
        environment?: string;
        amountMinor?: number;
        paid?: boolean;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? "Could not start payment");
      if (data.paid && data.orderId) {
        toast.success("Order complete. Check your inbox for next steps.");
        navigate(`${thankYouPath}?order=${data.orderId}`);
        return;
      }
      if (!data.tracker || !data.clientToken || !data.orderId) throw new Error(data.error ?? "Could not start payment");
      setSession({ orderId: data.orderId, tracker: data.tracker, clientToken: data.clientToken, environment: data.environment ?? "sandbox", amountMinor: data.amountMinor ?? product.amountMinor });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not start payment");
    } finally {
      setPending(false);
    }
  }

  async function confirm(tracker: string) {
    if (!session) return;
    setConfirming(true);
    try {
      const res = await fetch("/api/one-time/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderId: session.orderId, tracker }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Payment could not be confirmed");
      toast.success("Payment successful. Check your inbox for next steps.");
      navigate(`${thankYouPath}?order=${session.orderId}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Payment could not be confirmed");
      setSession(null);
    } finally {
      setConfirming(false);
    }
  }

  return (
    <MarketingLayout>
      <PageHero eyebrow={eyebrow} title={title} lede={lede} />
      <section className="mx-auto w-full max-w-3xl px-4 pb-14">
        {failed ? (
          <Card>
            <CardContent className="pt-6 text-center text-sm text-muted-foreground">
              This offer is not available right now. <Link className="underline" to="/book">Book a call</Link> and we will help.
            </CardContent>
          </Card>
        ) : !product ? (
          <Card>
            <CardContent className="pt-6 text-center text-sm text-muted-foreground">Loading…</CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Order summary</CardTitle>
              <CardDescription>
                {product.name}, {formatMoney(product.amountMinor, product.currency)} one-time
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <ul className="space-y-1 text-sm text-muted-foreground">
                {includes.map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <span aria-hidden className="font-bold text-primary">✓</span>
                    {item}
                  </li>
                ))}
              </ul>
              <div className="flex justify-between border-t pt-3 text-base font-semibold">
                <span>Due today</span>
                <span className="flex items-baseline gap-2">
                  {appliedCoupon && appliedCoupon.discountMinor > 0 && (
                    <span className="text-sm font-normal text-muted-foreground line-through">
                      {formatMoney(product.amountMinor, product.currency)}
                    </span>
                  )}
                  <span>
                    {formatMoney(appliedCoupon?.amountMinor ?? product.amountMinor, product.currency)}
                  </span>
                </span>
              </div>
              {appliedCoupon && (
                <p className="text-sm text-green-700 dark:text-green-400">
                  {appliedCoupon.code} applied. You save {formatMoney(appliedCoupon.discountMinor, product.currency)}.
                  {appliedCoupon.expiresOn ? ` Valid through ${appliedCoupon.expiresOn}.` : ""}
                </p>
              )}
              {session ? (
                <div className="space-y-3">
                  <SafepayPayment
                    tracker={session.tracker}
                    clientToken={session.clientToken}
                    environment={session.environment}
                    mode="payment"
                    billingAddress={billingAddress}
                    country={countryCode}
                    submitLabel={`Pay ${formatMoney(session.amountMinor, product.currency)}`}
                    onSuccess={confirm}
                    onError={(m) => toast.error(m)}
                    onCancel={() => setSession(null)}
                  />
                  {confirming && <p className="text-center text-sm text-muted-foreground">Confirming your payment…</p>}
                  <p className="flex items-center justify-center gap-1.5 text-xs font-medium text-green-700 dark:text-green-400">
                    <LockClosedIcon className="size-3.5" aria-hidden />
                    All payments are secured by 256-bit encryption
                  </p>
                </div>
              ) : (
                <form onSubmit={start} className="space-y-4">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="oto-name">Full name</Label>
                      <Input id="oto-name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="oto-email">Work email</Label>
                      <Input
                        id="oto-email"
                        type="email"
                        value={email}
                        onChange={(e) => {
                          setEmail(e.target.value);
                          setAppliedCoupon(null);
                        }}
                        required
                        maxLength={200}
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="oto-phone">Phone</Label>
                      <div className="flex gap-2">
                        <Select value={countryCode} onValueChange={setCountryCode}>
                          <SelectTrigger className="w-36 shrink-0" aria-label="Country code">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {COUNTRIES.map((c) => (
                              <SelectItem key={`${c.code}-${c.dial}`} value={c.code}>
                                {c.name} +{c.dial}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Input id="oto-phone" inputMode="tel" placeholder="3001234567" value={phone} onChange={(e) => setPhone(e.target.value.replace(/\D/g, ""))} required />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="oto-business">Business name (optional)</Label>
                      <Input id="oto-business" value={businessName} onChange={(e) => setBusinessName(e.target.value)} maxLength={160} />
                    </div>
                  </div>
                  <BillingAddressFields value={billingAddress} onChange={setBillingAddress} idPrefix="oto-billing" countryCode={countryCode} layout="inline" />
                  {!showCouponField ? (
                    <button
                      type="button"
                      className="text-sm font-medium text-primary underline underline-offset-4"
                      onClick={() => setShowCouponField(true)}
                    >
                      Have a credit or discount code?
                    </button>
                  ) : (
                    <div className="space-y-2 rounded-md border p-3">
                      <Label htmlFor="oto-coupon">Credit or discount code</Label>
                      <div className="flex gap-2">
                        <Input
                          id="oto-coupon"
                          value={couponCode}
                          onChange={(e) => {
                            setCouponCode(e.target.value.toUpperCase());
                            setAppliedCoupon(null);
                          }}
                          placeholder="Enter code"
                          maxLength={64}
                          autoComplete="off"
                        />
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => void applyCoupon()}
                          disabled={applyingCoupon || !couponCode.trim()}
                        >
                          {applyingCoupon ? "Applying…" : "Apply"}
                        </Button>
                      </div>
                    </div>
                  )}
                  <label className="flex cursor-pointer items-start gap-2 text-xs/relaxed text-muted-foreground">
                    <Checkbox checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} aria-label="Agree to Terms of Service and Privacy Policy" />
                    <span>
                      I agree to the <a className="underline" href="/terms" target="_blank" rel="noreferrer">Terms of Service</a>{" "}
                      and <a className="underline" href="/privacy" target="_blank" rel="noreferrer">Privacy Policy</a>, and I
                      understand no business outcome is guaranteed.
                    </span>
                  </label>
                  <Button type="submit" className="w-full" disabled={pending || !agreed || !billingAddressValid(billingAddress, countryCode)}>
                    {pending
                      ? "Starting payment…"
                      : (appliedCoupon?.amountMinor ?? product.amountMinor) === 0
                        ? "Complete order"
                        : `Continue to payment, ${formatMoney(appliedCoupon?.amountMinor ?? product.amountMinor, product.currency)}`}
                  </Button>
                  <p className="text-center text-xs text-muted-foreground">{checkoutNote}</p>
                </form>
              )}
            </CardContent>
          </Card>
        )}
      </section>
    </MarketingLayout>
  );
}
