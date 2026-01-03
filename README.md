# Debt Crew Ledger

Static GitHub Pages app + Firebase backend for tracking shared debts with 4 friends.

## What this includes

- Loans, expenses, settlements
- Equal or amount-based splits (payer included)
- Pairwise debts and net balances
- Settle up suggestions (minimum transfers)
- Soft delete and audit log
- "Birthday auth" identity labeling

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

## Data model

- `groups/{groupId}`
  - `name`, `timezone`, `members: [{ id, displayName }]`
- `groups/{groupId}/transactions/{txId}`
  - Common: `type`, `amountVnd`, `reason`, `eventAt`, `createdAt`, `createdBy`, `updatedAt`, `updatedBy`, `isDeleted`, `deletedAt`, `deletedBy`
  - LOAN: `fromId`, `toId`
  - SETTLEMENT: `fromId`, `toId`
  - EXPENSE: `payerId`, `participants: [{ memberId, shareVnd }]`
- `groups/{groupId}/transactions/{txId}/audit/{auditId}`
  - `action`, `at`, `by`, `before`, `after`

## Notes

- The birthday check is not security; it only labels UI actions.
- The first load creates the group document if it does not exist.
- Settle Up is a suggestion view. Record actual payments using SETTLEMENT entries.
