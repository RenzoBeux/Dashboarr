/**
 * The editor's honest-server caveat: the passphrase is typed into this page,
 * and over plain HTTP the page itself is only as trustworthy as the network
 * that delivered it. Shown on every non-localhost http origin.
 */
export function isInsecureOrigin(): boolean {
  if (location.protocol !== "http:") return false;
  const host = location.hostname;
  return host !== "localhost" && host !== "127.0.0.1" && host !== "[::1]";
}

export function HttpNotice() {
  if (!isInsecureOrigin()) return null;
  return (
    <p className="notice warning">
      This page is served over plain HTTP. Your passphrase is only as safe as this server and network.
      Use HTTPS (a reverse proxy with a certificate) for anything beyond your own LAN.
    </p>
  );
}
