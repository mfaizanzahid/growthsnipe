import { Link } from "react-router-dom";
import { BrandLogo } from "./BrandLogo";
import { usePortalName } from "../hooks/usePortalName";

/** Logo lockup for logged-out auth pages (image logo, portal-name fallback). Links home. */
export function AuthBrand() {
  const portalName = usePortalName();
  return (
    <Link to="/" aria-label="Home">
      <BrandLogo
        name={portalName}
        imgClassName="h-10"
        textClassName="text-center text-3xl font-bold tracking-tight text-primary"
      />
    </Link>
  );
}
