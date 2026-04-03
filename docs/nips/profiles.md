# Profiles -- NIP-01 (Kind 0)

## Overview

User metadata stored as a replaceable event. Only the latest kind 0 per pubkey is kept by relays.

## Event Structure

- **Kind:** `0`
- **Content:** Stringified JSON object

## Content JSON Fields

| Field | Description |
|-------|-------------|
| `name` | Username / handle |
| `display_name` | Display name |
| `about` | Short bio |
| `picture` | Avatar URL |
| `banner` | Banner image URL |
| `website` | Website URL |
| `nip05` | NIP-05 identifier (e.g. `user@domain.com`) |
| `lud06` | LNURL pay (bech32) |
| `lud16` | Lightning address (e.g. `user@getalby.com`) |

## Tags

None required by the kind itself.

## Implementation Notes

- **Replaceable event:** when two events share the same timestamp, the one with the lowest `id` (lexical order) wins.
- Clients should cache profiles and batch-fetch by pubkey to reduce relay load.
- Profile content is user-controlled; always sanitize before rendering.

## Example

```json
{
  "kind": 0,
  "content": "{\"name\":\"alice\",\"about\":\"nostr dev\",\"picture\":\"https://example.com/avatar.jpg\",\"nip05\":\"alice@example.com\"}",
  "tags": []
}
```
