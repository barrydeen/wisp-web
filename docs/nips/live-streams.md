# Live Streams -- NIP-53 (Kind 30311)

## Overview

Live activity events for streaming. Addressable event, constantly updated during the stream.

## Event Structure

- **Kind:** `30311` (addressable)
- **Content:** Empty string

## Tags

### Required

```
["d", "<unique-identifier>"]
```

### Standard Tags

```
["title", "<name>"]
["summary", "<description>"]
["image", "<preview-image-url>"]
["streaming", "<stream-url>"]          // e.g. HLS/m3u8 URL
["recording", "<url>"]                 // post-stream recording
["starts", "<unix-timestamp>"]
["ends", "<unix-timestamp>"]
["status", "<planned|live|ended>"]
["current_participants", "<number>"]
["total_participants", "<number>"]
["t", "<hashtag>"]
["relays", "wss://...", ...]
["pinned", "<event-id>"]              // pinned chat message
```

### Participant Tags

```
["p", "<pubkey>", "<relay-url>", "<role>", "<proof>"]
```

Roles: `Host`, `Speaker`, `Participant`

**Proof:** hex-encoded signature of `SHA256("<kind>:<pubkey>:<d-tag>")` by the participant's key.

## Implementation Notes

- Events without updates for 1 hour with `status=live` may be considered `ended`.
- Link to streams using NIP-19 `naddr` encoding.
- Keep participant lists under ~1000 entries.
- The stream owner updates this event to reflect current state (title changes, participant list, status transitions).

## Example

```json
{
  "kind": 30311,
  "content": "",
  "tags": [
    ["d", "my-live-stream-123"],
    ["title", "Friday Nostr Dev Chat"],
    ["status", "live"],
    ["streaming", "https://stream.example.com/live.m3u8"],
    ["t", "nostr"],
    ["t", "dev"],
    ["p", "aabb...", "wss://relay.example.com", "Host"]
  ]
}
```
