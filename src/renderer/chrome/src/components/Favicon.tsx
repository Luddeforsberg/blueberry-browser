import React, { useState } from "react";
import { Globe } from "lucide-react";

interface FaviconProps {
    src?: string | null;
    className?: string;
    // Shown instead of the globe when the site has no icon.
    fallback?: React.ReactNode;
}

// A saved site's own icon. It only ever asks that site, never a third-party icon service.
export const siteIcon = (url: string) => {
    try {
        return `${new URL(url).origin}/favicon.ico`;
    } catch {
        return null;
    }
};

export const Favicon: React.FC<FaviconProps> = ({ src, className, fallback }) => {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);

    if (!src || src === failedSrc) {
        if (fallback) return <>{fallback}</>;
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
