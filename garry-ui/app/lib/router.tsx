import type { AnchorHTMLAttributes, ReactNode } from "react";
import { Link as RouterLink, useLocation } from "react-router";

/** A link inside the app (client side navigation). Same props as an anchor, with href. */
export default function Link({ href, children, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  return (
    <RouterLink to={href} {...rest}>
      {children}
    </RouterLink>
  );
}

/** The current path, without the query string. */
export function usePathname(): string {
  return useLocation().pathname;
}
