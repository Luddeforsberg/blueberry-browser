// A saved site's own icon. It only ever asks that site, never a third-party icon service.
export const siteIcon = (url: string) => {
  try {
    return `${new URL(url).origin}/favicon.ico`;
  } catch {
    return null;
  }
};
