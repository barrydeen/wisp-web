# Short Text Notes -- NIP-01 / NIP-10 (Kind 1)

## Overview

Plain-text short notes. Threading and reply semantics defined by NIP-10.

## Event Structure

- **Kind:** `1`
- **Content:** Plain text (no markdown/HTML)

## Tags

### Event references (`e` tag)

```
["e", <event-id>, <relay-url>, <marker>, <pubkey>]
```

| Marker | Meaning |
|--------|---------|
| `"root"` | Thread root event |
| `"reply"` | Direct parent being replied to |

- For top-level replies (directly to root), use only the `"root"` marker.
- Sort `e` tags from root to direct parent.

### Pubkey mentions (`p` tag)

```
["p", <pubkey>, <relay-url>]
```

When replying, include all `p` tags from the parent event plus the parent author's pubkey.

### Quote citations (`q` tag)

```
["q", <event-id-or-address>, <relay-url>, <pubkey>]
```

## Implementation Notes

- Kind 1 replies MUST NOT reply to non-kind-1 events (use NIP-22 for cross-kind replies).
- Display threads by following `e` tag chains from root to leaf.

## Example

```json
{
  "kind": 1,
  "content": "Hello nostr!",
  "tags": []
}
```

### Reply example

```json
{
  "kind": 1,
  "content": "Great post!",
  "tags": [
    ["e", "<root-event-id>", "wss://relay.example.com", "root"],
    ["e", "<parent-event-id>", "wss://relay.example.com", "reply"],
    ["p", "<parent-author-pubkey>"]
  ]
}
```
