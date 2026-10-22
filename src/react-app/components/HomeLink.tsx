import { Link } from "react-router-dom";

/** "Back to home" link shown above auth cards. */
export function HomeLink() {
  return (
    <p className="text-center text-xs/relaxed text-muted-foreground">
      <Link className="underline" to="/">
        ← Back to home
      </Link>
    </p>
  );
}
