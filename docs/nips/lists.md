# Lists -- NIP-51

## Overview

Generic lists for organizing references to events, pubkeys, relays, and other items. Supports both public (in tags) and private (encrypted in content) entries.

## Kind Ranges

- **Standard lists** (replaceable, one per user per kind): `10000`--`10050+`
- **Sets** (addressable via `d` tag, multiple per user): `30000`--`39089+`

## Key Standard Lists

| Name | Kind | Expected Tags |
|------|------|---------------|
| Mute list | `10000` | `p`, `t`, `word`, `e` |
| Pinned notes | `10001` | `e` |
| Bookmarks | `10003` | `e`, `a` |
| Simple groups | `10009` | `group`, `r` |
| DM relays | `10050` | `relay` |

## Key Sets

| Name | Kind | Expected Tags |
|------|------|---------------|
| Follow sets | `30000` | `p` |
| Relay sets | `30002` | `relay` |
| Bookmark sets | `30003` | `e`, `a` |
| Curation sets | `30004` | `a`, `e` |

## Private Items (Encrypted)

Private items are stored in `.content` as a NIP-44 encrypted JSON array (same structure as `tags`), using the author's own key pair for encryption.

```
content = nip44_encrypt(JSON.stringify([["p", "abc..."], ["e", "def..."]]))
```

## Optional Set Tags

```
["title", "My List"]
["image", "https://..."]
["description", "A curated set"]
```

## Implementation Notes

- **Replaceable:** each new list event entirely overwrites the previous one.
- Append new items to the end of the tags array for chronological ordering.
- Legacy NIP-04 encryption may be encountered; detect by checking for `"iv"` in ciphertext.
