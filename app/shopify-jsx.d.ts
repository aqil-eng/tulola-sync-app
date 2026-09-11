// @shopify/app-bridge-types declares <s-app-nav> globally, but with npm's
// dependency resolution here (no pnpm lockfile pinning exact transitive
// versions, unlike kirri-portal/soma-kurasi-shipping) it isn't reliably
// reached by TypeScript's module graph. Minimal fallback so `tsc --noEmit`
// doesn't depend on that. Safe no-op once it resolves on its own.
declare global {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": React.DetailedHTMLProps<React.HTMLAttributes<HTMLElement>, HTMLElement>;
    }
  }
}

export {};
