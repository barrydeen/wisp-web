import { getFollowSet } from "./outbox";
import { getProfile, getProfileCache } from "./profiles";

// Search contacts for @mention autocomplete.
// Prioritizes follows, then falls back to any cached profiles.
// Returns up to 5 candidates: { pubkey, name, displayName, picture, isContact }
export function searchContacts(query) {
  const follows = getFollowSet();
  const lowerQuery = query.toLowerCase();
  const results = [];

  // 1. Search follow list first
  if (follows) {
    for (const pubkey of follows) {
      if (results.length >= 5) break;
      const profile = getProfile(pubkey);
      if (!profile) continue;

      const nameMatch = profile.name?.toLowerCase().includes(lowerQuery);
      const displayMatch = profile.display_name?.toLowerCase().includes(lowerQuery);
      if (!lowerQuery || nameMatch || displayMatch) {
        results.push({
          pubkey,
          name: profile.name || null,
          displayName: profile.display_name || profile.name || null,
          picture: profile.picture || null,
          isContact: true,
        });
      }
    }
  }

  // 2. Fill remaining slots from full profile cache
  if (results.length < 5) {
    const cache = getProfileCache();
    const seenPubkeys = new Set(results.map(r => r.pubkey));
    const remaining = 5 - results.length;
    let count = 0;

    for (const [pubkey, profile] of cache) {
      if (count >= remaining) break;
      if (seenPubkeys.has(pubkey)) continue;

      const nameMatch = profile.name?.toLowerCase().includes(lowerQuery);
      const displayMatch = profile.display_name?.toLowerCase().includes(lowerQuery);
      if (nameMatch || displayMatch) {
        results.push({
          pubkey,
          name: profile.name || null,
          displayName: profile.display_name || profile.name || null,
          picture: profile.picture || null,
          isContact: false,
        });
        count++;
      }
    }
  }

  return results;
}
