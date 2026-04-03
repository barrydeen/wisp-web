# Wisp Web

Nostr client built with Solid.js and nostr-tools.

## Tech Stack

- **UI Framework:** Solid.js 1.9 with JSX
- **Router:** @solidjs/router 0.15
- **Build:** Vite 6
- **Nostr:** nostr-tools 2.10
- **Auth:** NIP-07 browser extensions (nos2x, Alby, etc.)

## Project Structure

```
src/
  index.jsx          # App entry, router setup
  components/
    Layout.jsx       # Nav sidebar + login UI
    NoteCard.jsx     # Reusable note display
  views/
    Feed.jsx         # Global note feed (kind 1)
    Chat.jsx         # Chat channels (NIP-28, kinds 40/42)
    Profile.jsx      # User profile (kind 0 metadata + kind 1 notes)
  lib/
    identity.js      # NIP-07 auth, user state
    pool.js          # Relay pool (SimplePool)
    profiles.js      # Profile metadata cache + batch fetch
    utils.js         # Time formatting, npub encoding, colors
```

## Relay Configuration

- Default relays: `wss://relay.damus.io`, `wss://relay.primal.net`
- Indexer relays: `wss://indexer.coracle.social`, `wss://indexer.nostrarchives.com`

## NIP References

Quick-reference docs for each Nostr NIP used in this project live in `docs/nips/`:

| File | Covers |
|------|--------|
| [profiles.md](docs/nips/profiles.md) | NIP-01 kind 0 -- user metadata |
| [notes.md](docs/nips/notes.md) | NIP-01/10 kind 1 -- short text notes |
| [polls.md](docs/nips/polls.md) | NIP-88 kinds 1068/1018 -- polls & responses |
| [nip17-dms.md](docs/nips/nip17-dms.md) | NIP-17 kinds 14/1059 -- private DMs (gift wrap) |
| [nip29-groups.md](docs/nips/nip29-groups.md) | NIP-29 -- relay-based group chats |
| [lists.md](docs/nips/lists.md) | NIP-51 -- generic lists and sets |
| [relay-lists.md](docs/nips/relay-lists.md) | NIP-65 kind 10002 -- relay list metadata |
| [follow-lists.md](docs/nips/follow-lists.md) | NIP-02 kind 3 -- follow/contact lists |
| [live-streams.md](docs/nips/live-streams.md) | NIP-53 kind 30311 -- live activities |
| [live-stream-chat.md](docs/nips/live-stream-chat.md) | NIP-53 kind 1311 -- live stream chat |
| [nip47-nwc.md](docs/nips/nip47-nwc.md) | NIP-47 -- Nostr Wallet Connect |
