# Plan: Safety Section - Block List and Muted Words

## Overview
This document contains the full implementation plan for adding a Safety section to manage user's block list and muted words.

## Implementation Summary

### 1. Core Library: `src/lib/safety.js`
- Manage mute list (NIP-51 kind 10000)
- Support both public (tags) and private (NIP-44 encrypted) mute lists
- Store muted pubkeys and muted words
- **Signals**:
  - `mutedPubkeys(): Array<string>` - hex pubkeys
  - `mutedWords(): Array<string>` - word strings
  - `muteListLoaded(): boolean` - sync status
  - `isPrivateMuteList(): boolean` - privacy mode
- **Functions**:
  - `isUserMuted(pubkey)` - check if user blocked
  - `isContentMuted(content)` - check for muted words (word boundary matching)
  - `shouldFilterEvent(event)` - comprehensive filter check
  - `filterEvents(events)` - filter event arrays
  - `addMutedUser(pubkey)`, `removeMutedUser(pubkey)`
  - `addMutedWord(word)`, `removeMutedWord(word)`
  - `publishMuteList()` - sync to relays (kind 10000)
  - `fetchMuteList(pubkey)` - load from relays
  - `initMuteList()` - auto-load on user login
  - `clearMuteList()` - cleanup on logout

### 2. Integrate with Settings: `src/lib/settings.js`
- Add signals integration (optional: local fallback state)
- Already handled via localStorage in safety.js

### 3. Safety Settings UI: `src/views/Settings.jsx`
Add new section with two subsections:

#### Blocked Users Subsection
- Title: "Blocked Users"
- Description: "Users whose posts and DMs you won't see"
- List of muted pubkeys with:
  - Profile avatar/name (via profile lookup)
  - "remove" button
- Add form: "Paste npub or pubkey to block"
- Status indicator: "Public mute list" or "Private mute list"

#### Muted Words Subsection
- Title: "Muted Words"
- Description: "Notes containing these words will be hidden"
- List of words with remove buttons
- Add form: "Add word to mute"
- Note: "Matching is case-insensitive with word boundaries"

### 4. Event Filtering: Modify `src/lib/pool.js`
Add wrapper functions or integrate with existing subscription:
- Export `withSafetyFilter(events)` helper
- Or modify subscription handlers to filter events automatically

### 5. Note Rendering: Modify `src/components/NoteCard.jsx`
Add at top of component:
```javascript
import { shouldFilterEvent } from '../lib/safety';

// At render time or earlier:
if (shouldFilterEvent(props.note)) {
  return null; // or show placeholder
}
```

Or better: filter at the feed level (see below)

### 6. Feed Views Integration
Filter at the source to avoid rendering blocked content:

#### `src/views/Feed.jsx`
In the subscription handler, filter events before adding to state:
```javascript
import { filterEvents } from '../lib/safety';

onevent(event) {
  if (shouldFilterEvent(event)) return; // skip immediately
  // ... rest of logic
}
```

#### `src/views/Profile.jsx`
Apply same filter when fetching profile notes

#### `src/views/Thread.jsx`
Filter muted replies in thread view

#### `src/views/Messages.jsx`
Filter messages from muted users

#### `src/views/Notifications.jsx`
Filter notifications from muted users

### 7. Integration in `src/lib/identity.js`
Call `initMuteList()` after successful login:
```javascript
import { initMuteList } from './safety';

export async function login() {
  // ... existing login logic
  import('./safety').then(({ initMuteList }) => initMuteList());
  // ... rest
}
```

### 8. Integration in `src/lib/event-cache.js`
Optionally filter events being cached to prevent storage of muted content

## NIP Specifications

| NIP | Purpose |
|-----|---------|
| NIP-01 | Basic event structure, kind 10000 |
| NIP-51 | Mute list format (kind 10000 with `p`, `t`, `word` tags) |
| NIP-04/NIP-44 | Encryption for private mute lists |

## Data Format

**Mute List Event (kind 10000):**
```json
{
  "kind": 10000,
  "content": "{\"encryped\":true}", // empty for public, encrypted for private
  "tags": [
    ["p", "751e..."],  // muted pubkey (hex)
    ["p", "f1c2..."],
    ["word", "spamword"],  // muted word
    ["t", "hashtag"]       // muted hashtag
  ]
}
```

## User Flow

1. User opens Settings → Safety section (only visible when logged in)
2. Views blocked users list with remove buttons
3. Pastes npub/pubkey to add block
4. Views muted words list with remove buttons
5. Types word to add mute
6. Optional: Toggle between public/private mute list
7. Changes publish immediately to relays
8. Filtering applies instantly across all views

## Filtering Behavior

- **Muted users**: All their kind 1 notes (and other user-generated content) hidden
- **Muted words**: Only kind 1 notes containing the word (case-insensitive, word boundaries)
- **Profile metadata**: Not filtered (kept simple)
- **Replies**: Filtered in threads
- **Notifications**: Filtered from muted senders

## Edge Cases

- Case-insensitive word matching
- Word boundary matching (word "test" won't match "contest")
- Offline mode: localStorage fallback
- No login: only localStorage (won't sync)
- Multiple relay conflicts: use latest timestamp (handled by fetchCachedEvent)

## Files to Create/Modify

**Create:**
- `src/lib/safety.js`

**Modify:**
- `src/views/Settings.jsx` - add Safety section
- `src/lib/identity.js` - call initMuteList on login
- `src/lib/pool.js` - integrate filter helper (optional)
- `src/lib/event-cache.js` - optional caching filter
- All view files that display events: Filter at subscription level
