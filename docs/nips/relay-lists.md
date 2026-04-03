# Relay List Metadata -- NIP-65 (Kind 10002)

## Overview

Declares which relays a user reads from and writes to. Used for routing events efficiently.

## Event Structure

- **Kind:** `10002` (replaceable)
- **Content:** Empty string

## Tags

```
["r", "wss://relay.example.com"]              // read + write
["r", "wss://relay.example.com", "read"]      // read only
["r", "wss://relay.example.com", "write"]     // write only
```

## Relay Direction Semantics

| Direction | Meaning | When to use |
|-----------|---------|-------------|
| **write** | User publishes here | Fetch events **from** this user |
| **read** | User expects to find mentions here | Fetch events **about/mentioning** this user |
| (no marker) | Both read and write | |

## Implementation Notes

- Keep lists small: 2--4 relays per category recommended.
- Spread kind 10002 events to well-known indexer relays for discoverability.
- When fetching a user's notes, connect to their **write** relays.
- When sending a mention/DM notification, use their **read** relays.
