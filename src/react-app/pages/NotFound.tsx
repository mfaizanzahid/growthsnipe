import { Link } from "react-router-dom";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { MarketingLayout } from "../components/marketing/MarketingLayout";
import { Button } from "../components/ui/button";

export function NotFound() {
  return (
    <MarketingLayout>
      <section className="mx-auto flex w-full max-w-3xl flex-col items-center px-4 py-20 text-center">
        <span className="flex size-14 items-center justify-center rounded-2xl bg-muted">
          <ExclamationTriangleIcon className="size-7 text-muted-foreground" aria-hidden />
        </span>
        <p className="mt-6 text-6xl font-bold tracking-tight text-primary">404</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">
          This page wandered off the job site
        </h1>
        <p className="mt-3 max-w-md text-muted-foreground">
          The address you followed doesn&apos;t lead anywhere: it may have moved, been renamed,
          or never existed.
        </p>
        <div className="mt-8 flex flex-col gap-2 sm:flex-row">
          <Button asChild>
            <Link to="/">Back to home</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link to="/contact">Contact us</Link>
          </Button>
        </div>
      </section>
    </MarketingLayout>
  );
}
