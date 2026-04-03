# Polls -- NIP-88 (Kinds 1068 / 1018)

## Overview

Polls (kind 1068) with vote responses (kind 1018).

## Poll Event (Kind 1068)

- **Kind:** `1068`
- **Content:** The poll question text

### Required Tags

```
["option", "<option-id>", "<option-label>"]   // one per choice
```

`option-id` is any alphanumeric string.

### Optional Tags

```
["polltype", "singlechoice"]    // default if omitted
["polltype", "multiplechoice"]
["endsAt", "<unix-timestamp>"]  // when the poll closes
["relay", "<relay-url>"]        // where responses should be posted
```

## Poll Response (Kind 1018)

- **Kind:** `1018`
- **Content:** Empty string

### Required Tags

```
["e", "<poll-event-id>"]           // references the poll
["response", "<option-id>"]        // one or more per poll type
```

## Counting Rules

- One vote per pubkey; latest response (within time limits) wins.
- `singlechoice`: only the first `response` tag counts.
- `multiplechoice`: first response tag per unique option-id counts.

## Implementation Notes

- Responses should be published to relays specified in the poll event's `relay` tags.
- Prefer relays that reject backdated events and don't honor kind 5 deletes on vote events.
- Tally votes client-side by querying kind 1018 events referencing the poll.

## Example

```json
{
  "kind": 1068,
  "content": "What's your favorite protocol?",
  "tags": [
    ["option", "1", "Nostr"],
    ["option", "2", "AT Protocol"],
    ["option", "3", "ActivityPub"],
    ["polltype", "singlechoice"],
    ["endsAt", "1700000000"]
  ]
}
```
