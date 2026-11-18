import React, { useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@common/lib/utils";

interface FaviconProps {
  src?: string | null;
  className?: string;
  // Shown instead of the site's letter when the site has no icon.
  fallback?: React.ReactNode;
  // The page's address or host, for its letter when it has no icon.
  site?: string;
}

// A saved site's own icon. It only ever asks that site, never a third-party icon service.
export const siteIcon = (url: string) => {
  try {
    return `${new URL(url).origin}/favicon.ico`;
  } catch {
    return null;
  }
};

// The first letter of the site's name, so sites with no icon still look different from each other, on a tile in a colour
// of its own (DESIGN.md section 8). The colour is the site's, from its name, never the chrome's.
const LETTER_TILES = 8;
const hostOf = (site: string) => {
  try {
    return new URL(site).hostname.replace(/^www\./, "");
  } catch {
    // Already a host.
    return site.replace(/^www\./, "");
  }
};
const tileOf = (site: string) => `var(--site-${([...hostOf(site)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % LETTER_TILES) + 1})`;

export const siteLetter = (site: string) => hostOf(site).charAt(0).toUpperCase();

// What dark mode puts a site's icon through. An icon that's dark all over, such as a black mark on nothing, comes out
// as the same shape in `ink`, which is light there. Any other icon comes out exactly as it went in. A page's icon can't
// be read from here, as it's another site's, so the filter does the looking:
//   1. `lit` is every pixel with any light or colour in it.
//   2. Blurred across the whole icon and stretched, that's `any`: solid everywhere if the icon has such a pixel, and
//      empty if it has none.
//   3. Where `any` is solid the icon is kept, and where it's empty its shape is filled with `ink`.
// It's in the page once, beside the app, and every icon points at it.
export const DarkMarkFilter: React.FC = () => (
  <svg aria-hidden width="0" height="0" className="absolute">
    <filter id="dark-mark" x="0" y="0" width="1" height="1" primitiveUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
      <feComponentTransfer in="SourceGraphic" result="steps">
        <feFuncR type="linear" slope="8" intercept="-3.2" />
        <feFuncG type="linear" slope="8" intercept="-3.2" />
        <feFuncB type="linear" slope="8" intercept="-3.2" />
      </feComponentTransfer>
      <feColorMatrix in="steps" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  1 1 1 0 0" result="lit" />
      <feComposite in="lit" in2="SourceGraphic" operator="in" result="litInside" />
      <feGaussianBlur in="litInside" stdDeviation="0.5" result="spread" />
      <feComponentTransfer in="spread" result="any">
        <feFuncA type="linear" slope="200" />
      </feComponentTransfer>
      <feFlood style={{ floodColor: "rgb(var(--ink))" }} result="ink" />
      <feComposite in="ink" in2="SourceGraphic" operator="in" result="shape" />
      <feComposite in="shape" in2="any" operator="out" result="lifted" />
      <feComposite in="SourceGraphic" in2="any" operator="in" result="kept" />
      <feMerge>
        <feMergeNode in="kept" />
        <feMergeNode in="lifted" />
      </feMerge>
    </filter>
  </svg>
);

export const Favicon: React.FC<FaviconProps> = ({ src, className, fallback, site }) => {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  if (!src || src === failedSrc) {
    if (fallback) return <>{fallback}</>;
    const letter = site ? siteLetter(site) : "";
    if (letter) {
      // Drawn from an attribute, so the letter never becomes part of the row's text.
      return (
        <span
          aria-hidden
          data-letter={letter}
          style={{ backgroundColor: tileOf(site ?? "") }}
          className={cn(
            "size-4 shrink-0 flex items-center justify-center rounded-[5px] text-[9px] leading-none font-medium text-white before:content-[attr(data-letter)]",
            className,
          )}
        />
      );
    }
    return <Globe className={cn("size-4 shrink-0 text-ink-3", className)} strokeWidth={1.75} />;
  }

  // Drawn as the site gives it, with nothing behind it or round it. In dark mode a mark that's dark all over would
  // vanish, so that one kind is drawn light (see DarkMarkFilter).
  return (
    <div className={cn("size-4 shrink-0 flex items-center justify-center", className)}>
      <img src={src} className="object-contain size-full dark:[filter:url(#dark-mark)]" onError={() => setFailedSrc(src)} alt="" />
    </div>
  );
};
