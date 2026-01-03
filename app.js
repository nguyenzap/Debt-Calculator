import { initializeApp } from "https://www.gstatic.com/firebasejs/9.22.2/firebase-app.js";
import {
  getAuth,
  onAuthStateChanged,
  signInAnonymously,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-auth.js";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCl-06VL4vj5k-_HSEv_0soXhrZ7yb3qTM",
  authDomain: "debt-25075.firebaseapp.com",
  projectId: "debt-25075",
  storageBucket: "debt-25075.firebasestorage.app",
  messagingSenderId: "367477597374",
  appId: "1:367477597374:web:1c1bc58c2ed0b57fec2aef",
  measurementId: "G-PWD6874XG5",
};

const APP_CONFIG = {
  groupId: "group-4friends",
  groupName: "Solo Knight",
  timezone: "Asia/Ho_Chi_Minh",
  members: [
    { id: "a", displayName: "Zap" },
    { id: "b", displayName: "HHc" },
    { id: "c", displayName: "Duc" },
    { id: "d", displayName: "Melwyn" },
  ],
  birthdayPasscodesByMemberId: {
    a: "060205",
    b: "1234",
    c: "1234",
    d: "1234",
  },
};

const STORAGE_KEY = "debt.currentMemberId";

const state = {
  members: [...APP_CONFIG.members],
  currentMemberId: null,
  transactions: [],
  editingTxId: null,
  selectedTxId: null,
  showDeleted: false,
  splitMode: "equal",
  expenseParticipants: [],
  eventAtDirty: false,
};

const el = {
  activeMemberName: document.getElementById("activeMemberName"),
  authStatus: document.getElementById("authStatus"),
  openIdentity: document.getElementById("openIdentity"),
  refreshData: document.getElementById("refreshData"),
  jumpAddEntry: document.getElementById("jumpAddEntry"),
  jumpSettle: document.getElementById("jumpSettle"),
  entryForm: document.getElementById("entryForm"),
  entryType: document.getElementById("entryType"),
  eventAt: document.getElementById("eventAt"),
  amountVnd: document.getElementById("amountVnd"),
  reason: document.getElementById("reason"),
  loanFields: document.getElementById("loanFields"),
  settlementFields: document.getElementById("settlementFields"),
  expenseFields: document.getElementById("expenseFields"),
  loanFrom: document.getElementById("loanFrom"),
  loanTo: document.getElementById("loanTo"),
  settleFrom: document.getElementById("settleFrom"),
  settleTo: document.getElementById("settleTo"),
  expensePayer: document.getElementById("expensePayer"),
  participantsList: document.getElementById("participantsList"),
  percentTotal: document.getElementById("percentTotal"),
  shareTotal: document.getElementById("shareTotal"),
  formError: document.getElementById("formError"),
  submitEntry: document.getElementById("submitEntry"),
  cancelEdit: document.getElementById("cancelEdit"),
  entryModeNote: document.getElementById("entryModeNote"),
  netBalances: document.getElementById("netBalances"),
  pairwiseList: document.getElementById("pairwiseList"),
  ledgerList: document.getElementById("ledgerList"),
  ledgerTypeFilter: document.getElementById("ledgerTypeFilter"),
  ledgerMemberFilter: document.getElementById("ledgerMemberFilter"),
  ledgerFrom: document.getElementById("ledgerFrom"),
  ledgerTo: document.getElementById("ledgerTo"),
  showDeleted: document.getElementById("showDeleted"),
  settleList: document.getElementById("settleList"),
  identityModal: document.getElementById("identityModal"),
  identityMember: document.getElementById("identityMember"),
  identityPasscode: document.getElementById("identityPasscode"),
  identityError: document.getElementById("identityError"),
  confirmIdentity: document.getElementById("confirmIdentity"),
  closeIdentity: document.getElementById("closeIdentity"),
  detailModal: document.getElementById("detailModal"),
  detailBody: document.getElementById("detailBody"),
  closeDetail: document.getElementById("closeDetail"),
  editEntry: document.getElementById("editEntry"),
  deleteEntry: document.getElementById("deleteEntry"),
  restoreEntry: document.getElementById("restoreEntry"),
};

let db = null;
let auth = null;
let unsubscribeTransactions = null;

init();

function init() {
  wireEvents();
  loadCurrentMember();
  updateMemberSelects();
  setIdentityLock(!state.currentMemberId);
  if (!state.currentMemberId) {
    openIdentityModal();
  }
  setDefaultEventTime();
  startFirebase();
}

function wireEvents() {
  el.openIdentity.addEventListener("click", openIdentityModal);
  el.closeIdentity.addEventListener("click", () => {
    closeModal(el.identityModal);
    setIdentityLock(false);
  });
  el.confirmIdentity.addEventListener("click", confirmIdentity);

  el.refreshData.addEventListener("click", () => {
    if (unsubscribeTransactions) {
      unsubscribeTransactions();
    }
    subscribeTransactions();
  });

  el.jumpAddEntry.addEventListener("click", () => scrollToId("entryPanel"));
  el.jumpAddEntry.addEventListener("click", refreshEventTimeIfAuto);
  el.jumpSettle.addEventListener("click", () => scrollToId("settlePanel"));

  el.entryType.addEventListener("change", updateEntryType);
  el.expensePayer.addEventListener("change", () => {
    ensurePayerIncluded();
    recalcParticipants();
  });

  document.querySelectorAll("input[name='splitMode']").forEach((radio) => {
    radio.addEventListener("change", (event) => {
      state.splitMode = event.target.value;
      recalcParticipants();
    });
  });

  el.participantsList.addEventListener("change", (event) => {
    const memberId = event.target.dataset.memberId;
    if (!memberId) return;

    const participant = state.expenseParticipants.find(
      (entry) => entry.memberId === memberId
    );
    if (!participant) return;

    if (event.target.matches("input[type='checkbox']")) {
      participant.include = event.target.checked;
      ensurePayerIncluded();
      recalcParticipants();
    }

    if (event.target.matches("input[data-share]")) {
      const value = parseInt(event.target.value, 10);
      participant.shareVnd = Number.isNaN(value) ? 0 : value;
      recalcParticipants();
    }
  });

  el.amountVnd.addEventListener("input", () => {
    refreshEventTimeIfAuto();
    recalcParticipants();
  });
  el.reason.addEventListener("input", refreshEventTimeIfAuto);
  const markEventAtDirty = () => {
    state.eventAtDirty = true;
  };
  el.eventAt.addEventListener("input", markEventAtDirty);
  el.eventAt.addEventListener("change", markEventAtDirty);

  el.entryForm.addEventListener("submit", handleSubmit);
  el.entryForm.addEventListener("focusin", refreshEventTimeIfAuto);
  el.entryForm.addEventListener("change", (event) => {
    if (event.target !== el.eventAt) {
      refreshEventTimeIfAuto();
    }
  });
  el.cancelEdit.addEventListener("click", clearEdit);

  el.ledgerTypeFilter.addEventListener("change", renderLedger);
  el.ledgerMemberFilter.addEventListener("change", renderLedger);
  el.ledgerFrom.addEventListener("change", renderLedger);
  el.ledgerTo.addEventListener("change", renderLedger);
  el.showDeleted.addEventListener("change", () => {
    state.showDeleted = el.showDeleted.checked;
    renderLedger();
  });

  el.closeDetail.addEventListener("click", () => closeModal(el.detailModal));
  el.editEntry.addEventListener("click", startEditSelected);
  el.deleteEntry.addEventListener("click", () => softDeleteSelected());
  el.restoreEntry.addEventListener("click", () => restoreSelected());
}

function startFirebase() {
  const app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  db = getFirestore(app);

  onAuthStateChanged(auth, async (user) => {
    if (user) {
      el.authStatus.textContent = "Connected";
      try {
        await ensureGroupDoc();
      } catch (error) {
        el.authStatus.textContent = "Connected (group sync failed)";
        console.error("Failed to load group doc", error);
      }
      reconcileCurrentMember();
      updateMemberSelects();
      ensurePayerIncluded();
      recalcParticipants();
      subscribeTransactions();
      if (!state.currentMemberId) {
        openIdentityModal();
      }
    } else {
      el.authStatus.textContent = "Connecting...";
    }
  });

  signInAnonymously(auth).catch((error) => {
    el.authStatus.textContent = `Auth error: ${error.code}`;
  });
}

async function ensureGroupDoc() {
  const groupRef = doc(db, "groups", APP_CONFIG.groupId);
  const snapshot = await getDoc(groupRef);
  if (!snapshot.exists()) {
    await setDoc(groupRef, {
      name: APP_CONFIG.groupName,
      timezone: APP_CONFIG.timezone,
      members: APP_CONFIG.members,
    });
    state.members = [...APP_CONFIG.members];
  } else {
    const data = snapshot.data();
    state.members = Array.isArray(data.members)
      ? data.members
      : [...APP_CONFIG.members];
  }
}

function subscribeTransactions() {
  if (!db) return;
  const txCol = collection(db, "groups", APP_CONFIG.groupId, "transactions");
  const txQuery = query(txCol, orderBy("eventAt", "desc"));
  unsubscribeTransactions = onSnapshot(txQuery, (snapshot) => {
    state.transactions = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));
    renderAll();
  });
}

function renderAll() {
  renderDashboard();
  renderLedger();
  renderSettleUp();
  updateActiveMember();
}

function updateActiveMember() {
  const member = state.members.find(
    (entry) => entry.id === state.currentMemberId
  );
  el.activeMemberName.textContent = member ? member.displayName : "Not set";
}

function applyMemberDefaults() {
  if (!state.currentMemberId) return;
  el.loanFrom.value = state.currentMemberId;
  el.settleFrom.value = state.currentMemberId;
  el.expensePayer.value = state.currentMemberId;
  ensurePayerIncluded();
  recalcParticipants();
}

function loadCurrentMember() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved && state.members.some((entry) => entry.id === saved)) {
    state.currentMemberId = saved;
  }
}

function reconcileCurrentMember() {
  if (
    state.currentMemberId &&
    !state.members.some((entry) => entry.id === state.currentMemberId)
  ) {
    state.currentMemberId = null;
    localStorage.removeItem(STORAGE_KEY);
  }
  setIdentityLock(!state.currentMemberId);
}

function openIdentityModal() {
  el.identityMember.value = state.currentMemberId || state.members[0]?.id || "";
  el.identityPasscode.value = "";
  hideIdentityError();
  setIdentityLock(!state.currentMemberId);
  openModal(el.identityModal);
}

function confirmIdentity() {
  const memberId = el.identityMember.value;
  const passcode = el.identityPasscode.value.trim();
  const expected = APP_CONFIG.birthdayPasscodesByMemberId[memberId];

  if (!expected || passcode !== expected) {
    showIdentityError("Passcode does not match.");
    return;
  }

  state.currentMemberId = memberId;
  localStorage.setItem(STORAGE_KEY, memberId);
  el.identityPasscode.value = "";
  hideIdentityError();
  closeModal(el.identityModal);
  updateActiveMember();
  applyMemberDefaults();
  setIdentityLock(false);
}

function showIdentityError(message) {
  el.identityError.textContent = message;
  el.identityError.classList.remove("hidden");
}

function hideIdentityError() {
  el.identityError.classList.add("hidden");
}

function updateMemberSelects() {
  const options = state.members
    .map((member) => `<option value="${member.id}">${member.displayName}</option>`)
    .join("");

  el.loanFrom.innerHTML = options;
  el.loanTo.innerHTML = options;
  el.settleFrom.innerHTML = options;
  el.settleTo.innerHTML = options;
  el.expensePayer.innerHTML = options;
  el.identityMember.innerHTML = options;

  const ledgerOptions = [
    '<option value="ALL">All</option>',
    ...state.members.map(
      (member) => `<option value="${member.id}">${member.displayName}</option>`
    ),
  ].join("");
  el.ledgerMemberFilter.innerHTML = ledgerOptions;

  initParticipants();
  applyMemberDefaults();
}

function initParticipants() {
  state.expenseParticipants = state.members.map((member) => ({
    memberId: member.id,
    include: true,
    shareVnd: 0,
  }));
  renderParticipants();
}

function ensurePayerIncluded() {
  const payerId = el.expensePayer.value || state.members[0]?.id;
  state.expenseParticipants = state.expenseParticipants.map((entry) => ({
    ...entry,
    include: entry.memberId === payerId ? true : entry.include,
  }));
}

function renderParticipants() {
  const rows = state.expenseParticipants
    .map((entry) => {
      const member = memberName(entry.memberId);
      const isPayer = entry.memberId === el.expensePayer.value;
      const shareValue = Number.isFinite(entry.shareVnd) ? entry.shareVnd : 0;
      return `
        <div class="participant-row">
          <div class="participant-name">
            <input
              type="checkbox"
              data-member-id="${entry.memberId}"
              ${entry.include ? "checked" : ""}
              ${isPayer ? "disabled" : ""}
            />
            <span>${member}${isPayer ? " (payer)" : ""}</span>
          </div>
          <input
            type="number"
            min="0"
            step="1"
            class="input"
            data-member-id="${entry.memberId}"
            data-share
            value="${shareValue}"
            ${state.splitMode === "equal" || !entry.include ? "disabled" : ""}
          />
        </div>
      `;
    })
    .join("");

  el.participantsList.innerHTML = rows;
  updateShareSummary();
}

function updateShareSummary() {
  const totalShares = state.expenseParticipants
    .filter((entry) => entry.include)
    .reduce((sum, entry) => sum + (entry.shareVnd || 0), 0);
  el.percentTotal.textContent = `Allocated: ${formatVnd(totalShares)}`;

  const amount = parseInt(el.amountVnd.value, 10);
  if (Number.isNaN(amount) || amount <= 0) {
    el.shareTotal.textContent = "";
    return;
  }

  const diff = amount - totalShares;
  if (diff === 0) {
    el.shareTotal.textContent = "Matches the amount.";
  } else if (diff > 0) {
    el.shareTotal.textContent = `Remaining: ${formatVnd(diff)}`;
  } else {
    el.shareTotal.textContent = `Over by: ${formatVnd(Math.abs(diff))}`;
  }
}

function recalcParticipants() {
  state.expenseParticipants = state.expenseParticipants.map((entry) => ({
    ...entry,
    shareVnd: entry.include ? entry.shareVnd : 0,
  }));

  const included = state.expenseParticipants.filter((entry) => entry.include);
  if (!included.length) {
    renderParticipants();
    return;
  }

  const amount = parseInt(el.amountVnd.value, 10);
  if (state.splitMode === "equal") {
    if (!Number.isNaN(amount) && amount > 0) {
      applyEqualShares(amount);
    } else {
      state.expenseParticipants = state.expenseParticipants.map((entry) => ({
        ...entry,
        shareVnd: entry.include ? 0 : entry.shareVnd,
      }));
    }
  }

  renderParticipants();
}

function applyEqualShares(amount) {
  const included = state.expenseParticipants.filter((entry) => entry.include);
  const count = included.length;
  if (!count) return;

  const base = Math.floor(amount / count);
  const remainder = amount - base * count;
  const ordered = [...included].sort((a, b) =>
    a.memberId.localeCompare(b.memberId)
  );

  const shareById = new Map();
  ordered.forEach((entry, index) => {
    shareById.set(entry.memberId, base + (index < remainder ? 1 : 0));
  });

  state.expenseParticipants = state.expenseParticipants.map((entry) => ({
    ...entry,
    shareVnd: entry.include ? shareById.get(entry.memberId) || 0 : 0,
  }));
}

function updateEntryType() {
  const type = el.entryType.value;
  el.loanFields.classList.toggle("hidden", type !== "LOAN");
  el.expenseFields.classList.toggle("hidden", type !== "EXPENSE");
  el.settlementFields.classList.toggle("hidden", type !== "SETTLEMENT");
  if (type === "EXPENSE") {
    ensurePayerIncluded();
    recalcParticipants();
  }
  setDefaultEventTime();
}

function setDefaultEventTime() {
  if (state.editingTxId) return;
  refreshEventTimeIfAuto();
}

async function handleSubmit(event) {
  event.preventDefault();
  clearFormError();

  if (!state.currentMemberId) {
    showFormError("Pick your identity before saving.");
    return;
  }

  const type = el.entryType.value;
  const amount = parseInt(el.amountVnd.value, 10);
  if (Number.isNaN(amount) || amount <= 0) {
    showFormError("Amount must be a positive number.");
    return;
  }

  const isEditing = Boolean(state.editingTxId);
  let eventAt = null;
  if (!isEditing && !state.eventAtDirty) {
    const now = new Date();
    el.eventAt.value = toLocalInputValue(now);
    eventAt = Timestamp.fromDate(now);
  } else {
    eventAt = toTimestamp(el.eventAt.value);
  }
  if (!eventAt) {
    if (!el.eventAt.value.trim()) {
      showFormError("Event time is required.");
    } else {
      showFormError("Event time must be DD-MM-YYYY HH:mm.");
    }
    return;
  }

  const reason = el.reason.value.trim();
  const commonFields = {
    type,
    amountVnd: amount,
    reason: reason || (type === "SETTLEMENT" ? "Settlement" : ""),
    eventAt,
  };

  if (!commonFields.reason) {
    showFormError("Reason is required for loans and expenses.");
    return;
  }

  if (type === "LOAN") {
    const fromId = el.loanFrom.value;
    const toId = el.loanTo.value;
    if (fromId === toId) {
      showFormError("Lender and borrower must be different.");
      return;
    }
    const payload = {
      ...commonFields,
      fromId,
      toId,
    };
    await saveTransaction(payload);
  }

  if (type === "SETTLEMENT") {
    const fromId = el.settleFrom.value;
    const toId = el.settleTo.value;
    if (fromId === toId) {
      showFormError("Payer and receiver must be different.");
      return;
    }
    const payload = {
      ...commonFields,
      fromId,
      toId,
    };
    await saveTransaction(payload);
  }

  if (type === "EXPENSE") {
    const payerId = el.expensePayer.value;
    ensurePayerIncluded();
    if (state.splitMode === "equal") {
      applyEqualShares(amount);
    }

    const participants = state.expenseParticipants
      .filter((entry) => entry.include)
      .map((entry) => ({
        memberId: entry.memberId,
        shareVnd: entry.shareVnd || 0,
      }));

    const shareTotal = participants.reduce((sum, entry) => sum + entry.shareVnd, 0);
    if (shareTotal !== amount) {
      showFormError("Allocated shares must equal the amount.");
      return;
    }

    const payload = {
      ...commonFields,
      payerId,
      participants,
    };
    await saveTransaction(payload);
  }
}

async function saveTransaction(payload) {
  if (!db) return;
  const isEditing = Boolean(state.editingTxId);
  const memberId = state.currentMemberId;

  if (isEditing) {
    const txId = state.editingTxId;
    const txRef = doc(db, "groups", APP_CONFIG.groupId, "transactions", txId);
    const existing = state.transactions.find((entry) => entry.id === txId);
    const updatePayload = {
      ...payload,
      updatedAt: serverTimestamp(),
      updatedBy: memberId,
    };

    await updateDoc(txRef, updatePayload);

    await addAudit(txId, {
      action: "UPDATE",
      before: existing || null,
      after: {
        ...existing,
        ...payload,
        updatedAt: Timestamp.now(),
        updatedBy: memberId,
      },
    });

    clearEdit();
    return;
  } else {
    const txCol = collection(db, "groups", APP_CONFIG.groupId, "transactions");
    const txPayload = {
      ...payload,
      createdAt: serverTimestamp(),
      createdBy: memberId,
      updatedAt: serverTimestamp(),
      updatedBy: memberId,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
    };

    const docRef = await addDoc(txCol, txPayload);

    await addAudit(docRef.id, {
      action: "CREATE",
      before: null,
      after: {
        ...txPayload,
        id: docRef.id,
        createdAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      },
    });
  }

  el.entryForm.reset();
  state.splitMode = "equal";
  state.eventAtDirty = false;
  const equalRadio = document.querySelector(
    "input[name='splitMode'][value='equal']"
  );
  if (equalRadio) equalRadio.checked = true;
  initParticipants();
  recalcParticipants();
  updateEntryType();
  setDefaultEventTime();
  applyMemberDefaults();
}

async function addAudit(txId, { action, before, after }) {
  const auditCol = collection(
    db,
    "groups",
    APP_CONFIG.groupId,
    "transactions",
    txId,
    "audit"
  );
  await addDoc(auditCol, {
    action,
    at: serverTimestamp(),
    by: state.currentMemberId,
    before,
    after,
  });
}

function renderDashboard() {
  const validTx = state.transactions.filter((entry) => !entry.isDeleted);
  const edges = buildEdges(validTx);
  const netEdges = netPairwise(edges);
  const balances = computeNetBalances(netEdges);

  el.netBalances.innerHTML = renderNetBalances(balances);
  el.pairwiseList.innerHTML = renderPairwise(netEdges);
}

function buildEdges(transactions) {
  const edges = new Map();

  const addEdge = (debtorId, creditorId, amount) => {
    if (!debtorId || !creditorId || debtorId === creditorId) return;
    const key = `${debtorId}|${creditorId}`;
    edges.set(key, (edges.get(key) || 0) + amount);
  };

  transactions.forEach((tx) => {
    if (tx.type === "LOAN") {
      addEdge(tx.toId, tx.fromId, tx.amountVnd);
    }

    if (tx.type === "SETTLEMENT") {
      addEdge(tx.fromId, tx.toId, -tx.amountVnd);
    }

    if (tx.type === "EXPENSE") {
      const payerId = tx.payerId;
      (tx.participants || []).forEach((part) => {
        if (part.memberId !== payerId) {
          addEdge(part.memberId, payerId, part.shareVnd || 0);
        }
      });
    }
  });

  return edges;
}

function netPairwise(edges) {
  const netEdges = new Map();
  const ids = state.members.map((member) => member.id);

  for (let i = 0; i < ids.length; i += 1) {
    for (let j = i + 1; j < ids.length; j += 1) {
      const a = ids[i];
      const b = ids[j];
      const ab = edges.get(`${a}|${b}`) || 0;
      const ba = edges.get(`${b}|${a}`) || 0;
      const net = ab - ba;

      if (net > 0) {
        netEdges.set(`${a}|${b}`, net);
      } else if (net < 0) {
        netEdges.set(`${b}|${a}`, Math.abs(net));
      }
    }
  }

  return netEdges;
}

function computeNetBalances(netEdges) {
  const balances = {};
  state.members.forEach((member) => {
    balances[member.id] = 0;
  });

  netEdges.forEach((amount, key) => {
    const [debtorId, creditorId] = key.split("|");
    balances[debtorId] -= amount;
    balances[creditorId] += amount;
  });

  return balances;
}

function renderNetBalances(balances) {
  const entries = Object.entries(balances).sort(
    (a, b) => Math.abs(b[1]) - Math.abs(a[1])
  );
  if (!entries.length) {
    return "<p class='muted'>No balances yet.</p>";
  }

  return entries
    .map(([memberId, net]) => {
      const label = memberName(memberId);
      const direction = net >= 0 ? "receive" : "pay";
      const amount = formatVnd(Math.abs(net));
      return `
        <div class="ledger-item">
          <div class="flex items-center justify-between">
            <strong>${label}</strong>
            <span class="chip ${net >= 0 ? "" : "settlement"}">${direction}</span>
          </div>
          <div class="ledger-meta">${amount}</div>
        </div>
      `;
    })
    .join("");
}

function renderPairwise(netEdges) {
  if (netEdges.size === 0) {
    return "<p class='muted'>No pairwise debts yet.</p>";
  }

  const items = [];
  netEdges.forEach((amount, key) => {
    const [debtorId, creditorId] = key.split("|");
    items.push({
      debtor: debtorId,
      creditor: creditorId,
      amount,
    });
  });

  return items
    .sort((a, b) => b.amount - a.amount)
    .map((item) => {
      return `
        <div class="ledger-item">
          <div class="flex items-center justify-between">
            <strong>${memberName(item.debtor)} owes ${memberName(
        item.creditor
      )}</strong>
            <span class="chip loan">Debt</span>
          </div>
          <div class="ledger-meta">${formatVnd(item.amount)}</div>
        </div>
      `;
    })
    .join("");
}

function renderLedger() {
  const typeFilter = el.ledgerTypeFilter.value;
  const memberFilter = el.ledgerMemberFilter.value;
  const fromDate = el.ledgerFrom.value ? new Date(el.ledgerFrom.value) : null;
  const toDate = el.ledgerTo.value
    ? new Date(`${el.ledgerTo.value}T23:59:59`)
    : null;

  const filtered = state.transactions
    .filter((entry) => state.showDeleted || !entry.isDeleted)
    .filter((entry) => (typeFilter === "ALL" ? true : entry.type === typeFilter))
    .filter((entry) =>
      memberFilter === "ALL" ? true : transactionInvolves(entry, memberFilter)
    )
    .filter((entry) => {
      const date = getEventDate(entry);
      if (!date) return true;
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
      return true;
    })
    .sort((a, b) => (getEventDate(b) || 0) - (getEventDate(a) || 0));

  if (!filtered.length) {
    el.ledgerList.innerHTML = "<p class='muted'>No transactions yet.</p>";
    return;
  }

  el.ledgerList.innerHTML = filtered
    .map((entry) => renderLedgerItem(entry))
    .join("");

  document.querySelectorAll("[data-tx-id]").forEach((item) => {
    item.addEventListener("click", () => showEntryDetail(item.dataset.txId));
  });
}

function renderLedgerItem(entry) {
  const desc = describeTransaction(entry);
  const time = formatDateTime(getEventDate(entry));
  const chipClass =
    entry.type === "EXPENSE"
      ? ""
      : entry.type === "LOAN"
        ? "loan"
        : "settlement";
  const deleted = entry.isDeleted ? "deleted" : "";

  return `
    <div class="ledger-item ${deleted}" data-tx-id="${entry.id}">
      <div class="flex items-center justify-between">
        <strong>${desc.title}</strong>
        <span class="chip ${chipClass}">${entry.type}</span>
      </div>
      <div class="ledger-meta">${desc.detail}</div>
      <div class="ledger-meta">${time}</div>
    </div>
  `;
}

function renderSettleUp() {
  const validTx = state.transactions.filter((entry) => !entry.isDeleted);
  const edges = buildEdges(validTx);
  const netEdges = netPairwise(edges);
  const balances = computeNetBalances(netEdges);
  const suggestions = buildSettleSuggestions(balances);

  if (!suggestions.length) {
    el.settleList.innerHTML = "<p class='muted'>Nothing to settle yet.</p>";
    return;
  }

  el.settleList.innerHTML = suggestions
    .map((suggestion) => {
      return `
      <div class="ledger-item">
        <div class="flex items-center justify-between">
          <strong>${memberName(suggestion.debtor)} pays ${memberName(
        suggestion.creditor
      )}</strong>
          <span class="chip settlement">Settle</span>
        </div>
        <div class="ledger-meta">${formatVnd(suggestion.amount)}</div>
        <button class="btn btn-ghost" data-settle="${suggestion.debtor}|${
        suggestion.creditor
      }|${suggestion.amount}">Record settlement</button>
      </div>
      `;
    })
    .join("");

  document.querySelectorAll("[data-settle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [fromId, toId, amount] = btn.dataset.settle.split("|");
      prefillSettlement(fromId, toId, parseInt(amount, 10));
    });
  });
}

function buildSettleSuggestions(balances) {
  const debtors = [];
  const creditors = [];
  Object.entries(balances).forEach(([memberId, net]) => {
    if (net < 0) {
      debtors.push({ memberId, amount: Math.abs(net) });
    } else if (net > 0) {
      creditors.push({ memberId, amount: net });
    }
  });

  debtors.sort((a, b) => b.amount - a.amount);
  creditors.sort((a, b) => b.amount - a.amount);

  const transfers = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const pay = Math.min(debtor.amount, creditor.amount);
    transfers.push({ debtor: debtor.memberId, creditor: creditor.memberId, amount: pay });
    debtor.amount -= pay;
    creditor.amount -= pay;
    if (debtor.amount === 0) i += 1;
    if (creditor.amount === 0) j += 1;
  }

  return transfers;
}

function prefillSettlement(fromId, toId, amount) {
  el.entryType.value = "SETTLEMENT";
  updateEntryType();
  el.settleFrom.value = fromId;
  el.settleTo.value = toId;
  el.amountVnd.value = amount;
  el.reason.value = "Settlement";
  el.eventAt.value = toLocalInputValue(new Date());
  scrollToId("entryPanel");
}

function describeTransaction(entry) {
  const amount = formatVnd(entry.amountVnd || 0);

  if (entry.type === "LOAN") {
    return {
      title: `Loan: ${memberName(entry.toId)} owes ${memberName(entry.fromId)}`,
      detail: `${amount} for ${entry.reason}`,
    };
  }

  if (entry.type === "SETTLEMENT") {
    return {
      title: `Settlement: ${memberName(entry.fromId)} paid ${memberName(
        entry.toId
      )}`,
      detail: `${amount} ${entry.reason ? `(${entry.reason})` : ""}`.trim(),
    };
  }

  if (entry.type === "EXPENSE") {
    const participants = (entry.participants || [])
      .map((part) => memberName(part.memberId))
      .join(", ");
    return {
      title: `Expense: ${memberName(entry.payerId)} paid ${amount}`,
      detail: `${entry.reason} | Split: ${participants}`,
    };
  }

  return { title: "Transaction", detail: "" };
}

function transactionInvolves(entry, memberId) {
  if (entry.type === "LOAN" || entry.type === "SETTLEMENT") {
    return entry.fromId === memberId || entry.toId === memberId;
  }

  if (entry.type === "EXPENSE") {
    if (entry.payerId === memberId) return true;
    return (entry.participants || []).some(
      (part) => part.memberId === memberId
    );
  }

  return false;
}

function showEntryDetail(txId) {
  const entry = state.transactions.find((tx) => tx.id === txId);
  if (!entry) return;
  state.selectedTxId = txId;

  const desc = describeTransaction(entry);
  const impacts = computeImpacts(entry);
  const meta = [
    { label: "Type", value: entry.type },
    { label: "Amount", value: formatVnd(entry.amountVnd || 0) },
    { label: "Reason", value: entry.reason || "" },
    { label: "Event time", value: formatDateTime(getEventDate(entry)) },
    { label: "Created by", value: memberName(entry.createdBy) },
    { label: "Updated by", value: memberName(entry.updatedBy) },
  ];

  const detailHtml = `
    <div class="stack">
      <div>
        <h4 class="panel-title">${desc.title}</h4>
        <p class="muted">${desc.detail}</p>
      </div>
      <div class="details-grid">
        ${meta
          .map(
            (row) => `
              <div>
                <p class="label">${row.label}</p>
                <p>${row.value || "-"}</p>
              </div>
            `
          )
          .join("")}
      </div>
      <div>
        <p class="label">Impacts</p>
        ${
          impacts.length
            ? impacts
                .map(
                  (impact) => `
                    <div class="ledger-item">
                      <strong>${impact.label}</strong>
                      <div class="ledger-meta">${impact.note}</div>
                    </div>
                  `
                )
                .join("")
            : "<p class='muted'>No impact entries.</p>"
        }
      </div>
      <div class="audit-log" id="auditLog">Loading audit...</div>
    </div>
  `;

  el.detailBody.innerHTML = detailHtml;
  el.restoreEntry.classList.toggle("hidden", !entry.isDeleted);
  el.deleteEntry.classList.toggle("hidden", entry.isDeleted);

  openModal(el.detailModal);
  loadAudit(entry.id);
}

function computeImpacts(entry) {
  if (entry.type === "LOAN") {
    return [
      {
        label: `${memberName(entry.toId)} owes ${memberName(entry.fromId)}`,
        note: formatVnd(entry.amountVnd || 0),
      },
    ];
  }

  if (entry.type === "SETTLEMENT") {
    return [
      {
        label: `${memberName(entry.fromId)} paid ${memberName(entry.toId)}`,
        note: `Reduces debt by ${formatVnd(entry.amountVnd || 0)}`,
      },
    ];
  }

  if (entry.type === "EXPENSE") {
    return (entry.participants || [])
      .filter((part) => part.memberId !== entry.payerId)
      .map((part) => ({
        label: `${memberName(part.memberId)} owes ${memberName(entry.payerId)}`,
        note: formatVnd(part.shareVnd || 0),
      }));
  }

  return [];
}

async function loadAudit(txId) {
  const auditCol = collection(
    db,
    "groups",
    APP_CONFIG.groupId,
    "transactions",
    txId,
    "audit"
  );
  const auditQuery = query(auditCol, orderBy("at", "desc"));
  const snapshot = await getDocs(auditQuery);

  const entries = snapshot.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));

  if (!entries.length) {
    document.getElementById("auditLog").innerHTML =
      "<p class='muted'>No audit events yet.</p>";
    return;
  }

  const html = entries
    .map((entry) => {
      const when = formatDateTime(toDate(entry.at));
      const by = memberName(entry.by);
      const before = entry.before ? formatJson(entry.before) : null;
      const after = entry.after ? formatJson(entry.after) : null;
      return `
        <div class="audit-entry">
          <p class="label">${entry.action} by ${by}</p>
          <p class="muted">${when}</p>
          <details>
            <summary>View snapshot</summary>
            <pre>${before ? `Before:\n${before}\n` : ""}${
        after ? `After:\n${after}` : ""
      }</pre>
          </details>
        </div>
      `;
    })
    .join("");

  document.getElementById("auditLog").innerHTML = html;
}

function startEditSelected() {
  const entry = state.transactions.find((tx) => tx.id === state.selectedTxId);
  if (!entry) return;

  state.editingTxId = entry.id;
  el.entryType.value = entry.type;
  el.entryType.disabled = true;
  updateEntryType();
  el.amountVnd.value = entry.amountVnd || "";
  el.reason.value = entry.reason || "";
  el.eventAt.value = toLocalInputValue(getEventDate(entry));

  if (entry.type === "LOAN") {
    el.loanFrom.value = entry.fromId;
    el.loanTo.value = entry.toId;
  }

  if (entry.type === "SETTLEMENT") {
    el.settleFrom.value = entry.fromId;
    el.settleTo.value = entry.toId;
  }

  if (entry.type === "EXPENSE") {
    el.expensePayer.value = entry.payerId;
    state.splitMode = "unequal";
    document.querySelector("input[name='splitMode'][value='unequal']").checked = true;
    state.expenseParticipants = state.members.map((member) => {
      const existing = (entry.participants || []).find(
        (part) => part.memberId === member.id
      );
      return {
        memberId: member.id,
        include: Boolean(existing),
        shareVnd: existing ? existing.shareVnd : 0,
      };
    });
    ensurePayerIncluded();
    renderParticipants();
  }

  el.entryModeNote.textContent = `Editing ${entry.type} entry.`;
  el.cancelEdit.classList.remove("hidden");
  el.submitEntry.textContent = "Update Entry";
  closeModal(el.detailModal);
  scrollToId("entryPanel");
}

function clearEdit() {
  state.editingTxId = null;
  el.entryType.disabled = false;
  el.entryModeNote.textContent = "Create a new transaction.";
  el.cancelEdit.classList.add("hidden");
  el.submitEntry.textContent = "Save Entry";
  el.entryForm.reset();
  setDefaultEventTime();
  state.splitMode = "equal";
  state.eventAtDirty = false;
  document.querySelector("input[name='splitMode'][value='equal']").checked = true;
  initParticipants();
  recalcParticipants();
  updateEntryType();
  applyMemberDefaults();
}

async function softDeleteSelected() {
  const entry = state.transactions.find((tx) => tx.id === state.selectedTxId);
  if (!entry) return;
  if (!confirm("Soft delete this entry?")) return;

  const txRef = doc(db, "groups", APP_CONFIG.groupId, "transactions", entry.id);
  const updatePayload = {
    isDeleted: true,
    deletedAt: serverTimestamp(),
    deletedBy: state.currentMemberId,
    updatedAt: serverTimestamp(),
    updatedBy: state.currentMemberId,
  };

  await updateDoc(txRef, updatePayload);
  await addAudit(entry.id, {
    action: "SOFT_DELETE",
    before: entry,
    after: {
      ...entry,
      isDeleted: true,
      deletedAt: Timestamp.now(),
      deletedBy: state.currentMemberId,
    },
  });

  closeModal(el.detailModal);
}

async function restoreSelected() {
  const entry = state.transactions.find((tx) => tx.id === state.selectedTxId);
  if (!entry) return;

  const txRef = doc(db, "groups", APP_CONFIG.groupId, "transactions", entry.id);
  const updatePayload = {
    isDeleted: false,
    deletedAt: null,
    deletedBy: null,
    updatedAt: serverTimestamp(),
    updatedBy: state.currentMemberId,
  };

  await updateDoc(txRef, updatePayload);
  await addAudit(entry.id, {
    action: "RESTORE",
    before: entry,
    after: {
      ...entry,
      isDeleted: false,
      deletedAt: null,
      deletedBy: null,
      updatedAt: Timestamp.now(),
      updatedBy: state.currentMemberId,
    },
  });

  closeModal(el.detailModal);
}

function setIdentityLock(locked) {
  document.body.classList.toggle("locked", locked);
  el.closeIdentity.classList.toggle("hidden", locked);
  el.closeIdentity.disabled = locked;
}

function refreshEventTimeIfAuto() {
  if (state.editingTxId || state.eventAtDirty) return;
  el.eventAt.value = toLocalInputValue(new Date());
}

function openModal(modal) {
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeModal(modal) {
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

function showFormError(message) {
  el.formError.textContent = message;
  el.formError.classList.remove("hidden");
}

function clearFormError() {
  el.formError.textContent = "";
  el.formError.classList.add("hidden");
}

function scrollToId(id) {
  const target = document.getElementById(id);
  if (target) {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function formatVnd(amount) {
  if (!Number.isFinite(amount)) return "0 VND";
  return `${new Intl.NumberFormat("vi-VN").format(amount)} VND`;
}

function memberName(memberId) {
  const member = state.members.find((entry) => entry.id === memberId);
  return member ? member.displayName : memberId || "Unknown";
}

function toTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date) return Timestamp.fromDate(value);
  if (typeof value === "string") {
    const parsed = parseDateTimeInput(value);
    if (!parsed) return null;
    return Timestamp.fromDate(parsed);
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return Timestamp.fromDate(date);
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  if (typeof value.toDate === "function") return value.toDate();
  return new Date(value);
}

function getEventDate(entry) {
  return toDate(entry.eventAt) || toDate(entry.createdAt);
}

function formatDateTime(date) {
  if (!date) return "";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function toLocalInputValue(date) {
  if (!date) return "";
  const pad = (num) => String(num).padStart(2, "0");
  return `${pad(date.getDate())}-${pad(date.getMonth() + 1)}-${date.getFullYear()} ${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function parseDateTimeInput(value) {
  if (!value) return null;
  const trimmed = value.trim();
  const match = trimmed.match(
    /^(\\d{2})[\\/\\-](\\d{2})[\\/\\-](\\d{4})[ T](\\d{2}):(\\d{2})$/
  );
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  if (
    Number.isNaN(day) ||
    Number.isNaN(month) ||
    Number.isNaN(year) ||
    Number.isNaN(hour) ||
    Number.isNaN(minute)
  ) {
    return null;
  }
  if (
    day < 1 ||
    day > 31 ||
    month < 1 ||
    month > 12 ||
    hour < 0 ||
    hour > 23 ||
    minute < 0 ||
    minute > 59
  ) {
    return null;
  }
  const date = new Date(year, month - 1, day, hour, minute, 0, 0);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute
  ) {
    return null;
  }
  return date;
}

function formatJson(value) {
  return JSON.stringify(
    value,
    (key, val) => {
      if (val && typeof val.toDate === "function") {
        return val.toDate().toISOString();
      }
      return val;
    },
    2
  );
}

updateEntryType();
