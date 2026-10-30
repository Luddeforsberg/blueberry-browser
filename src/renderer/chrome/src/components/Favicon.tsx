import React, { useState } from "react";
import { Globe } from "lucide-react";

interface FaviconProps {
    src?: string | null;
    className?: string;
}

export const Favicon: React.FC<FaviconProps> = ({ src, className }) => {
    const [failedSrc, setFailedSrc] = useState<string | null>(null);

    if (!src || src === failedSrc) {
        return <Globe className={`size-4 text-muted-foreground ${className || ""}`} />;
    }

    return (
        <div className="size-4 overflow-hidden rounded-none flex items-center justify-center">
            <img
                src={src}
                className="object-contain size-full"
                onError={() => setFailedSrc(src)}
                alt=""
            />
        </div>
    );
};
