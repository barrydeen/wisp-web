# Follow Lists -- NIP-02 (Kind 3)

## Overview

A user's follow/contact list. Replaceable event -- each new kind 3 completely replaces the previous one.

## Event Structure

- **Kind:** `3` (replaceable)
- **Content:** Empty string (historically some clients stored relay JSON here, not standard)

## Tags

```
["p", "<32-byte-hex-pubkey>", "<relay-url>", "<petname>"]
```

- `relay-url` and `petname` can be empty strings if not needed.
- Petnames enable a decentralized naming system (see NIP-02 petname scheme).

## Implementation Notes

- Each new kind 3 event completely replaces the previous one; there is no diff/delta mechanism.
- When adding/removing follows, fetch the current list first, modify it, then publish the new event.
- Append new follows to the end for chronological ordering.
- Relays and clients SHOULD delete past follow lists upon receiving a new one.
- This NIP has `final` status.

## Example

```json
{
  "kind": 3,
  "content": "",
  "tags": [
    ["p", "aabbcc...", "wss://relay.example.com", "alice"],
    ["p", "ddeeff...", "", ""],
    ["p", "112233...", "wss://relay.damus.io", "bob"]
  ]
}
```
