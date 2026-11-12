import React, { useState } from "react";
import { Globe } from "lucide-react";
import { cn } from "@common/lib/utils";

interface FaviconProps {
    src?: string | null;
    className?: string;
    // A 28px pinned tile rather than a 16px icon in a row.
    tile?: boolean;
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

const hostOf = (site: string) => {
    try {
        return new URL(site).hostname;
    } catch {
        return site;
    }
};

// The first letter of the site's name, so sites with no icon still look different from each other.
export const siteLetter = (site: string) => hostOf(site).replace(/^www\./, "").charAt(0).toUpperCase();

// An address with no name to take a letter from: an IP address, this computer, a local network name or a file.
export const isLocalSite = (site: string) => {
    if (/^file:/i.test(site)) return true;
    const host = hostOf(site).replace(/^\[|\]$/g, "").toLowerCase();
    return !host || /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":") || host === "localhost" || /\.(localhost|local)$/.test(host);
};

const SITE_COLOURS = 8;
const colourOf = (name: string) => {
    let sum = 0;
    for (const char of name) sum = (sum * 31 + char.charCodeAt(0)) >>> 0;
    return `rgb(var(--site-${(sum % SITE_COLOURS) + 1}))`;
};

// A site with no icon of its own: a globe for one with no name, otherwise its letter in white on a colour of its own.
// 16px in a row, or a 28px pinned tile.
export const SiteTile: React.FC<{ site: string; tile?: boolean; className?: string }> = ({ site, tile = false, className }) => {
    if (isLocalSite(site)) {
        return tile ? (
            <span aria-hidden className={cn("size-7 shrink-0 flex items-center justify-center rounded-control bg-muted text-muted-foreground", className)}>
                <Globe className="size-4" />
            </span>
        ) : (
            <Globe aria-hidden className={cn("size-4 shrink-0 text-muted-foreground", className)} />
        );
    }
    return (
        // Drawn from an attribute, so the letter never becomes part of the row's text.
        <span
            aria-hidden
            data-letter={siteLetter(site)}
            style={{ backgroundColor: colourOf(hostOf(site).replace(/^www\./, "")) }}
            className={cn(
                "shrink-0 flex items-center justify-center leading-none font-bold text-white before:content-[attr(data-letter)]",
                tile ? "size-7 rounded-control text-12" : "size-4 rounded-[5px] text-[9px]",
                className
            )}
        />
    );
};

export const Favicon: React.FC<FaviconProps> = ({ src, className, tile, site }) => {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);

    if (!src || src === failedSrc) {
        if (site) return <SiteTile site={site} tile={tile} className={tile ? undefined : className} />;
        return <Globe className={`size-4 shrink-0 text-muted-foreground ${className || ""}`} />;
    }

    // Dark icons on a transparent background would vanish in dark mode, so they get a light plate.
    return (
        <div className="size-4 shrink-0 overflow-hidden rounded-none flex items-center justify-center dark:bg-foreground dark:rounded-control dark:p-px">
            <img
                src={src}
                className="object-contain size-full"
                onError={() => setFailedSrc(src)}
                alt=""
            />
        </div>
    );
};
