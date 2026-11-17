import { Link } from "react-router-dom";
import { Button } from "../../components/ui/button";

/** Shared post-purchase CTA block: Growth Fit Call first, next product second. */
export function ThankYouNextSteps({
  title,
  body,
  nextLabel,
  nextHref,
}: {
  title: string;
  body: string;
  nextLabel: string;
  nextHref: string;
}) {
  return (
    <div className="mt-8 rounded-xl border bg-muted/40 p-5">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link to="/book">Book a Growth Fit Call</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link to={nextHref}>{nextLabel}</Link>
        </Button>
      </div>
    </div>
  );
}
