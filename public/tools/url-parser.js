(function (root, factory) {
  "use strict";

  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.DtpUrlParser = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const EXPLICIT_URL = /(?:https?:\/\/|\/\/|www\.)[^\s<>"'`]+/gi;
  const BARE_DOMAIN = /(?:^|[\s([{,;])((?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{2,5})?(?:\/[^\s<>"'`]*)?)/gi;

  function decodeEntities(value) {
    return String(value || "")
      .replace(/[\u200B-\u200D\u2060\uFEFF]/g, "")
      .replace(/&amp;/gi, "&")
      .replace(/&quot;/gi, "\"")
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code) || 0))
      .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16) || 0));
  }

  function countCharacter(value, character) {
    return [...String(value || "")].filter((entry) => entry === character).length;
  }

  function cleanPastedToken(value) {
    let token = decodeEntities(value).trim();
    token = token.replace(/^[<\[({"']+/, "").replace(/[>"']+$/g, "");
    token = token.replace(/[.,;:!?]+$/g, "");

    for (const [open, close] of [["(", ")"], ["[", "]"], ["{", "}"]]) {
      while (token.endsWith(close) && countCharacter(token, close) > countCharacter(token, open)) {
        token = token.slice(0, -1).trimEnd();
      }
    }
    return token;
  }

  function normalizeHttpUrl(raw, baseUrl = "") {
    let value = baseUrl ? decodeEntities(raw).trim() : cleanPastedToken(raw);
    if (!value || /^(?:data|javascript|mailto|tel|file|blob):/i.test(value) || value.startsWith("#")) return "";

    try {
      if (!baseUrl) {
        if (value.startsWith("//")) value = `https:${value}`;
        else if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `https://${value}`;
      }
      const normalized = baseUrl ? new URL(value, baseUrl) : new URL(value);
      if (!["http:", "https:"].includes(normalized.protocol) || !normalized.hostname) return "";
      if (normalized.username || normalized.password) return "";
      normalized.hash = "";
      return normalized.href;
    } catch {
      return "";
    }
  }

  function extractHttpUrls(raw) {
    const text = decodeEntities(raw);
    const candidates = [];
    let match;

    EXPLICIT_URL.lastIndex = 0;
    while ((match = EXPLICIT_URL.exec(text))) candidates.push({ index: match.index, value: match[0] });

    BARE_DOMAIN.lastIndex = 0;
    while ((match = BARE_DOMAIN.exec(text))) {
      candidates.push({ index: match.index + match[0].lastIndexOf(match[1]), value: match[1] });
    }
    candidates.sort((a, b) => a.index - b.index);

    const urls = [];
    const seen = new Set();
    for (const candidate of candidates) {
      const normalized = normalizeHttpUrl(candidate.value);
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      urls.push(normalized);
    }
    return urls;
  }

  return { cleanPastedToken, decodeEntities, extractHttpUrls, normalizeHttpUrl };
});
