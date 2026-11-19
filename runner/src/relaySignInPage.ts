// The sign-in page the relay serves, for ChatGPT, Claude or an app on the same computer to send the user to.

export const appName = (uri: string): string => {
  const host = new URL(uri).hostname;
  return host === "chatgpt.com" ? "ChatGPT" : host.startsWith("claude") ? "Claude" : "An app on your computer";
};

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

// A plain page with nothing but the form. Everything put in it is escaped.
export const signInPage = ({ app, request, problem }: { app: string; request: string | null; problem?: string }): string => `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect to Blueberry</title>
<style>
:root{color-scheme:light dark;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:Canvas;color:CanvasText}
main{width:min(360px,calc(100vw - 32px))}
h1{font-size:20px;margin:0 0 8px}
p{font-size:14px;line-height:1.45;opacity:.8;margin:0 0 16px}
label{display:block;font-size:13px;margin:12px 0 4px}
input{box-sizing:border-box;width:100%;font:inherit;padding:8px 10px;border:1px solid #8886;border-radius:8px}
button{margin-top:16px;width:100%;font:inherit;font-weight:600;padding:9px;border:0;border-radius:8px;background:#3d4fd6;color:#fff}
.problem{color:#b45309;opacity:1}
</style></head><body><main>
<h1>Connect to Blueberry</h1>
<p>${escape(app)} wants to give jobs to your mascots in the cloud. They still ask you, in Blueberry or on your phone, before anything risky, and it can't answer for you.</p>
${problem ? `<p class="problem" role="alert">${escape(problem)}</p>` : ""}
${
  request
    ? `<form method="post" action="/sign-in">
<input type="hidden" name="request" value="${escape(request)}">
<label for="email">Blueberry email</label><input id="email" name="email" type="email" autocomplete="username" required>
<label for="password">Password</label><input id="password" name="password" type="password" autocomplete="current-password" required>
<button type="submit">Sign in and connect</button>
</form>`
    : ""
}
</main></body></html>`;
