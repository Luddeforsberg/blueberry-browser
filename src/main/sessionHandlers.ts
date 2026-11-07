import { desktopCapturer, type Session } from "electron";
import type { Downloads } from "./Downloads";
import type { SitePermissions } from "./SitePermissions";
import { inHtmlCard, isChromeContents } from "./chromeView";

// Tabs and chrome views share the default session, so this runs once, before anything loads in it.
export const installSessionHandlers = (session: Session, permissions: SitePermissions, downloads: Downloads): void => {
  session.setPermissionRequestHandler((contents, permission, callback, details) => {
    void permissions.request(contents, permission, details).then(callback);
  });
  session.setPermissionCheckHandler((contents, permission, requestingOrigin, details) =>
    permissions.check(contents, permission, requestingOrigin, details)
  );

  // We have no chooser for USB, HID or serial devices, so sites can't be given one.
  session.setDevicePermissionHandler(() => false);

  // Electron only comes here once the permission request handler has said yes to `display-capture`.
  session.setDisplayMediaRequestHandler((_, callback) => {
    desktopCapturer.getSources({ types: ["screen"] }).then(
      ([screen]) => callback(screen ? { video: screen } : null),
      (error) => {
        console.error("Failed to list screens to share:", error);
        callback(null);
      }
    );
  });

  session.on("will-download", (_, item) => downloads.track(item));

  // The last net under an HTML card, after its sandbox, its policy and the navigation lock in `chromeView.ts`: no request
  // from a frame with no origin in a chrome view, or from inside an HTML card's frame, ever leaves. The chrome's own page
  // and a cloud live view have origins of their own. A tab's requests are only looked at long enough to see they aren't
  // the chrome's.
  session.webRequest.onBeforeRequest((details, callback) => {
    if (!isChromeContents(details.webContents)) return callback({});
    let cancel: boolean;
    try {
      cancel = details.initiatorOrigin === "null" || inHtmlCard(details.frame);
    } catch {
      // A frame that can't be read is refused rather than left hanging.
      cancel = true;
    }
    callback({ cancel });
  });
};
