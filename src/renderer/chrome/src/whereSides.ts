import { Cloud, Laptop } from "lucide-react";

// The two sides of the switch between here and the cloud, in the prompt box and on the desktop. This is the one place the
// computer is named for its platform, "This Mac" or "This PC" (DESIGN.md section 14). Every other sentence says "this
// computer", which is true on either, and lint holds the rest of the app to that.
export const whereSides = (on: boolean, mac: boolean) =>
  ([false, true] as const).map((cloud) => ({
    chosen: on === cloud,
    Icon: cloud ? Cloud : Laptop,
    label: cloud ? "Cloud" : mac ? "This Mac" : "This PC",
    // What each side does, in the state it's in.
    tip: cloud
      ? `${on ? "Runs" : "Run"} in the cloud, with your ${mac ? "Mac" : "PC"} off`
      : `${on ? "Run" : "Runs"} on ${mac ? "this Mac" : "this PC"}`,
  }));
