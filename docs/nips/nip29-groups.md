# Relay-based Groups -- NIP-29

## Overview

Group chats and communities hosted on specific relays. The relay manages membership, moderation, and metadata.

## Event Kinds

### User Content

Any event kind can be posted to a group by including the `h` tag:

```
["h", "<group-id>"]
```

Common kinds: `9` (chat message), `1` (text note).

### Moderation Events (sent by admins)

| Kind | Action | Key Tags |
|------|--------|----------|
| `9000` | `put-user` -- add user with roles | `["p", pubkey]`, `["roles", ...]` |
| `9001` | `remove-user` | `["p", pubkey]` |
| `9002` | `edit-metadata` | `["name", ...]`, `["about", ...]`, etc. |
| `9005` | `delete-event` | `["e", event-id]` |
| `9007` | `create-group` | |
| `9008` | `delete-group` | |
| `9009` | `create-invite` | |

### User Management

| Kind | Action |
|------|--------|
| `9021` | Join request |
| `9022` | Leave request |

### Relay-signed Metadata (signed by relay's key)

| Kind | Description |
|------|-------------|
| `39000` | Group metadata (name, picture, about, flags) |
| `39001` | Group admins list |
| `39002` | Group members list |
| `39003` | Group roles definitions |

### User's Group List

| Kind | Description |
|------|-------------|
| `10009` | User's joined groups (NIP-51 list) |

## Group Identification

Format: `<relay-host>'<group-id>` (e.g., `groups.nostr.com'abcdef`)

Group IDs: `a-z0-9-_` characters, should be random. The special ID `_` is the relay's top-level group.

## Group Metadata Tags (Kind 39000)

```
["d", "<group-id>"]
["name", "Group Name"]
["picture", "https://..."]
["about", "Description"]
["private"]       // only members can read
["restricted"]    // only members can write
["hidden"]        // metadata hidden from non-members
["closed"]        // join requests ignored, invite-only
```

## Timeline References

Events may include `["previous", "<first-8-chars-of-event-id>", ...]` referencing recent events to prevent out-of-context broadcasting.

## Implementation Notes

- Groups live on a specific relay; the relay's master key signs metadata events (kinds 39000-39003).
- Membership determined by latest kind 9000 or 9001 event for that user.
- Relays should reject late-published events.
- Subscribe to group events by filtering on the `h` tag and the specific relay.
