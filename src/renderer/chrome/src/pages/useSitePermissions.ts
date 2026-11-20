import type { SavedSitePermission } from "@shared/ipc";
import { useFromMain } from "@common/lib/latest";

// Every answer a site has saved, kept up to date.
export const useSitePermissions = () => {
  const [saved] = useFromMain<SavedSitePermission[]>([], window.chromeAPI.permissions.saved, window.chromeAPI.permissions.onSavedUpdated);
  return saved;
};
