// qBittorrent category-name validity, mirroring Session::isValidCategoryName
// (src/base/bittorrent/sessionimpl.cpp). This matters on the add form because
// POST /torrents/add does NOT reject an invalid category — it silently adds
// the torrent uncategorized — so we validate before sending. The rules: no
// backslashes, and "/" only as a separator between non-empty segments
// ("a/b" nests a subcategory; "/a", "a/", "a//b" are invalid).
export function isValidQbCategoryName(name: string): boolean {
  if (name.length === 0) return false;
  if (name.includes("\\")) return false;
  if (name.startsWith("/") || name.endsWith("/")) return false;
  if (name.includes("//")) return false;
  return true;
}
