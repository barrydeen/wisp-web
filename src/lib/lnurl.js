/**
 * LNURL resolution utilities for Lightning payments and zaps.
 * Reference: Mobile Nip57.kt lines 85-203
 */

/**
 * Resolve a Lightning address (lud16) to LNURL-pay metadata.
 * @param {string} lud16 - Lightning address (user@domain)
 * @returns {Promise<{callback: string, minSendable: number, maxSendable: number, allowsNostr: boolean, nostrPubkey: string|null, metadata: string}>}
 */
export async function resolveLud16(lud16) {
  const [user, domain] = lud16.split("@");
  if (!user || !domain) throw new Error("Invalid lightning address");

  const url = `https://${domain}/.well-known/lnurlp/${user}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`LNURL resolve failed: ${res.status}`);

  const data = await res.json();
  if (data.status === "ERROR") throw new Error(data.reason || "LNURL error");

  return {
    callback: data.callback,
    minSendable: data.minSendable,
    maxSendable: data.maxSendable,
    allowsNostr: !!data.allowsNostr,
    nostrPubkey: data.nostrPubkey || null,
    metadata: data.metadata || "",
  };
}

/**
 * Fetch a BOLT11 invoice from an LNURL callback with a zap request attached.
 * @param {string} callbackUrl
 * @param {number} amountMsats
 * @param {string} zapRequestJson - JSON-stringified signed kind 9734 event
 * @returns {Promise<string>} bolt11 invoice
 */
export async function fetchZapInvoice(callbackUrl, amountMsats, zapRequestJson) {
  const url = new URL(callbackUrl);
  url.searchParams.set("amount", amountMsats.toString());
  url.searchParams.set("nostr", zapRequestJson);

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Invoice fetch failed: ${res.status}`);

  const data = await res.json();
  if (data.status === "ERROR") throw new Error(data.reason || "Invoice error");
  if (!data.pr) throw new Error("No invoice in response");

  return data.pr;
}

/**
 * Fetch a simple BOLT11 invoice (without zap request).
 * @param {string} callbackUrl
 * @param {number} amountMsats
 * @returns {Promise<string>} bolt11 invoice
 */
export async function fetchSimpleInvoice(callbackUrl, amountMsats) {
  const url = new URL(callbackUrl);
  url.searchParams.set("amount", amountMsats.toString());

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Invoice fetch failed: ${res.status}`);

  const data = await res.json();
  if (data.status === "ERROR") throw new Error(data.reason || "Invoice error");
  if (!data.pr) throw new Error("No invoice in response");

  return data.pr;
}
