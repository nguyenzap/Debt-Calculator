/**
 * Side-effect-free debt-ledger calculations shared by the browser UI and tests.
 *
 * Money is represented as integer VND. A pairwise edge key has the form
 * `debtorId|creditorId`, and a positive net balance means the member should
 * receive money.
 */

const DEFAULT_LOCALE = "vi-VN";

function finiteNumber(value) {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number : 0;
}

function positiveAmount(value) {
  return Math.max(0, finiteNumber(value));
}

function normalizedMemberIds(members = []) {
  const ids = members
    .map((member) => (typeof member === "object" && member ? member.id : member))
    .filter((memberId) => memberId !== null && memberId !== undefined && memberId !== "");
  return [...new Set(ids)];
}

function explanationContext(options = {}) {
  const nameOf =
    typeof options.memberName === "function"
      ? options.memberName
      : (memberId) => memberName(memberId, options.members);
  const money =
    typeof options.formatAmount === "function" ? options.formatAmount : formatVnd;
  return { nameOf, money };
}

export function buildEqualSharesMap(amount, memberIds = []) {
  const ids = normalizedMemberIds(memberIds);
  const shares = new Map();
  if (!ids.length) return shares;

  const total = Math.max(0, Math.trunc(finiteNumber(amount)));
  const base = Math.floor(total / ids.length);
  const remainder = total - base * ids.length;
  const ordered = [...ids].sort((a, b) => String(a).localeCompare(String(b)));

  ordered.forEach((memberId, index) => {
    shares.set(memberId, base + (index < remainder ? 1 : 0));
  });
  return shares;
}

/**
 * Recalculate the expense participant rows without reading or mutating UI state.
 * In custom mode, locked shares are preserved and the remainder is split equally
 * among included, unlocked members.
 */
export function recalculateExpenseShares(
  participants = [],
  amount,
  splitMode = "equal"
) {
  const rows = participants.map((participant) => ({
    ...participant,
    include: Boolean(participant.include),
    shareVnd: participant.include ? positiveAmount(participant.shareVnd) : 0,
    locked: participant.include ? Boolean(participant.locked) : false,
  }));
  const included = rows.filter((participant) => participant.include);
  if (!included.length) return rows;

  const total = Math.max(0, Math.trunc(finiteNumber(amount)));
  if (splitMode === "equal") {
    const shares = buildEqualSharesMap(
      total,
      included.map((participant) => participant.memberId)
    );
    return rows.map((participant) => ({
      ...participant,
      locked: false,
      shareVnd: participant.include ? shares.get(participant.memberId) || 0 : 0,
    }));
  }

  const lockedTotal = included
    .filter((participant) => participant.locked)
    .reduce((sum, participant) => sum + participant.shareVnd, 0);
  const unlocked = included.filter((participant) => !participant.locked);
  if (!unlocked.length) return rows;

  const remaining = total - lockedTotal;
  const shares =
    remaining >= 0
      ? buildEqualSharesMap(
          remaining,
          unlocked.map((participant) => participant.memberId)
        )
      : new Map();

  return rows.map((participant) => {
    if (!participant.include || participant.locked) return participant;
    return { ...participant, shareVnd: shares.get(participant.memberId) || 0 };
  });
}

/** Build raw directed debt edges from active transactions. */
export function buildEdges(transactions = [], { includeDeleted = false } = {}) {
  const edges = new Map();
  const addEdge = (debtorId, creditorId, amount) => {
    if (!debtorId || !creditorId || debtorId === creditorId || !amount) return;
    const key = `${debtorId}|${creditorId}`;
    edges.set(key, (edges.get(key) || 0) + amount);
  };

  transactions.forEach((transaction) => {
    if (!includeDeleted && transaction.isDeleted) return;

    if (transaction.type === "LOAN") {
      addEdge(
        transaction.toId,
        transaction.fromId,
        positiveAmount(transaction.amountVnd)
      );
      return;
    }

    if (transaction.type === "SETTLEMENT") {
      addEdge(
        transaction.fromId,
        transaction.toId,
        -positiveAmount(transaction.amountVnd)
      );
      return;
    }

    if (transaction.type === "EXPENSE") {
      const payerId = transaction.payerId;
      (transaction.participants || []).forEach((participant) => {
        if (participant.memberId !== payerId) {
          addEdge(
            participant.memberId,
            payerId,
            positiveAmount(participant.shareVnd)
          );
        }
      });
    }
  });

  return edges;
}

function memberIdsFromEdges(edges) {
  const ids = [];
  edges.forEach((_amount, key) => {
    const [debtorId, creditorId] = key.split("|");
    ids.push(debtorId, creditorId);
  });
  return normalizedMemberIds(ids).sort((a, b) => String(a).localeCompare(String(b)));
}

/** Cancel opposite-direction debts between every member pair. */
export function netPairwise(edges = new Map(), members = []) {
  const requestedIds = normalizedMemberIds(members);
  const requested = new Set(requestedIds);
  const extraIds = memberIdsFromEdges(edges).filter((memberId) => !requested.has(memberId));
  const ids = [...requestedIds, ...extraIds];
  const netEdges = new Map();

  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i];
      const b = ids[j];
      const net = finiteNumber(edges.get(`${a}|${b}`)) - finiteNumber(edges.get(`${b}|${a}`));
      if (net > 0) {
        netEdges.set(`${a}|${b}`, net);
      } else if (net < 0) {
        netEdges.set(`${b}|${a}`, Math.abs(net));
      }
    }
  }
  return netEdges;
}

export function computeNetBalances(netEdges = new Map(), members = []) {
  const balances = {};
  normalizedMemberIds(members).forEach((memberId) => {
    balances[memberId] = 0;
  });

  netEdges.forEach((rawAmount, key) => {
    const [debtorId, creditorId] = key.split("|");
    const amount = positiveAmount(rawAmount);
    if (!(debtorId in balances)) balances[debtorId] = 0;
    if (!(creditorId in balances)) balances[creditorId] = 0;
    balances[debtorId] -= amount;
    balances[creditorId] += amount;
  });
  return balances;
}

/**
 * Greedily match the largest debtors and creditors. This always clears a
 * balanced ledger, though it does not promise the mathematical minimum number
 * of transfers.
 */
export function buildSettleSuggestions(balances = {}) {
  const debtors = [];
  const creditors = [];

  Object.entries(balances).forEach(([memberId, rawNet]) => {
    const net = finiteNumber(rawNet);
    if (net < 0) debtors.push({ memberId, amount: Math.abs(net) });
    if (net > 0) creditors.push({ memberId, amount: net });
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const suggestions = [];
  let debtorIndex = 0;
  let creditorIndex = 0;
  while (debtorIndex < debtors.length && creditorIndex < creditors.length) {
    const debtor = debtors[debtorIndex];
    const creditor = creditors[creditorIndex];
    const amount = Math.min(debtor.amount, creditor.amount);
    if (amount > 0) {
      suggestions.push({
        debtor: debtor.memberId,
        creditor: creditor.memberId,
        amount,
      });
    }
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) debtorIndex += 1;
    if (creditor.amount === 0) creditorIndex += 1;
  }
  return suggestions;
}

export function buildLedgerSummary(transactions = [], members = []) {
  const edges = buildEdges(transactions);
  const netEdges = netPairwise(edges, members);
  const balances = computeNetBalances(netEdges, members);
  return {
    edges,
    netEdges,
    balances,
    suggestions: buildSettleSuggestions(balances),
  };
}

// Positive amount means debtorId owes creditorId more after this transaction.
export function pairDelta(transaction, debtorId, creditorId, options = {}) {
  const { nameOf, money } = explanationContext(options);
  const amount = positiveAmount(transaction.amountVnd);
  const none = { amount: 0, note: "" };

  if (transaction.type === "LOAN") {
    if (transaction.fromId === creditorId && transaction.toId === debtorId) {
      return {
        amount,
        note: `${nameOf(creditorId)} lent ${nameOf(debtorId)} ${money(amount)}`,
      };
    }
    if (transaction.fromId === debtorId && transaction.toId === creditorId) {
      return {
        amount: -amount,
        note: `${nameOf(debtorId)} lent ${nameOf(creditorId)} ${money(amount)}, which cancels out debt`,
      };
    }
    return none;
  }

  if (transaction.type === "SETTLEMENT") {
    if (transaction.fromId === debtorId && transaction.toId === creditorId) {
      return {
        amount: -amount,
        note: `${nameOf(debtorId)} paid back ${money(amount)}`,
      };
    }
    if (transaction.fromId === creditorId && transaction.toId === debtorId) {
      return {
        amount,
        note: `${nameOf(creditorId)} paid back ${money(amount)}, which swings the debt the other way`,
      };
    }
    return none;
  }

  if (transaction.type === "EXPENSE") {
    const shareOf = (memberId) => {
      const participant = (transaction.participants || []).find(
        (entry) => entry.memberId === memberId
      );
      return participant ? positiveAmount(participant.shareVnd) : 0;
    };

    if (transaction.payerId === creditorId && debtorId !== creditorId) {
      const share = shareOf(debtorId);
      return share
        ? {
            amount: share,
            note: `${nameOf(creditorId)} paid ${money(amount)} and ${nameOf(debtorId)}'s share was ${money(share)}`,
          }
        : none;
    }

    if (transaction.payerId === debtorId && debtorId !== creditorId) {
      const share = shareOf(creditorId);
      return share
        ? {
            amount: -share,
            note: `${nameOf(debtorId)} paid ${money(amount)} and ${nameOf(creditorId)}'s share was ${money(share)}`,
          }
        : none;
    }
  }

  return none;
}

// Positive amount means memberId should receive more after this transaction.
export function balanceDelta(transaction, memberId, options = {}) {
  const { nameOf, money } = explanationContext(options);
  const amount = positiveAmount(transaction.amountVnd);
  const none = { amount: 0, note: "" };

  if (transaction.type === "LOAN") {
    if (transaction.fromId === memberId) {
      return { amount, note: `Lent ${money(amount)} to ${nameOf(transaction.toId)}` };
    }
    if (transaction.toId === memberId) {
      return {
        amount: -amount,
        note: `Borrowed ${money(amount)} from ${nameOf(transaction.fromId)}`,
      };
    }
    return none;
  }

  if (transaction.type === "SETTLEMENT") {
    if (transaction.fromId === memberId) {
      return { amount, note: `Paid ${money(amount)} to ${nameOf(transaction.toId)}` };
    }
    if (transaction.toId === memberId) {
      return {
        amount: -amount,
        note: `Received ${money(amount)} from ${nameOf(transaction.fromId)}`,
      };
    }
    return none;
  }

  if (transaction.type === "EXPENSE") {
    const participants = transaction.participants || [];
    if (transaction.payerId === memberId) {
      const othersTotal = participants
        .filter((participant) => participant.memberId !== memberId)
        .reduce((sum, participant) => sum + positiveAmount(participant.shareVnd), 0);
      if (!othersTotal) return none;
      const own = participants.find((participant) => participant.memberId === memberId);
      const ownShare = own ? positiveAmount(own.shareVnd) : 0;
      return {
        amount: othersTotal,
        note: `Paid ${money(amount)}, own share ${money(ownShare)}, so the others owe ${money(othersTotal)}`,
      };
    }

    const own = participants.find((participant) => participant.memberId === memberId);
    const share = own ? positiveAmount(own.shareVnd) : 0;
    return share
      ? {
          amount: -share,
          note: `${nameOf(transaction.payerId)} paid ${money(amount)} and this share was ${money(share)}`,
        }
      : none;
  }

  return none;
}

export function sortActiveTransactions(transactions = []) {
  return transactions
    .filter((transaction) => !transaction.isDeleted)
    .map((transaction, index) => ({ transaction, index, date: getEventDate(transaction) }))
    .sort((a, b) => {
      const byTime = (a.date ? a.date.getTime() : 0) - (b.date ? b.date.getTime() : 0);
      return byTime || a.index - b.index;
    })
    .map(({ transaction }) => transaction);
}

export function buildContributions(transactions = [], deltaFor = () => ({ amount: 0 })) {
  const rows = [];
  let running = 0;

  sortActiveTransactions(transactions).forEach((transaction) => {
    const delta = deltaFor(transaction) || { amount: 0, note: "" };
    const amount = finiteNumber(delta.amount);
    if (!amount) return;
    running += amount;
    rows.push({
      txId: transaction.id,
      date: getEventDate(transaction),
      type: transaction.type,
      reason: transaction.reason || "",
      note: delta.note || "",
      delta: amount,
      running,
    });
  });

  return { rows, total: running };
}

// Turn a long contribution trace into human-sized chapters. A chapter closes
// whenever a payment is recorded, or whenever the running balance reaches zero.
export function buildJourneyChapters(rows = []) {
  const chapters = [];
  let pending = [];

  const closeChapter = (boundary) => {
    if (!pending.length) return;
    const first = pending[0];
    const last = pending[pending.length - 1];
    chapters.push({
      rows: pending,
      boundary,
      before: finiteNumber(first.running) - finiteNumber(first.delta),
      after: finiteNumber(last.running),
      startDate: first.date || null,
      endDate: last.date || null,
      netChange:
        finiteNumber(last.running) -
        (finiteNumber(first.running) - finiteNumber(first.delta)),
    });
    pending = [];
  };

  rows.forEach((row) => {
    pending.push(row);
    if (finiteNumber(row.running) === 0) {
      closeChapter("square");
    } else if (row.type === "SETTLEMENT") {
      closeChapter("settlement");
    }
  });
  closeChapter("open");
  return chapters;
}

// Only the entries after the latest zero balance are relevant to the current
// debt. If the latest entry is square, there is no open journey to explain.
export function getOpenJourneyRows(rows = []) {
  let latestSquareIndex = -1;
  rows.forEach((row, index) => {
    if (finiteNumber(row.running) === 0) latestSquareIndex = index;
  });
  return rows.slice(latestSquareIndex + 1);
}

export function describeTransaction(transaction, options = {}) {
  const { nameOf, money } = explanationContext(options);
  const amount = money(positiveAmount(transaction.amountVnd));
  const reason = transaction.reason || "";

  if (transaction.type === "LOAN") {
    return {
      title: `Loan: ${nameOf(transaction.toId)} owes ${nameOf(transaction.fromId)}`,
      reason,
      detail: amount,
    };
  }
  if (transaction.type === "SETTLEMENT") {
    return {
      title: `Settlement: ${nameOf(transaction.fromId)} paid ${nameOf(transaction.toId)}`,
      reason,
      detail: amount,
    };
  }
  if (transaction.type === "EXPENSE") {
    const participants = (transaction.participants || [])
      .map(
        (participant) =>
          `${nameOf(participant.memberId)} ${money(positiveAmount(participant.shareVnd))}`
      )
      .join(" \u00b7 ");
    return {
      title: `Expense: ${nameOf(transaction.payerId)} paid ${amount}`,
      reason,
      detail: `Split: ${participants}`,
    };
  }
  return { title: "Transaction", reason, detail: "" };
}

export function transactionInvolves(transaction, memberId) {
  if (transaction.type === "LOAN" || transaction.type === "SETTLEMENT") {
    return transaction.fromId === memberId || transaction.toId === memberId;
  }
  if (transaction.type === "EXPENSE") {
    return (
      transaction.payerId === memberId ||
      (transaction.participants || []).some(
        (participant) => participant.memberId === memberId
      )
    );
  }
  return false;
}

export function computeImpacts(transaction, options = {}) {
  const { nameOf, money } = explanationContext(options);
  if (transaction.type === "LOAN") {
    return [
      {
        label: `${nameOf(transaction.toId)} owes ${nameOf(transaction.fromId)}`,
        note: money(positiveAmount(transaction.amountVnd)),
      },
    ];
  }
  if (transaction.type === "SETTLEMENT") {
    return [
      {
        label: `${nameOf(transaction.fromId)} paid ${nameOf(transaction.toId)}`,
        note: `Records ${money(positiveAmount(transaction.amountVnd))} against their balance`,
      },
    ];
  }
  if (transaction.type === "EXPENSE") {
    return (transaction.participants || [])
      .filter((participant) => participant.memberId !== transaction.payerId)
      .map((participant) => ({
        label: `${nameOf(participant.memberId)} owes ${nameOf(transaction.payerId)}`,
        note: money(positiveAmount(participant.shareVnd)),
      }));
  }
  return [];
}

export function formatVnd(amount, locale = DEFAULT_LOCALE) {
  const value = Number.isFinite(amount) ? amount : 0;
  return `${new Intl.NumberFormat(locale).format(value)} VND`;
}

export function formatSignedVnd(amount, locale = DEFAULT_LOCALE) {
  if (!Number.isFinite(amount) || amount === 0) return "0 VND";
  return `${amount > 0 ? "+" : "\u2212"}${formatVnd(Math.abs(amount), locale)}`;
}

export function memberName(memberId, members = []) {
  const member = members.find((entry) => entry.id === memberId);
  return member ? member.displayName : memberId || "Unknown";
}

export function toDate(value) {
  if (!value) return null;
  let date;
  if (value instanceof Date) {
    date = new Date(value.getTime());
  } else if (typeof value.toDate === "function") {
    date = value.toDate();
  } else {
    date = new Date(value);
  }
  return date instanceof Date && !Number.isNaN(date.getTime()) ? date : null;
}

export function getEventDate(transaction = {}) {
  return toDate(transaction.eventAt) || toDate(transaction.createdAt);
}

export function formatDateTime(value, { locale = DEFAULT_LOCALE, timeZone } = {}) {
  const date = toDate(value);
  if (!date) return "";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    ...(timeZone ? { timeZone } : {}),
  }).format(date);
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

export function toLocalInputValue(value) {
  const date = toDate(value);
  if (!date) return "";
  return `${pad2(date.getDate())}-${pad2(date.getMonth() + 1)}-${date.getFullYear()} ${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function toPickerInputValue(value) {
  const date = toDate(value);
  if (!date) return "";
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}T${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

export function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  const escapes = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  };
  return String(value).replace(/[&<>"']/g, (character) => escapes[character]);
}

export function formatJson(value) {
  return JSON.stringify(
    value,
    (_key, item) => {
      if (item && typeof item.toDate === "function") {
        return item.toDate().toISOString();
      }
      return item;
    },
    2
  );
}
