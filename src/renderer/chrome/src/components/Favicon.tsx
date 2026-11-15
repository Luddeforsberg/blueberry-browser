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
                    className={cn("size-4 shrink-0 flex items-center justify-center rounded-[5px] text-[9px] leading-none font-medium text-white before:content-[attr(data-letter)]", className)}
                />
            );
        }
        return <Globe className={cn("size-4 shrink-0 text-ink-3", className)} />;
    }

    // Dark icons on a transparent background would vanish in dark mode, so they get a light plate.
    return (
        <div className={cn("size-4 shrink-0 overflow-hidden rounded-none flex items-center justify-center dark:bg-ink dark:rounded-[4px] dark:p-px", className)}>
            <img
                src={src}
                className="object-contain size-full"
                onError={() => setFailedSrc(src)}
                alt=""
            />
        </div>
    );
};
