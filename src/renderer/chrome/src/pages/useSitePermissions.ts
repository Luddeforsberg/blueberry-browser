import { useEffect, useState } from "react";
import type { SavedSitePermission } from "@shared/ipc";

// Every answer a site has saved, kept up to date.
export const useSitePermissions = () => {
  const [saved, setSaved] = useState<SavedSitePermission[]>([]);
  useEffect(() => {
    void window.chromeAPI.permissions.saved().then(setSaved);
    return window.chromeAPI.permissions.onSavedUpdated(setSaved);
  }, []);
  return saved;
};
