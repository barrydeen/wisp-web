# Private Direct Messages -- NIP-17

## Overview

End-to-end encrypted DMs using NIP-44 encryption with NIP-59 gift-wrap/seal layers for metadata protection.

## Event Kinds

| Kind | Purpose |
|------|---------|
| `14` | Chat message (unsigned inner event) |
| `15` | File message (unsigned inner event) |
| `13` | Seal (wraps unsigned message, signed by sender) |
| `1059` | Gift wrap (wraps seal, signed by throwaway key) |
| `10050` | DM relay list (user's preferred DM inbox relays) |

## Encryption Flow

1. **Create unsigned kind 14** -- include `id` and `created_at` but NO signature
2. **Wrap in kind 13 seal** -- NIP-44 encrypt the unsigned event, sign with sender's key. Randomize `created_at` up to 2 days in the past
3. **Wrap in kind 1059 gift wrap** -- NIP-44 encrypt the seal using a random throwaway keypair. The `pubkey` field is the throwaway key. Randomize `created_at` up to 2 days
4. **One gift wrap per recipient** (and one for the sender to store in their own inbox)

## Chat Message (Kind 14) -- Unsigned Inner Event

- **Content:** Plain text message

### Required Tags

```
["p", "<receiver-pubkey>", "<relay-url>"]   // one per recipient
```

### Optional Tags

```
["e", "<kind-14-id>", "<relay-url>"]        // reply to previous message
["subject", "<conversation-title>"]          // name/rename conversation
```

## DM Relay List (Kind 10050)

- **Content:** Empty string
- **Tags:** `["relay", "wss://..."]` per relay

Publish gift wraps to relays listed in the recipient's kind 10050 event.

## Implementation Notes

- Messages are **deniable** -- the inner event is unsigned.
- Clients MUST verify that kind 13 `pubkey` matches kind 14 `pubkey`.
- Chat rooms are defined by the set of sender `pubkey` + all `p` tag pubkeys; changing participants creates a new room.
- Not efficient for groups over ~100 participants (use NIP-29 instead).
- Relays MAY enforce AUTH (NIP-42) to only serve kind 1059 to the tagged recipient.
- Optional disappearing messages via `expiration` tag on the gift wrap.

## nostr-tools Support

Use `nip44` for encryption/decryption and `nip59` for seal/gift-wrap construction.
