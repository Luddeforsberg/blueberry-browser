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

// The first letter of the site's name, so sites with no icon still look different from each other.
export const siteLetter = (site: string) => {
    let host = site;
    try {
        host = new URL(site).hostname;
    } catch {
        // Already a host.
    }
    return host.replace(/^www\./, "").charAt(0).toUpperCase();
};

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
                    className={cn("size-4 shrink-0 flex items-center justify-center rounded-full bg-muted-foreground/15 text-11 leading-none font-semibold text-muted-foreground before:content-[attr(data-letter)]", className)}
                />
            );
        }
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
