// Plain <img>: these are static SVGs, so next/image has nothing to optimise.

// Width-to-height ratio of the logo-header / logo-footer artwork.
const LOGO_RATIO = 26162.82 / 7394.4;

/** The tile on its own, for spaces too tight for the wordmark. */
export function BrandMark({ size = 36 }: { size?: number }) {
  return (
    <img
      src="/logo-mark.svg"
      alt="Relavoi"
      width={size}
      height={size}
      className="flex-shrink-0"
    />
  );
}

/**
 * Tile plus wordmark. `onDark` swaps to the white-lettered artwork, which is
 * only legible on dark surfaces; the default navy lettering needs a light one.
 */
export function BrandLogo({ height = 32, onDark = false }: { height?: number; onDark?: boolean }) {
  return (
    <img
      src={onDark ? "/logo-footer.svg" : "/logo-header.svg"}
      alt="Relavoi"
      height={height}
      width={Math.round(height * LOGO_RATIO)}
      className="flex-shrink-0"
    />
  );
}
