import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

// The web pages drive opens, on made-up hosts under .example. The app maps those hosts to this server
// (tests/features/driveFakes.cjs), so an address reads http://shop.example/cart, never a random port.

const page = (title: string, body: string) =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;margin:40px;color:#222;background:#fff;max-width:720px}
input{display:block;margin:6px 0 14px;padding:8px;width:320px}button{padding:8px 14px}li{margin:6px 0}</style></head>
<body>${body}</body></html>`;

const PAGES: Record<string, string> = {
  "/": page("Cheap Cables", "<h1>Cheap Cables</h1><p>USB-C cables, cheaper than anywhere.</p><ul><li>1 m cable, 49 kr</li><li>2 m cable, 79 kr</li><li>3 m braided cable, 129 kr</li></ul><button>Add to cart</button>"),
  "/cart": page("Your cart", "<h1>Your cart</h1><p>1 m cable, 49 kr</p><button>Place order</button>"),
  "/news": page("Morning News", "<h1>Morning News</h1><ol><li>Swifts are back over the city</li><li>A new bridge opens on Monday</li><li>The jackdaw count is up again</li></ol>"),
  "/flights": page("Lisbon fares", "<h1>Flights to Lisbon</h1><p>Three flights under €200 this weekend.</p>"),
  "/birds": page("Birds", "<h1>Birds</h1><p>A jackdaw on the roof. A jackdaw on the wall. A jackdaw in the tree, and a magpie.</p>"),
  "/account": page("Sign in", '<h1>Sign in</h1><label>Email<input id="email" type="email"></label><label>Password<input id="password" type="password"></label><button>Sign in</button>'),
  "/notify": page("Alerts", "<h1>Price alerts</h1><p>Get told when a cable gets cheaper.</p><script>Notification.requestPermission()</script>"),
};

export interface Site {
  // An address on one of the made-up hosts.
  url: (host: string, path?: string) => string;
  // The host rules that send every .example host here.
  hostRules: string;
  // This server's real address on 127.0.0.1, for a browser that doesn't get the host rules.
  direct: (path?: string) => string;
  close: () => void;
}

export async function startSite(): Promise<Site> {
  const server = createServer((request, response) => {
    const path = new URL(request.url ?? "/", "http://site").pathname;
    if (path === "/report.pdf") {
      response.setHeader("content-type", "application/octet-stream");
      response.setHeader("content-disposition", 'attachment; filename="report.pdf"');
      response.end(Buffer.alloc(48 * 1024, 1));
      return;
    }
    const body = PAGES[path];
    response.statusCode = body ? 200 : 404;
    response.setHeader("content-type", "text/html; charset=utf-8");
    response.end(body ?? page("Not found", "<h1>Not found</h1>"));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  return {
    url: (host, path = "/") => `http://${host}${path}`,
    hostRules: `MAP *.example 127.0.0.1:${port}`,
    direct: (path = "/") => `http://127.0.0.1:${port}${path}`,
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}
