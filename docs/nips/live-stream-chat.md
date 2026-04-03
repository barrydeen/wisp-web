# Live Stream Chat -- NIP-53 (Kind 1311)

## Overview

Chat messages sent within a live stream context.

## Event Structure

- **Kind:** `1311`
- **Content:** Plain text chat message

## Required Tags

```
["a", "30311:<stream-author-pubkey>:<d-tag>", "<relay-url>", "root"]
```

References the live stream (kind 30311) this message belongs to.

## Optional Tags

```
["e", "<event-id>", ...]                                      // reply to specific chat message
["q", "<event-id-or-address>", "<relay-url>", "<pubkey>"]     // quote citation
["p", "<pubkey>"]                                              // mention
```

## Implementation Notes

- Subscribe to kind 1311 events filtered by the `a` tag to get all chat for a stream.
- Hosts can pin chat messages by adding `["pinned", "<event-id>"]` to the kind 30311 stream event.
- Chat messages are regular (non-replaceable) events.

## Example

```json
{
  "kind": 1311,
  "content": "Great stream!",
  "tags": [
    ["a", "30311:aabbcc...:my-live-stream-123", "wss://relay.example.com", "root"]
  ]
}
```
