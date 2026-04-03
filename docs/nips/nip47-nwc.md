# Nostr Wallet Connect -- NIP-47

## Overview

Protocol for apps to request Lightning payments from a user's wallet service. Communication is E2E encrypted; relays only see event kinds and tags.

## Event Kinds

| Kind | Purpose |
|------|---------|
| `13194` | Info event (replaceable) -- wallet capabilities |
| `23194` | Request (client -> wallet) |
| `23195` | Response (wallet -> client) |
| `23196` | Notification (NIP-04 encrypted, deprecated) |
| `23197` | Notification (NIP-44 encrypted) |

## Connection URI

```
nostr+walletconnect://<wallet-service-pubkey-hex>?relay=<wss-url>&secret=<32-byte-hex>&lud16=<lightning-address>
```

- `secret` -- client-side private key for signing requests and deriving shared encryption key
- `relay` -- where the wallet service listens (required, may appear multiple times)
- `lud16` -- optional Lightning address

## Info Event (Kind 13194)

- **Content:** Space-separated list of supported methods
  ```
  pay_invoice get_balance make_invoice lookup_invoice list_transactions get_info
  ```
- **Tags:**
  ```
  ["encryption", "nip44_v2 nip04"]
  ["notifications", "payment_received payment_sent"]
  ```

## Request (Kind 23194)

- **Content:** NIP-44 encrypted JSON
  ```json
  { "method": "<method-name>", "params": { ... } }
  ```
- **Tags:**
  ```
  ["p", "<wallet-service-pubkey>"]
  ["encryption", "nip44_v2"]
  ["expiration", "<unix-timestamp>"]   // optional
  ```

## Response (Kind 23195)

- **Content:** NIP-44 encrypted JSON
  ```json
  { "result_type": "<method>", "result": { ... }, "error": null }
  ```
  or on error:
  ```json
  { "result_type": "<method>", "result": null, "error": { "code": "...", "message": "..." } }
  ```
- **Tags:**
  ```
  ["p", "<client-pubkey>"]
  ["e", "<request-event-id>"]
  ```

## Supported Methods

| Method | Description |
|--------|-------------|
| `pay_invoice` | Pay a BOLT11 invoice |
| `pay_keysend` | Keysend payment |
| `make_invoice` | Create an invoice |
| `lookup_invoice` | Look up invoice status |
| `list_transactions` | List transaction history |
| `get_balance` | Get wallet balance (msats) |
| `get_info` | Get wallet info |
| `make_hold_invoice` | Create a hold invoice |
| `cancel_hold_invoice` | Cancel a hold invoice |
| `settle_hold_invoice` | Settle a hold invoice |

## Error Codes

`RATE_LIMITED`, `NOT_IMPLEMENTED`, `INSUFFICIENT_BALANCE`, `QUOTA_EXCEEDED`, `RESTRICTED`, `UNAUTHORIZED`, `INTERNAL`, `UNSUPPORTED_ENCRYPTION`, `PAYMENT_FAILED`, `NOT_FOUND`, `OTHER`

## Implementation Notes

- The user's identity key is NOT used -- generate unique keys per connection for privacy.
- Prefer NIP-44 encryption when the wallet service supports it (check `encryption` tag on kind 13194).
- Absence of `encryption` tag implies legacy NIP-04 only.
- Use relays that don't close idle connections.
- Transaction metadata capped at 4096 characters.
- NWC relays should allow at least 64KB payload size.
