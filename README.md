# Debt Crew Ledger

Static GitHub Pages app + Firebase backend for tracking shared debts with four friends and occasional outside contacts.

## What this includes

- Loans, expenses, settlements
- Equal or amount-based splits (payer included)
  - Unequal mode supports locking participants and auto-splitting the remaining amount
- Pairwise debts and net balances
- Personalized "you owe" / "owed to you" overview with chronological explanations
- Reason-first activity search, categories, responsive navigation, and a personal balance-journey chart
- Collapsible debt chapters grouped by settlements and square-up moments
- One-click JSON download of members and transactions for a portable manual snapshot
- Practical settle-up suggestions
- Shared payment QR gallery with per-member upload, replacement, download, and removal
- Soft delete and audit log
- "Birthday auth" identity labeling
- Ledger-only contacts for people who can owe or receive money without becoming app identities

## Quick start

1. Edit config in `app.js`
   - `firebaseConfig`
   - `APP_CONFIG.groupId`, `groupName`, `members`, `birthdayPasscodesByMemberId`

2. Enable Firebase Anonymous Auth
   - Firebase Console -> Authentication -> Sign-in method -> Anonymous

3. Create Firestore and apply rules
   - Use `firestore.rules`
   - Example with Firebase CLI:
     ```bash
     firebase deploy --only firestore:rules
     ```

4. Run locally
   - Firebase SDK needs an HTTP server. From this repo:
     ```bash
     python -m http.server 5173
     ```
   - Open http://localhost:5173

5. Deploy to GitHub Pages
   - Push this repo and enable Pages for the root.

## Ledger calculation tests

The shared calculation module has no runtime or test dependencies. Run its Node test suite with:

```bash
node --test tests/*.test.mjs
```

The suites verify expense allocation, pairwise netting, member balances, settle-up
suggestions, chronological debt explanations, VND/date formatting, and the static UI contract.

## Data model

- `groups/{groupId}`
  - `name`, `timezone`, `members: [{ id, displayName, ledgerOnly? }]`
  - App identities are the configured members that have birthday passcodes.
  - A person added from the People dialog has `ledgerOnly: true`. They can be a
    lender, borrower, payer, receiver, or expense participant, but cannot be
    selected as the current app identity and do not need a passcode.
- `groups/{groupId}/transactions/{txId}`
  - Common: `type`, `amountVnd`, `reason`, `eventAt`, `createdAt`, `createdBy`,
    `updatedAt`, `updatedBy`, `isDeleted`, `deletedAt`, `deletedBy`
  - Optional: `category` (`FOOD`, `TRANSPORT`, `ENTERTAINMENT`, `SHOPPING`,
    `STAY`, or `OTHER`) and numeric `schemaVersion`
  - Older transactions may omit either optional field. Treat a missing category
    as uncategorized and tolerate a missing schema version as legacy data.
  - LOAN: `fromId`, `toId`
  - SETTLEMENT: `fromId`, `toId`, optional `settlementScope: "GROUP"` when the
    payment was recorded from the group-wide suggested settlement plan
  - EXPENSE: `payerId`, `participants: [{ memberId, shareVnd }]`, optional
    `splitMethod` (`equal` or `custom`)
- `groups/{groupId}/transactions/{txId}/audit/{auditId}`
  - `action`, `at`, `by`, `before`, `after`
- `groups/{groupId}/paymentQrs/{memberId}`
  - A compressed PNG, JPEG, or WebP data URL plus its dimensions, original file
    name, schema version, and update metadata
  - QR images are resized client-side and capped at 700 KB per document

## Notes

- The birthday check is not security; it only labels UI actions.
- The first load creates the group document if it does not exist.
- Settle Up is a suggestion view. Record actual payments using SETTLEMENT entries.
- Event time uses the picker (displayed as `DD-MM-YYYY HH:mm`, 24-hour).
- The downloaded JSON contains group members and transaction records, not audit subcollections,
  and is intended for review/manual backup rather than automatic restore.
