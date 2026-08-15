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
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from "https://www.gstatic.com/firebasejs/9.22.2/firebase-firestore.js";
import * as ledgerCore from "./ledger-core.js";

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
  activeView: "overview",
  editingTxId: null,
  selectedTxId: null,
  showDeleted: false,
  splitMode: "equal",
  expenseParticipants: [],
  eventAtDirty: false,
  modalFocusStack: [],
  peopleContext: null,
  breakdownContext: null,
  detailReturnBreakdown: null,
};

const el = {
  activeMemberName: document.getElementById("activeMemberName"),
  activeMemberAvatar: document.getElementById("activeMemberAvatar"),
  authStatus: document.getElementById("authStatus"),
  openIdentity: document.getElementById("openIdentity"),
  openPeople: document.getElementById("openPeople"),
  refreshData: document.getElementById("refreshData"),
  jumpAddEntry: document.getElementById("jumpAddEntry"),
  jumpSettle: document.getElementById("jumpSettle"),
  overviewGreeting: document.getElementById("overviewGreeting"),
  overviewExplainBalance: document.getElementById("overviewExplainBalance"),
  personalBalanceCard: document.getElementById("personalBalanceCard"),
  personalBalanceLabel: document.getElementById("personalBalanceLabel"),
  personalBalanceAmount: document.getElementById("personalBalanceAmount"),
  personalBalanceFoot: document.getElementById("personalBalanceFoot"),
  amountYouOwe: document.getElementById("amountYouOwe"),
  peopleYouOweCount: document.getElementById("peopleYouOweCount"),
  amountOwedToYou: document.getElementById("amountOwedToYou"),
  peopleOweCount: document.getElementById("peopleOweCount"),
  trackedEntryCount: document.getElementById("trackedEntryCount"),
  myRelationships: document.getElementById("myRelationships"),
  recentActivity: document.getElementById("recentActivity"),
  entryForm: document.getElementById("entryForm"),
  entryModal: document.getElementById("entryModal"),
  closeEntry: document.getElementById("closeEntry"),
  entryType: document.getElementById("entryType"),
  entryCategory: document.getElementById("entryCategory"),
  eventAt: document.getElementById("eventAt"),
  eventAtPickerBtn: document.getElementById("eventAtPickerBtn"),
  eventAtPicker: document.getElementById("eventAtPicker"),
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
  ledgerSearch: document.getElementById("ledgerSearch"),
  ledgerResultCount: document.getElementById("ledgerResultCount"),
  ledgerTypeFilter: document.getElementById("ledgerTypeFilter"),
  ledgerMemberFilter: document.getElementById("ledgerMemberFilter"),
  ledgerFrom: document.getElementById("ledgerFrom"),
  ledgerTo: document.getElementById("ledgerTo"),
  showDeleted: document.getElementById("showDeleted"),
  clearLedgerFilters: document.getElementById("clearLedgerFilters"),
  exportLedger: document.getElementById("exportLedger"),
  settleList: document.getElementById("settleList"),
  settleSummary: document.getElementById("settleSummary"),
  networkGraph: document.getElementById("networkGraph"),
  peopleModal: document.getElementById("peopleModal"),
  peopleList: document.getElementById("peopleList"),
  personForm: document.getElementById("personForm"),
  personName: document.getElementById("personName"),
  addPerson: document.getElementById("addPerson"),
  peopleError: document.getElementById("peopleError"),
  closePeople: document.getElementById("closePeople"),
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
  breakdownModal: document.getElementById("breakdownModal"),
  breakdownTitle: document.getElementById("breakdownTitle"),
  breakdownBody: document.getElementById("breakdownBody"),
  closeBreakdown: document.getElementById("closeBreakdown"),
};

let db = null;
let auth = null;
let unsubscribeTransactions = null;
let unsubscribeGroup = null;
let networkSimulation = null;
let d3Library = null;
let d3LoadPromise = null;
let networkRenderVersion = 0;

function init() {
  wireEvents();
  loadCurrentMember();
  updateMemberSelects({ preserveSelections: false });
  switchView(initialViewFromHash(), { focus: false, updateHash: false });
  setIdentityLock(!state.currentMemberId);
  if (!state.currentMemberId) {
    openIdentityModal();
  }
  setDefaultEventTime();
  startFirebase();
}

function wireEvents() {
  document.querySelectorAll("[data-view-target]").forEach((control) => {
    control.addEventListener("click", () => switchView(control.dataset.viewTarget));
  });

  document.querySelectorAll("[data-open-entry]").forEach((control) => {
    control.addEventListener("click", () => {
      if (control.dataset.entryType && !state.editingTxId) {
        el.entryType.value = control.dataset.entryType;
        updateEntryType();
      }
      openEntryComposer();
    });
  });

  document.querySelectorAll("[data-open-people]").forEach((control) => {
    control.addEventListener("click", openPeopleModal);
  });

  el.openIdentity.addEventListener("click", openIdentityModal);
  el.identityPasscode.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      confirmIdentity();
    }
  });
  el.closeIdentity.addEventListener("click", () => {
    closeModal(el.identityModal);
    setIdentityLock(false);
  });
  el.confirmIdentity.addEventListener("click", confirmIdentity);
  el.openPeople.addEventListener("click", openPeopleModal);
  el.closePeople.addEventListener("click", () => closeModal(el.peopleModal));
  el.personForm.addEventListener("submit", addLedgerPerson);
  el.closeEntry.addEventListener("click", () => closeModal(el.entryModal));

  el.refreshData.addEventListener("click", () => {
    el.authStatus.textContent = "Refreshing...";
    if (unsubscribeTransactions) {
      unsubscribeTransactions();
    }
    if (unsubscribeGroup) {
      unsubscribeGroup();
    }
    subscribeGroup();
    subscribeTransactions();
  });

  el.jumpAddEntry.addEventListener("click", openEntryComposer);
  el.jumpSettle.addEventListener("click", () => switchView("settle"));
  el.overviewExplainBalance.addEventListener("click", openCurrentMemberBreakdown);
  el.personalBalanceCard.addEventListener("click", openCurrentMemberBreakdown);

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
      if (!participant.include) {
        participant.locked = false;
        participant.shareVnd = 0;
      }
      ensurePayerIncluded();
      recalcParticipants();
      restoreParticipantFocus(memberId, "include");
    }

    if (event.target.matches("input[data-share]")) {
      const value = parseInt(event.target.value, 10);
      participant.shareVnd = Number.isNaN(value) ? 0 : Math.max(0, value);
      if (state.splitMode === "unequal") {
        participant.locked = true;
      }
      recalcParticipants();
      restoreParticipantFocus(memberId, "share");
    }
  });

  el.participantsList.addEventListener("click", (event) => {
    const memberId = event.target.dataset.lock;
    if (!memberId || state.splitMode === "equal") return;
    const participant = state.expenseParticipants.find(
      (entry) => entry.memberId === memberId
    );
    if (!participant || !participant.include) return;
    participant.locked = !participant.locked;
    recalcParticipants();
    restoreParticipantFocus(memberId, "lock");
  });

  el.amountVnd.addEventListener("input", () => {
    refreshEventTimeIfAuto();
    recalcParticipants();
  });
  el.reason.addEventListener("input", refreshEventTimeIfAuto);
  el.eventAtPickerBtn.addEventListener("click", toggleEventPicker);
  el.eventAtPicker.addEventListener("change", () => {
    if (!el.eventAtPicker.value) return;
    const date = new Date(el.eventAtPicker.value);
    if (!Number.isNaN(date.getTime())) {
      setEventAtValue(date, true);
    }
    el.eventAtPicker.classList.add("hidden");
    el.eventAtPickerBtn.focus();
  });
  el.entryForm.addEventListener("submit", handleSubmit);
  el.entryForm.addEventListener("focusin", refreshEventTimeIfAuto);
  el.entryForm.addEventListener("change", (event) => {
    if (event.target !== el.eventAt) {
      refreshEventTimeIfAuto();
    }
  });
  el.cancelEdit.addEventListener("click", () => {
    clearEdit();
    closeModal(el.entryModal);
  });

  el.ledgerTypeFilter.addEventListener("change", renderLedger);
  el.ledgerMemberFilter.addEventListener("change", renderLedger);
  el.ledgerFrom.addEventListener("change", renderLedger);
  el.ledgerTo.addEventListener("change", renderLedger);
  el.ledgerSearch.addEventListener("input", renderLedger);
  el.showDeleted.addEventListener("change", () => {
    state.showDeleted = el.showDeleted.checked;
    renderLedger();
  });
  el.clearLedgerFilters.addEventListener("click", () => {
    el.ledgerSearch.value = "";
    el.ledgerTypeFilter.value = "ALL";
    el.ledgerMemberFilter.value = state.currentMemberId || "ALL";
    el.ledgerFrom.value = "";
    el.ledgerTo.value = "";
    el.showDeleted.checked = false;
    state.showDeleted = false;
    el.clearLedgerFilters.closest("details")?.removeAttribute("open");
    renderLedger();
    el.ledgerSearch.focus();
  });
  el.exportLedger.addEventListener("click", exportLedgerSnapshot);

  el.closeDetail.addEventListener("click", () => closeModal(el.detailModal));
  el.editEntry.addEventListener("click", startEditSelected);
  el.deleteEntry.addEventListener("click", () => softDeleteSelected());
  el.restoreEntry.addEventListener("click", () => restoreSelected());

  el.netBalances.addEventListener("click", (event) => {
    const item = event.target.closest("[data-balance-member]");
    if (!item) return;
    openBalanceBreakdown(item.dataset.balanceMember);
  });

  el.myRelationships.addEventListener("click", handlePairSelection);
  el.pairwiseList.addEventListener("click", handlePairSelection);
  el.recentActivity.addEventListener("click", (event) => {
    const item = event.target.closest("[data-tx-id]");
    if (item) showEntryDetail(item.dataset.txId);
  });

  el.closeBreakdown.addEventListener("click", () => closeModal(el.breakdownModal));
  el.breakdownBody.addEventListener("click", (event) => {
    const backEl = event.target.closest("[data-back-member]");
    if (backEl) {
      openBalanceBreakdown(backEl.dataset.backMember);
      return;
    }

    const pairEl = event.target.closest("[data-pair]");
    if (pairEl) {
      const [debtorId, creditorId] = pairEl.dataset.pair.split("|");
      openPairwiseBreakdown(debtorId, creditorId, pairEl.dataset.fromMember || null);
      return;
    }

    const txEl = event.target.closest("[data-open-tx]");
    if (txEl) {
      const returnContext = state.breakdownContext;
      closeModal(el.breakdownModal);
      showEntryDetail(txEl.dataset.openTx, { returnToBreakdown: returnContext });
    }
  });

  document.querySelectorAll(".modal").forEach((modal) => {
    modal.addEventListener("mousedown", (event) => {
      if (event.target === modal && modal !== el.identityModal) closeModal(modal);
    });
  });

  document.addEventListener("keydown", handleModalKeyboard);
  window.addEventListener("hashchange", () => {
    switchView(initialViewFromHash(), { focus: false, updateHash: false });
  });
}

function handlePairSelection(event) {
  const item = event.target.closest("[data-pair]");
  if (!item) return;
  const [debtorId, creditorId] = item.dataset.pair.split("|");
  openPairwiseBreakdown(debtorId, creditorId);
}

function initialViewFromHash() {
  const requested = window.location.hash.replace("#", "");
  return ["overview", "activity", "settle", "network"].includes(requested)
    ? requested
    : "overview";
}

function switchView(viewName, { focus = true, updateHash = true } = {}) {
  const nextView = ["overview", "activity", "settle", "network"].includes(viewName)
    ? viewName
    : "overview";
  state.activeView = nextView;

  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    const active = panel.dataset.viewPanel === nextView;
    panel.classList.toggle("hidden", !active);
    panel.classList.toggle("active", active);
    panel.setAttribute("aria-hidden", String(!active));
  });

  document.querySelectorAll("[data-view-target]").forEach((control) => {
    const active = control.dataset.viewTarget === nextView;
    const navigationItem = control.matches(".nav-item, .mobile-nav-item");
    if (navigationItem) {
      control.classList.toggle("active", active);
      if (active) {
        control.setAttribute("aria-current", "page");
      } else {
        control.removeAttribute("aria-current");
      }
    }
  });

  if (updateHash && window.location.hash !== `#${nextView}`) {
    history.replaceState(null, "", `#${nextView}`);
  }

  if (nextView === "network") {
    requestAnimationFrame(renderNetworkFromState);
  } else if (networkSimulation) {
    networkSimulation.stop();
    networkSimulation = null;
  }

  if (focus) {
    const heading = document.querySelector(
      `[data-view-panel="${nextView}"] h1`
    );
    if (heading) {
      heading.tabIndex = -1;
      heading.focus({ preventScroll: true });
    }
    window.scrollTo({
      top: 0,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }
}

function openEntryComposer() {
  refreshEventTimeIfAuto();
  openModal(el.entryModal, el.entryType);
}

function openCurrentMemberBreakdown() {
  if (state.currentMemberId) openBalanceBreakdown(state.currentMemberId);
}

function isIdentityMember(memberId) {
  return Object.prototype.hasOwnProperty.call(
    APP_CONFIG.birthdayPasscodesByMemberId,
    memberId
  );
}

function identityMembers() {
  return state.members.filter((member) => isIdentityMember(member.id));
}

function openPeopleModal(event) {
  state.peopleContext = event?.currentTarget?.closest("#entryModal")
    ? el.entryType.value
    : null;
  el.personForm.reset();
  hidePeopleError();
  renderPeople();
  openModal(el.peopleModal, el.personName);
}

function renderPeople() {
  if (!state.members.length) {
    el.peopleList.innerHTML = "<p class='empty-state'>No ledger people yet.</p>";
    return;
  }

  el.peopleList.innerHTML = state.members
    .map((member) => {
      const identity = isIdentityMember(member.id);
      return `
        <div class="person-row">
          <div class="person-identity">
            <span class="relationship-avatar" aria-hidden="true">${escapeHtml(
              memberInitials(member.displayName)
            )}</span>
            <strong>${escapeHtml(member.displayName)}</strong>
          </div>
          <span class="person-badge ${identity ? "" : "contact"}">
            ${identity ? "App member" : "Ledger only"}
          </span>
        </div>
      `;
    })
    .join("");
}

async function addLedgerPerson(event) {
  event.preventDefault();
  hidePeopleError();
  const displayName = el.personName.value.trim().replace(/\s+/g, " ");

  if (displayName.length < 2) {
    showPeopleError("Enter at least 2 characters for the person's name.");
    return;
  }

  if (
    state.members.some(
      (member) => member.displayName.toLocaleLowerCase() === displayName.toLocaleLowerCase()
    )
  ) {
    showPeopleError("That person is already in the ledger.");
    return;
  }

  if (!db) {
    showPeopleError("The ledger is still connecting. Try again in a moment.");
    return;
  }

  const personId = `contact-${
    globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`
  }`;
  const groupRef = doc(db, "groups", APP_CONFIG.groupId);
  el.addPerson.disabled = true;
  el.addPerson.textContent = "Adding...";

  try {
    const updatedMembers = await runTransaction(db, async (transaction) => {
      const snapshot = await transaction.get(groupRef);
      const existingMembers = snapshot.exists() && Array.isArray(snapshot.data().members)
        ? snapshot.data().members
        : [...APP_CONFIG.members];
      const duplicate = existingMembers.some(
        (member) =>
          String(member.displayName || "").toLocaleLowerCase() ===
          displayName.toLocaleLowerCase()
      );
      if (duplicate) throw new Error("DUPLICATE_PERSON");

      const nextMembers = [
        ...existingMembers,
        { id: personId, displayName, ledgerOnly: true },
      ];
      transaction.set(
        groupRef,
        { members: nextMembers },
        { merge: true }
      );
      return nextMembers;
    });

    state.members = updatedMembers;
    updateMemberSelects({
      newContactId: state.peopleContext ? personId : null,
    });
    renderPeople();
    renderAll();
    el.personForm.reset();
    if (state.peopleContext) {
      closeModal(el.peopleModal);
      state.peopleContext = null;
    } else {
      el.personName.focus();
    }
  } catch (error) {
    console.error("Failed to add ledger person", error);
    showPeopleError(
      error?.message === "DUPLICATE_PERSON"
        ? "That person is already in the ledger."
        : "Could not add this person. Please try again."
    );
  } finally {
    el.addPerson.disabled = false;
    el.addPerson.textContent = "Add person";
  }
}

function showPeopleError(message) {
  el.peopleError.textContent = message;
  el.peopleError.classList.remove("hidden");
}

function hidePeopleError() {
  el.peopleError.textContent = "";
  el.peopleError.classList.add("hidden");
}

function handleModalKeyboard(event) {
  const openModals = [...document.querySelectorAll(".modal:not(.hidden)")];
  const modal = openModals.at(-1);
  if (!modal) return;

  if (event.key === "Escape") {
    if (modal === el.identityModal && !state.currentMemberId) return;
    event.preventDefault();
    closeModal(modal);
    return;
  }

  if (event.key !== "Tab") return;
  const focusable = [...modal.querySelectorAll(
    'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
  )].filter(
    (control) => !control.closest(".hidden") && control.getClientRects().length > 0
  );
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
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
      subscribeGroup();
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

function subscribeGroup() {
  if (!db) return;
  const groupRef = doc(db, "groups", APP_CONFIG.groupId);
  unsubscribeGroup = onSnapshot(
    groupRef,
    (snapshot) => {
      if (!snapshot.exists()) return;
      const members = snapshot.data().members;
      if (!Array.isArray(members)) return;
      state.members = members;
      reconcileCurrentMember();
      updateMemberSelects({ preserveSelections: true });
      renderAll();
    },
    (error) => {
      console.error("Group subscription failed", error);
      el.authStatus.textContent = "People sync unavailable";
    }
  );
}

function subscribeTransactions() {
  if (!db) return;
  const txCol = collection(db, "groups", APP_CONFIG.groupId, "transactions");
  const txQuery = query(txCol, orderBy("eventAt", "desc"));
  unsubscribeTransactions = onSnapshot(
    txQuery,
    (snapshot) => {
      state.transactions = snapshot.docs.map((docSnap) => ({
        id: docSnap.id,
        ...docSnap.data(),
      }));
      el.authStatus.textContent = "Connected";
      renderAll();
    },
    (error) => {
      console.error("Ledger subscription failed", error);
      el.authStatus.textContent = "Sync unavailable";
    }
  );
}

function renderAll() {
  renderDashboard();
  renderLedger();
  renderSettleUp();
  updateActiveMember();
  if (state.activeView === "network") renderNetworkFromState();
}

function updateActiveMember() {
  const member = state.members.find(
    (entry) => entry.id === state.currentMemberId
  );
  el.activeMemberName.textContent = member ? member.displayName : "Not set";
  el.openIdentity.setAttribute(
    "aria-label",
    member
      ? `Switch identity, currently ${member.displayName}`
      : "Choose who is using the ledger"
  );
  el.activeMemberAvatar.textContent = member
    ? memberInitials(member.displayName)
    : "?";
  el.overviewGreeting.textContent = member
    ? `${member.displayName}, this is what you owe, what you are owed, and every reason behind it.`
    : "Your personal balance and every entry behind it, in one place.";
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
    (!state.members.some((entry) => entry.id === state.currentMemberId) ||
      !isIdentityMember(state.currentMemberId))
  ) {
    state.currentMemberId = null;
    localStorage.removeItem(STORAGE_KEY);
  }
  setIdentityLock(!state.currentMemberId);
}

function openIdentityModal() {
  el.identityMember.value =
    state.currentMemberId || identityMembers()[0]?.id || "";
  el.identityPasscode.value = "";
  hideIdentityError();
  setIdentityLock(!state.currentMemberId);
  openModal(el.identityModal, el.identityMember);
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
  updateMemberSelects({ preserveSelections: true });
  applyMemberDefaults();
  renderAll();
  setIdentityLock(false);
}

function showIdentityError(message) {
  el.identityError.textContent = message;
  el.identityError.classList.remove("hidden");
}

function hideIdentityError() {
  el.identityError.classList.add("hidden");
}

function updateMemberSelects({ preserveSelections = true, newContactId = null } = {}) {
  const previous = preserveSelections
    ? {
        loanFrom: el.loanFrom.value,
        loanTo: el.loanTo.value,
        settleFrom: el.settleFrom.value,
        settleTo: el.settleTo.value,
        expensePayer: el.expensePayer.value,
        ledgerMember: el.ledgerMemberFilter.value,
        participants: new Map(
          state.expenseParticipants.map((participant) => [
            participant.memberId,
            { ...participant },
          ])
        ),
      }
    : null;

  const options = state.members
    .map(
      (member) =>
        `<option value="${escapeHtml(member.id)}">${escapeHtml(
          member.displayName
        )}</option>`
    )
    .join("");

  el.loanFrom.innerHTML = options;
  el.loanTo.innerHTML = options;
  el.settleFrom.innerHTML = options;
  el.settleTo.innerHTML = options;
  el.expensePayer.innerHTML = options;

  el.identityMember.innerHTML = identityMembers()
    .map(
      (member) =>
        `<option value="${escapeHtml(member.id)}">${escapeHtml(
          member.displayName
        )}</option>`
    )
    .join("");

  const ledgerOptions = [
    '<option value="ALL">Everyone</option>',
    ...state.members.map(
      (member) =>
        `<option value="${escapeHtml(member.id)}">${escapeHtml(
          member.id === state.currentMemberId
            ? `My activity (${member.displayName})`
            : member.displayName
        )}</option>`
    ),
  ].join("");
  el.ledgerMemberFilter.innerHTML = ledgerOptions;

  const validId = (memberId) =>
    state.members.some((member) => member.id === memberId);
  if (previous) {
    el.loanFrom.value = validId(previous.loanFrom)
      ? previous.loanFrom
      : state.currentMemberId || state.members[0]?.id || "";
    el.loanTo.value = validId(previous.loanTo)
      ? previous.loanTo
      : newContactId || state.members[1]?.id || state.members[0]?.id || "";
    el.settleFrom.value = validId(previous.settleFrom)
      ? previous.settleFrom
      : state.currentMemberId || state.members[0]?.id || "";
    el.settleTo.value = validId(previous.settleTo)
      ? previous.settleTo
      : newContactId || state.members[1]?.id || state.members[0]?.id || "";
    el.expensePayer.value = validId(previous.expensePayer)
      ? previous.expensePayer
      : state.currentMemberId || state.members[0]?.id || "";
    el.ledgerMemberFilter.value =
      previous.ledgerMember === "ALL" || validId(previous.ledgerMember)
        ? previous.ledgerMember
        : state.currentMemberId || "ALL";
    state.expenseParticipants = state.members.map((member) =>
      previous.participants.get(member.id) || {
        memberId: member.id,
        include: Boolean(newContactId && state.peopleContext === "EXPENSE" && member.id === newContactId),
        shareVnd: 0,
        locked: false,
      }
    );
    if (newContactId && validId(newContactId)) {
      if (state.peopleContext === "LOAN") el.loanTo.value = newContactId;
      if (state.peopleContext === "SETTLEMENT") el.settleTo.value = newContactId;
    }
    ensurePayerIncluded();
    renderParticipants();
    recalcParticipants();
  } else {
    initParticipants();
    applyMemberDefaults();
    el.ledgerMemberFilter.value = state.currentMemberId || "ALL";
  }

  if (state.currentMemberId && isIdentityMember(state.currentMemberId)) {
    el.identityMember.value = state.currentMemberId;
  }
}

function initParticipants() {
  state.expenseParticipants = state.members.map((member) => ({
    memberId: member.id,
    include: true,
    shareVnd: 0,
    locked: false,
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
      const memberId = escapeHtml(entry.memberId);
      const isPayer = entry.memberId === el.expensePayer.value;
      const shareValue = Number.isFinite(entry.shareVnd) ? entry.shareVnd : 0;
      const lockLabel = entry.locked ? "Locked" : "Auto";
      const lockClass = entry.locked ? "active" : "";
      const lockDisabled = state.splitMode === "equal" || !entry.include;
      return `
        <div class="participant-row">
          <label class="participant-name">
            <input
              type="checkbox"
              data-member-id="${memberId}"
              ${entry.include ? "checked" : ""}
              ${isPayer ? "disabled" : ""}
            />
            <span>${escapeHtml(member)}${isPayer ? " (payer)" : ""}</span>
          </label>
          <input
            type="number"
            min="0"
            step="1"
            class="input"
            data-member-id="${memberId}"
            data-share
            aria-label="${escapeHtml(`${member}'s share in VND`)}"
            value="${shareValue}"
            ${state.splitMode === "equal" || !entry.include ? "disabled" : ""}
          />
          <button
            type="button"
            class="lock-btn ${lockClass}"
            data-lock="${memberId}"
            aria-label="${escapeHtml(`${lockLabel} ${member}'s share`)}"
            aria-pressed="${entry.locked ? "true" : "false"}"
            ${lockDisabled ? "disabled" : ""}
          >
            ${lockLabel}
          </button>
        </div>
      `;
    })
    .join("");

  el.participantsList.innerHTML = rows;
  updateShareSummary();
}

function restoreParticipantFocus(memberId, controlType) {
  requestAnimationFrame(() => {
    const controls = [...el.participantsList.querySelectorAll("input, button")];
    const target = controls.find((control) => {
      if (controlType === "lock") return control.dataset.lock === memberId;
      if (control.dataset.memberId !== memberId) return false;
      if (controlType === "include") return control.matches("input[type='checkbox']");
      return control.hasAttribute("data-share");
    });
    target?.focus();
  });
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
  const amount = parseInt(el.amountVnd.value, 10);
  state.expenseParticipants = ledgerCore.recalculateExpenseShares(
    state.expenseParticipants,
    Number.isNaN(amount) ? 0 : amount,
    state.splitMode
  );
  renderParticipants();
}

function applyEqualShares(amount) {
  const memberIds = state.expenseParticipants
    .filter((entry) => entry.include)
    .map((entry) => entry.memberId);
  const shareById = ledgerCore.buildEqualSharesMap(amount, memberIds);
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
  if (!db) {
    showFormError("The ledger is still connecting. Try again in a moment.");
    return;
  }

  const type = el.entryType.value;
  const amount = parseInt(el.amountVnd.value, 10);
  if (Number.isNaN(amount) || amount <= 0) {
    showFormError("Amount must be a positive number.");
    return;
  }

  const isEditing = Boolean(state.editingTxId);
  let eventAtDate = null;
  if (!isEditing && !state.eventAtDirty) {
    eventAtDate = new Date();
    setEventAtValue(eventAtDate);
  } else {
    eventAtDate = getPickerDate();
  }
  if (!eventAtDate) {
    showFormError("Pick an event time.");
    return;
  }
  const eventAt = Timestamp.fromDate(eventAtDate);

  const reason = el.reason.value.trim();
  const commonFields = {
    type,
    amountVnd: amount,
    reason: reason || (type === "SETTLEMENT" ? "Settlement" : ""),
    category: el.entryCategory.value || null,
    schemaVersion: 2,
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
    await submitTransactionPayload(payload);
    return;
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
    await submitTransactionPayload(payload);
    return;
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
      splitMethod: state.splitMode === "equal" ? "equal" : "custom",
    };
    await submitTransactionPayload(payload);
  }
}

async function submitTransactionPayload(payload) {
  const previousLabel = el.submitEntry.textContent;
  el.submitEntry.disabled = true;
  el.submitEntry.textContent = state.editingTxId ? "Updating..." : "Saving...";
  try {
    await saveTransaction(payload);
  } catch (error) {
    console.error("Failed to save transaction", error);
    showFormError("The entry could not be saved. Check the connection and try again.");
  } finally {
    el.submitEntry.disabled = false;
    if (!state.editingTxId && el.entryModal.classList.contains("hidden")) {
      el.submitEntry.textContent = "Save Entry";
    } else {
      el.submitEntry.textContent = previousLabel;
    }
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
    closeModal(el.entryModal);
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
  el.eventAtPicker.classList.add("hidden");
  const equalRadio = document.querySelector(
    "input[name='splitMode'][value='equal']"
  );
  if (equalRadio) equalRadio.checked = true;
  initParticipants();
  recalcParticipants();
  updateEntryType();
  setDefaultEventTime();
  applyMemberDefaults();
  closeModal(el.entryModal);
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
  const activeTransactions = state.transactions.filter((entry) => !entry.isDeleted);
  const { netEdges, balances } = ledgerCore.buildLedgerSummary(
    activeTransactions,
    state.members
  );
  const currentMemberId = state.currentMemberId;
  const relationships = personalRelationships(netEdges, currentMemberId);
  const youOwe = relationships
    .filter((relationship) => relationship.kind === "owes")
    .reduce((sum, relationship) => sum + relationship.amount, 0);
  const owedToYou = relationships
    .filter((relationship) => relationship.kind === "owed")
    .reduce((sum, relationship) => sum + relationship.amount, 0);
  const net = currentMemberId ? balances[currentMemberId] || 0 : 0;

  el.personalBalanceLabel.textContent =
    net > 0 ? "You should receive overall" : net < 0 ? "You need to pay overall" : "Your net balance";
  el.personalBalanceAmount.textContent = currentMemberId
    ? formatSignedVnd(net)
    : "Choose identity";
  el.personalBalanceCard.dataset.balanceState =
    net > 0 ? "receive" : net < 0 ? "pay" : "even";
  el.personalBalanceFoot.textContent = currentMemberId
    ? relationships.length
      ? `${relationships.length} open ${relationships.length === 1 ? "relationship" : "relationships"}; tap to see every reason.`
      : "You are all square with everyone in this ledger."
    : "Choose who is using the ledger to see a personal explanation.";
  el.amountYouOwe.textContent = formatVnd(youOwe);
  el.peopleYouOweCount.textContent = countPeopleText(
    relationships.filter((relationship) => relationship.kind === "owes").length,
    "person to pay",
    "people to pay"
  );
  el.amountOwedToYou.textContent = formatVnd(owedToYou);
  el.peopleOweCount.textContent = countPeopleText(
    relationships.filter((relationship) => relationship.kind === "owed").length,
    "person who owes you",
    "people who owe you"
  );
  el.trackedEntryCount.textContent = String(activeTransactions.length);

  el.myRelationships.innerHTML = renderPersonalRelationships(relationships);
  const recent = activeTransactions
    .filter((entry) => currentMemberId && transactionInvolves(entry, currentMemberId))
    .slice()
    .sort((a, b) => (getEventDate(b)?.getTime() || 0) - (getEventDate(a)?.getTime() || 0))
    .slice(0, 5);
  el.recentActivity.innerHTML = recent.length
    ? recent.map((entry) => renderActivityItem(entry, { compact: true })).join("")
    : `<div class="empty-state"><strong>No activity for you yet</strong><span>Add an entry and its reason will appear here.</span></div>`;
  el.netBalances.innerHTML = renderNetBalances(balances);
  el.pairwiseList.innerHTML = renderPairwise(netEdges);
}

function countPeopleText(count, singular, plural) {
  if (!count) return singular === "person to pay" ? "No one to pay" : "No one owes you";
  return `${count} ${count === 1 ? singular : plural}`;
}

function personalRelationships(netEdges, memberId) {
  if (!memberId) return [];
  const relationships = [];
  netEdges.forEach((amount, key) => {
    const [debtorId, creditorId] = key.split("|");
    if (debtorId === memberId) {
      relationships.push({
        debtorId,
        creditorId,
        otherId: creditorId,
        amount,
        kind: "owes",
      });
    } else if (creditorId === memberId) {
      relationships.push({
        debtorId,
        creditorId,
        otherId: debtorId,
        amount,
        kind: "owed",
      });
    }
  });
  return relationships.sort((a, b) => b.amount - a.amount);
}

function renderPersonalRelationships(relationships) {
  if (!state.currentMemberId) {
    return `<div class="empty-state"><strong>Choose your identity</strong><span>Your personal debts will appear here.</span></div>`;
  }
  if (!relationships.length) {
    return `<div class="empty-state"><strong>You are all square</strong><span>There are no open debts between you and anyone else.</span></div>`;
  }
  return relationships
    .map((relationship) => {
      const other = memberName(relationship.otherId);
      const history = buildContributions((transaction) =>
        pairDelta(transaction, relationship.debtorId, relationship.creditorId)
      );
      return `
        <button class="relationship-row ${relationship.kind}" type="button" data-pair="${escapeHtml(
          `${relationship.debtorId}|${relationship.creditorId}`
        )}">
          <span class="relationship-avatar" aria-hidden="true">${escapeHtml(memberInitials(other))}</span>
          <span class="relationship-copy">
            <strong>${escapeHtml(other)}</strong>
            <span>${history.rows.length} ${history.rows.length === 1 ? "entry explains" : "entries explain"} this amount</span>
          </span>
          <span class="relationship-amount">
            <strong>${formatVnd(relationship.amount)}</strong>
            <span>${relationship.kind === "owes" ? "You owe" : "Owes you"}</span>
          </span>
        </button>`;
    })
    .join("");
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
      const label = escapeHtml(memberName(memberId));
      const direction = net > 0 ? "receive" : net < 0 ? "pay" : "even";
      const amount = formatVnd(Math.abs(net));
      return `
        <button class="group-balance ${direction}" type="button" data-balance-member="${escapeHtml(memberId)}">
          <span class="group-balance-person">
            <span class="relationship-avatar" aria-hidden="true">${escapeHtml(memberInitials(memberName(memberId)))}</span>
            <strong>${label}${memberId === state.currentMemberId ? " (you)" : ""}</strong>
          </span>
          <span class="group-balance-value">
            <strong>${amount}</strong>
            <span>${direction === "receive" ? "should receive" : direction === "pay" ? "should pay" : "all square"}</span>
          </span>
        </button>
      `;
    })
    .join("");
}

function renderPairwise(netEdges) {
  if (netEdges.size === 0) {
    return `<div class="empty-state"><strong>No open relationships</strong><span>The group is completely settled.</span></div>`;
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
      const debtor = memberName(item.debtor);
      const creditor = memberName(item.creditor);
      return `
        <button class="relationship-row owes" type="button" data-pair="${escapeHtml(
          item.debtor
        )}|${escapeHtml(item.creditor)}">
          <span class="relationship-avatar" aria-hidden="true">${escapeHtml(memberInitials(debtor))}</span>
          <span class="relationship-copy">
            <strong>${escapeHtml(debtor)} <span aria-hidden="true">&rarr;</span> ${escapeHtml(creditor)}</strong>
            <span>${escapeHtml(debtor)} owes ${escapeHtml(creditor)}</span>
          </span>
          <span class="relationship-amount"><strong>${formatVnd(item.amount)}</strong><span>Open explanation</span></span>
        </button>
      `;
    })
    .join("");
}

async function renderNetworkFromState() {
  if (!el.networkGraph) return;
  const renderVersion = ++networkRenderVersion;
  if (networkSimulation) networkSimulation.stop();

  const { netEdges } = ledgerCore.buildLedgerSummary(
    state.transactions,
    state.members
  );
  const links = [...netEdges.entries()].map(([key, amount]) => {
    const [debtorId, creditorId] = key.split("|");
    return {
      source: debtorId,
      target: creditorId,
      debtorId,
      creditorId,
      amount,
    };
  });
  const nodes = state.members.map((member) => ({
    id: member.id,
    name: member.displayName,
    current: member.id === state.currentMemberId,
  }));

  el.networkGraph.innerHTML = "";
  if (!links.length) {
    el.networkGraph.innerHTML = `<div class="empty-state network-empty"><strong>No open debt to map</strong><span>Everyone in the ledger is currently square.</span></div>`;
    return;
  }

  el.networkGraph.innerHTML = `<div class="empty-state network-empty"><strong>Drawing the money map...</strong><span>The exact relationships are already available in the list below.</span></div>`;
  let d3;
  try {
    d3 = await loadD3();
  } catch (error) {
    console.error("Could not load the optional network renderer", error);
    el.networkGraph.innerHTML = `<div class="empty-state network-empty"><strong>The visual map is unavailable</strong><span>Use the complete relationship list below; it contains the same amounts and explanations.</span></div>`;
    return;
  }
  if (renderVersion !== networkRenderVersion || state.activeView !== "network") return;

  const width = 900;
  const height = 500;
  el.networkGraph.innerHTML = "";
  const svg = d3
    .select(el.networkGraph)
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("aria-label", "Current debt relationships. The same values are available in the list below.");

  const defs = svg.append("defs");
  defs
    .append("marker")
    .attr("id", "debt-arrow")
    .attr("viewBox", "0 -5 10 10")
    .attr("refX", 8)
    .attr("refY", 0)
    .attr("markerWidth", 7)
    .attr("markerHeight", 7)
    .attr("orient", "auto")
    .append("path")
    .attr("d", "M0,-5L10,0L0,5")
    .attr("fill", "#958979");

  const linkGroup = svg
    .append("g")
    .selectAll("g")
    .data(links)
    .join("g")
    .attr("role", "button")
    .attr("tabindex", 0)
    .attr(
      "aria-label",
      (link) =>
        `${memberName(link.debtorId)} owes ${memberName(link.creditorId)} ${formatVnd(link.amount)}. Open explanation.`
    )
    .on("click", (_event, link) =>
      openPairwiseBreakdown(link.debtorId, link.creditorId)
    )
    .on("keydown", (event, link) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openPairwiseBreakdown(link.debtorId, link.creditorId);
      }
    });

  const visibleLinks = linkGroup
    .append("line")
    .attr("class", "network-link")
    .attr("stroke-width", (link) => Math.max(2, Math.min(8, 2 + Math.log10(link.amount + 1))))
    .attr("marker-end", "url(#debt-arrow)");
  linkGroup.append("line").attr("class", "network-link-hit");
  const linkLabels = linkGroup
    .append("text")
    .attr("class", "network-link-label")
    .text((link) => compactVnd(link.amount));

  const node = svg
    .append("g")
    .selectAll("g")
    .data(nodes)
    .join("g")
    .attr("class", (person) => `network-node${person.current ? " current" : ""}`)
    .attr("role", "button")
    .attr("tabindex", 0)
    .attr("aria-label", (person) => `Open ${person.current ? "your" : `${person.name}'s`} balance explanation`)
    .on("click", (_event, person) => openBalanceBreakdown(person.id))
    .on("keydown", (event, person) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        openBalanceBreakdown(person.id);
      }
    });

  node.append("circle").attr("r", 34);
  node
    .append("text")
    .attr("dy", "0.35em")
    .text((person) => memberInitials(person.name));
  node
    .append("text")
    .attr("class", "network-name")
    .attr("y", 55)
    .text((person) => person.current ? `${person.name} (you)` : person.name);

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const endpoints = (link) => {
    const dx = link.target.x - link.source.x;
    const dy = link.target.y - link.source.y;
    const distance = Math.max(1, Math.hypot(dx, dy));
    return {
      x1: link.source.x + (dx / distance) * 38,
      y1: link.source.y + (dy / distance) * 38,
      x2: link.target.x - (dx / distance) * 45,
      y2: link.target.y - (dy / distance) * 45,
    };
  };

  networkSimulation = d3
    .forceSimulation(nodes)
    .force("link", d3.forceLink(links).id((person) => person.id).distance(175).strength(0.85))
    .force("charge", d3.forceManyBody().strength(-540))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collision", d3.forceCollide(72))
    .on("tick", () => {
      nodes.forEach((person) => {
        person.x = clamp(person.x, 65, width - 65);
        person.y = clamp(person.y, 65, height - 75);
      });
      visibleLinks
        .attr("x1", (link) => endpoints(link).x1)
        .attr("y1", (link) => endpoints(link).y1)
        .attr("x2", (link) => endpoints(link).x2)
        .attr("y2", (link) => endpoints(link).y2);
      linkGroup
        .select(".network-link-hit")
        .attr("x1", (link) => endpoints(link).x1)
        .attr("y1", (link) => endpoints(link).y1)
        .attr("x2", (link) => endpoints(link).x2)
        .attr("y2", (link) => endpoints(link).y2);
      linkLabels
        .attr("x", (link) => (link.source.x + link.target.x) / 2)
        .attr("y", (link) => (link.source.y + link.target.y) / 2 - 8);
      node.attr("transform", (person) => `translate(${person.x},${person.y})`);
    });

  node.call(
    d3
      .drag()
      .on("start", (event, person) => {
        if (!event.active) networkSimulation.alphaTarget(0.3).restart();
        person.fx = person.x;
        person.fy = person.y;
      })
      .on("drag", (event, person) => {
        person.fx = event.x;
        person.fy = event.y;
      })
      .on("end", (event, person) => {
        if (!event.active) networkSimulation.alphaTarget(0);
        person.fx = null;
        person.fy = null;
      })
  );
}

function loadD3() {
  if (d3Library) return Promise.resolve(d3Library);
  if (!d3LoadPromise) {
    d3LoadPromise = import("https://cdn.jsdelivr.net/npm/d3@7/+esm").then(
      (module) => {
        d3Library = module;
        return module;
      }
    );
  }
  return d3LoadPromise;
}

function compactVnd(amount) {
  const value = Number(amount) || 0;
  if (value >= 1_000_000) {
    return `${new Intl.NumberFormat("en", { maximumFractionDigits: 1 }).format(value / 1_000_000)}m`;
  }
  if (value >= 1_000) return `${Math.round(value / 1_000)}k`;
  return String(value);
}

// Positive amount = debtorId owes creditorId more because of this transaction.
function pairDelta(tx, debtorId, creditorId) {
  return ledgerCore.pairDelta(tx, debtorId, creditorId, {
    members: state.members,
    memberName,
    formatAmount: formatVnd,
  });
}

// Positive amount = memberId is owed more overall because of this transaction.
function balanceDelta(tx, memberId) {
  return ledgerCore.balanceDelta(tx, memberId, {
    members: state.members,
    memberName,
    formatAmount: formatVnd,
  });
}

function buildContributions(deltaFor) {
  return ledgerCore.buildContributions(state.transactions, deltaFor);
}

function renderBreakdownSteps(rows, positiveIsBad, runningLabel = null) {
  return rows
    .map((row) => {
      const increases = row.delta > 0;
      const toneClass = increases === positiveIsBad ? "up" : "down";
      const chipClass =
        row.type === "EXPENSE" ? "" : row.type === "LOAN" ? "loan" : "settlement";
      return `
        <button class="breakdown-step" type="button" data-open-tx="${escapeHtml(
          row.txId
        )}">
          <div class="breakdown-step-main">
            <div class="ledger-reason">${escapeHtml(row.reason || "No reason given")}</div>
            <div class="ledger-meta">${escapeHtml(row.note)}</div>
            <div class="ledger-meta">
              <span class="chip ${chipClass}">${escapeHtml(row.type)}</span>
              <span>${escapeHtml(formatDateTime(row.date))}</span>
            </div>
          </div>
          <div class="breakdown-step-numbers">
            <div class="delta ${toneClass}">${formatSignedVnd(row.delta)}</div>
            <div class="running">After this: ${escapeHtml(
              runningLabel ? runningLabel(row.running) : formatSignedVnd(row.running)
            )}</div>
          </div>
        </button>
      `;
    })
    .join("");
}

function openPairwiseBreakdown(debtorId, creditorId, fromMemberId = null) {
  state.breakdownContext = {
    type: "pair",
    debtorId,
    creditorId,
    fromMemberId,
  };
  const { rows, total } = buildContributions((tx) =>
    pairDelta(tx, debtorId, creditorId)
  );

  const debtor = memberName(debtorId);
  const creditor = memberName(creditorId);
  let headline;
  if (total > 0) {
    headline = `${debtor} owes ${creditor} ${formatVnd(total)}`;
  } else if (total < 0) {
    headline = `${creditor} owes ${debtor} ${formatVnd(Math.abs(total))}`;
  } else {
    headline = `${debtor} and ${creditor} are settled up`;
  }

  el.breakdownTitle.textContent = `${debtor} and ${creditor}`;
  el.breakdownBody.innerHTML = `
    ${
      fromMemberId
        ? `<button type="button" class="icon-btn back-btn" data-back-member="${escapeHtml(
            fromMemberId
          )}">&larr; Back to ${escapeHtml(memberName(fromMemberId))}</button>`
        : ""
    }
    <div class="breakdown-summary">
      <p class="label">Result</p>
      <p class="breakdown-total">${escapeHtml(headline)}</p>
      <p class="muted">
        ${rows.length} ${rows.length === 1 ? "entry" : "entries"} between them, oldest first.
        Amounts marked <span class="delta up">+</span> grow what ${escapeHtml(
          debtor
        )} owes, <span class="delta down">&minus;</span> shrinks it.
      </p>
    </div>
    ${
      rows.length
        ? `<div class="breakdown-list">${renderBreakdownSteps(
            rows,
            true,
            (running) => pairStateText(debtorId, creditorId, running)
          )}</div>`
        : "<p class='muted'>No shared transactions between these two yet.</p>"
    }
    <p class="muted">Click any entry above to open its full detail.</p>
  `;

  openModal(el.breakdownModal);
}

function openBalanceBreakdown(memberId) {
  state.breakdownContext = { type: "member", memberId };
  const { rows, total } = buildContributions((tx) => balanceDelta(tx, memberId));
  const label = memberName(memberId);

  let headline;
  if (total > 0) {
    headline = `${label} should receive ${formatVnd(total)}`;
  } else if (total < 0) {
    headline = `${label} should pay ${formatVnd(Math.abs(total))}`;
  } else {
    headline = `${label} is all square`;
  }

  const { netEdges } = ledgerCore.buildLedgerSummary(
    state.transactions,
    state.members
  );
  const counterparties = state.members
    .filter((member) => member.id !== memberId)
    .map((member) => {
      const owedToMember = netEdges.get(`${member.id}|${memberId}`) || 0;
      const owedByMember = netEdges.get(`${memberId}|${member.id}`) || 0;
      return { id: member.id, net: owedToMember - owedByMember };
    })
    .filter((entry) => entry.net !== 0)
    .sort((a, b) => Math.abs(b.net) - Math.abs(a.net));

  el.breakdownTitle.textContent = `${label}'s net balance`;
  el.breakdownBody.innerHTML = `
    <div class="breakdown-summary">
      <p class="label">Result</p>
      <p class="breakdown-total">${escapeHtml(headline)}</p>
      <p class="muted">
        ${rows.length} ${rows.length === 1 ? "entry" : "entries"} affect ${escapeHtml(
    label
  )}, oldest first.
        <span class="delta down">+</span> means money owed to ${escapeHtml(
          label
        )}, <span class="delta up">&minus;</span> means money ${escapeHtml(
    label
  )} owes.
      </p>
    </div>
    <div>
      <p class="label">Split by person</p>
      <div class="stack">
        ${
          counterparties.length
            ? counterparties
                .map((entry) => {
                  const other = escapeHtml(memberName(entry.id));
                  const pair =
                    entry.net >= 0
                      ? `${entry.id}|${memberId}`
                      : `${memberId}|${entry.id}`;
                  const text =
                    entry.net > 0
                      ? `${other} owes ${escapeHtml(label)} ${formatVnd(entry.net)}`
                      : entry.net < 0
                        ? `${escapeHtml(label)} owes ${other} ${formatVnd(
                            Math.abs(entry.net)
                          )}`
                        : `Settled up with ${other}`;
                  return `
                    <button class="ledger-item breakdown-counterparty" type="button" data-pair="${escapeHtml(
                      pair
                    )}" data-from-member="${escapeHtml(memberId)}">
                      <div class="flex items-center justify-between">
                        <strong>${text}</strong>
                        <span class="chip ${
                          entry.net > 0 ? "" : entry.net < 0 ? "loan" : "settlement"
                        }">${
                    entry.net > 0 ? "receive" : entry.net < 0 ? "pay" : "even"
                  }</span>
                      </div>
                      <div class="item-hint">Open this relationship's entries</div>
                    </button>
                  `;
                })
                .join("")
            : "<p class='muted'>No other members.</p>"
        }
      </div>
    </div>
    <div>
      <p class="label">Every entry, in order</p>
      ${
        rows.length
          ? `<div class="breakdown-list">${renderBreakdownSteps(
              rows,
              false,
              (running) => memberStateText(memberId, running)
            )}</div>`
          : "<p class='muted'>No transactions involve this member yet.</p>"
      }
    </div>
    <p class="muted">Click any entry above to open its full detail.</p>
  `;

  openModal(el.breakdownModal);
}

function exportLedgerSnapshot() {
  const exportedAt = new Date();
  const snapshot = {
    format: "solo-knight-ledger-export",
    version: 1,
    exportedAt: exportedAt.toISOString(),
    group: {
      id: APP_CONFIG.groupId,
      name: APP_CONFIG.groupName,
      timezone: APP_CONFIG.timezone,
      members: state.members,
    },
    transactions: state.transactions,
  };
  const json = JSON.stringify(exportSafeValue(snapshot), null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const dateLabel = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_CONFIG.timezone,
  }).format(exportedAt);
  link.href = url;
  link.download = `solo-knight-ledger-${dateLabel}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);

  const previousLabel = el.exportLedger.textContent;
  el.exportLedger.textContent = "Downloaded";
  setTimeout(() => {
    el.exportLedger.textContent = previousLabel;
  }, 1800);
}

function exportSafeValue(value) {
  if (value === null || value === undefined) return value;
  if (value instanceof Date) return value.toISOString();
  if (typeof value?.toDate === "function") return value.toDate().toISOString();
  if (Array.isArray(value)) return value.map(exportSafeValue);
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, exportSafeValue(item)])
    );
  }
  return value;
}

function renderLedger() {
  const typeFilter = el.ledgerTypeFilter.value;
  const memberFilter = el.ledgerMemberFilter.value;
  const search = el.ledgerSearch.value.trim().toLocaleLowerCase();
  const fromDate = el.ledgerFrom.value
    ? new Date(`${el.ledgerFrom.value}T00:00:00`)
    : null;
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
      if (!search) return true;
      const description = describeTransaction(entry);
      const people = transactionMemberIds(entry).map(memberName).join(" ");
      return [
        entry.reason,
        entry.type,
        entry.category,
        categoryLabel(entry.category),
        description.title,
        description.detail,
        people,
      ]
        .filter(Boolean)
        .join(" ")
        .toLocaleLowerCase()
        .includes(search);
    })
    .filter((entry) => {
      const date = getEventDate(entry);
      if (!date) return true;
      if (fromDate && date < fromDate) return false;
      if (toDate && date > toDate) return false;
      return true;
    })
    .sort((a, b) => (getEventDate(b) || 0) - (getEventDate(a) || 0));

  const activeLabel = state.showDeleted ? "including deleted" : "active";
  el.ledgerResultCount.textContent = `${filtered.length} ${
    filtered.length === 1 ? "entry" : "entries"
  } shown (${activeLabel})`;

  if (!filtered.length) {
    el.ledgerList.innerHTML = `<div class="empty-state"><strong>No matching entries</strong><span>Try a different person, type, date or search phrase.</span></div>`;
    return;
  }

  el.ledgerList.innerHTML = filtered
    .map((entry) => renderActivityItem(entry))
    .join("");

  el.ledgerList.querySelectorAll("[data-tx-id]").forEach((item) => {
    item.addEventListener("click", () => showEntryDetail(item.dataset.txId));
  });
}

function renderActivityItem(entry, { compact = false } = {}) {
  const desc = describeTransaction(entry);
  const time = formatDateTime(getEventDate(entry));
  const impact = activityImpactFor(entry, state.currentMemberId);
  const typeClass = String(entry.type || "entry").toLocaleLowerCase();
  const marker = entry.type === "EXPENSE" ? "E" : entry.type === "LOAN" ? "L" : "P";
  const deleted = entry.isDeleted ? "deleted" : "";
  const category = categoryLabel(entry.category);
  const reason = entry.reason || (entry.type === "SETTLEMENT" ? "Payment recorded" : "No reason recorded");

  return `
    <button class="activity-row ${typeClass} ${deleted} ${compact ? "is-compact" : ""}" type="button" data-tx-id="${escapeHtml(entry.id)}">
      <span class="activity-marker" aria-hidden="true">${marker}</span>
      <span class="activity-main">
        <strong class="activity-reason">${escapeHtml(reason)}</strong>
        <span class="activity-description">${escapeHtml(desc.title.replace(/^\w+:\s*/, ""))}</span>
        <span class="activity-meta">${escapeHtml(typeLabel(entry.type))}${category ? ` &middot; ${escapeHtml(category)}` : ""} &middot; ${escapeHtml(time)}${entry.isDeleted ? " &middot; Deleted" : ""}</span>
      </span>
      <span class="activity-impact ${impact.tone}">
        <strong>${escapeHtml(impact.amount)}</strong>
        <span>${escapeHtml(impact.label)}</span>
      </span>
    </button>
  `;
}

function activityImpactFor(entry, viewerId) {
  const amount = Number(entry.amountVnd) || 0;
  if (!viewerId || !transactionInvolves(entry, viewerId)) {
    return { amount: formatVnd(amount), label: "Entry total", tone: "" };
  }

  if (entry.type === "LOAN") {
    if (entry.fromId === viewerId) {
      return { amount: formatVnd(amount), label: "You lent", tone: "positive" };
    }
    return { amount: formatVnd(amount), label: "You borrowed", tone: "negative" };
  }

  if (entry.type === "SETTLEMENT") {
    if (entry.fromId === viewerId) {
      return { amount: formatVnd(amount), label: "You paid", tone: "positive" };
    }
    return { amount: formatVnd(amount), label: "You received", tone: "positive" };
  }

  if (entry.type === "EXPENSE") {
    if (entry.payerId === viewerId) {
      const owedByOthers = (entry.participants || [])
        .filter((participant) => participant.memberId !== viewerId)
        .reduce((sum, participant) => sum + (Number(participant.shareVnd) || 0), 0);
      return {
        amount: formatVnd(owedByOthers),
        label: owedByOthers ? "Others' shares" : "Only your share",
        tone: owedByOthers ? "positive" : "",
      };
    }
    const share = (entry.participants || []).find(
      (participant) => participant.memberId === viewerId
    );
    return {
      amount: formatVnd(Number(share?.shareVnd) || 0),
      label: "Your share",
      tone: "negative",
    };
  }

  return { amount: formatVnd(amount), label: "Entry total", tone: "" };
}

function transactionMemberIds(entry) {
  if (entry.type === "EXPENSE") {
    return [...new Set([entry.payerId, ...(entry.participants || []).map((part) => part.memberId)])].filter(Boolean);
  }
  return [...new Set([entry.fromId, entry.toId])].filter(Boolean);
}

function typeLabel(type) {
  return type === "EXPENSE" ? "Shared expense" : type === "LOAN" ? "Loan" : type === "SETTLEMENT" ? "Payment" : "Entry";
}

function categoryLabel(category) {
  const labels = {
    FOOD: "Food & drinks",
    TRANSPORT: "Transport",
    ENTERTAINMENT: "Entertainment",
    SHOPPING: "Shopping",
    STAY: "Stay",
    OTHER: "Other",
  };
  return labels[category] || "";
}

function renderSettleUp() {
  const { balances, suggestions } = ledgerCore.buildLedgerSummary(
    state.transactions,
    state.members
  );
  const totalToMove = suggestions.reduce((sum, suggestion) => sum + suggestion.amount, 0);
  const openPeople = Object.values(balances).filter((net) => net !== 0).length;

  el.settleSummary.textContent = suggestions.length
    ? `${suggestions.length} suggested ${suggestions.length === 1 ? "payment" : "payments"} move ${formatVnd(totalToMove)} and bring ${openPeople} open balances back to zero.`
    : "Everyone is already settled. No payment needs to be recorded.";

  if (!suggestions.length) {
    el.settleList.innerHTML = `<div class="empty-state"><strong>Nothing to settle</strong><span>Every active balance is currently zero.</span></div>`;
    return;
  }

  el.settleList.innerHTML = suggestions
    .map((suggestion) => {
      const debtor = memberName(suggestion.debtor);
      const creditor = memberName(suggestion.creditor);
      const currentUser =
        suggestion.debtor === state.currentMemberId ||
        suggestion.creditor === state.currentMemberId;
      return `
      <article class="settlement-row ${currentUser ? "current-user" : ""}">
        <div class="settlement-flow">
          <span class="relationship-avatar" aria-hidden="true">${escapeHtml(memberInitials(debtor))}</span>
          <span aria-hidden="true">&rarr;</span>
          <span class="relationship-avatar" aria-hidden="true">${escapeHtml(memberInitials(creditor))}</span>
          <span class="settlement-flow-copy">
            <strong>${escapeHtml(debtor)} pays ${escapeHtml(creditor)}</strong>
            <span>${currentUser ? "This payment involves you" : "Suggested from the group's net balances"}</span>
          </span>
        </div>
        <div class="settlement-action">
          <strong>${formatVnd(suggestion.amount)}</strong>
          <button class="btn btn-soft" type="button" data-settle="${escapeHtml(
            suggestion.debtor
          )}|${escapeHtml(suggestion.creditor)}|${suggestion.amount}">Record payment</button>
        </div>
      </article>
      `;
    })
    .join("");

  el.settleList.querySelectorAll("[data-settle]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const [fromId, toId, amount] = btn.dataset.settle.split("|");
      prefillSettlement(fromId, toId, parseInt(amount, 10));
    });
  });
}

function prefillSettlement(fromId, toId, amount) {
  if (state.editingTxId) clearEdit();
  el.entryType.value = "SETTLEMENT";
  updateEntryType();
  el.settleFrom.value = fromId;
  el.settleTo.value = toId;
  el.amountVnd.value = amount;
  el.reason.value = "Settlement";
  el.entryCategory.value = "";
  setEventAtValue(new Date());
  openEntryComposer();
}

// Returns plain text; callers are responsible for escaping before injecting HTML.
function describeTransaction(entry) {
  return ledgerCore.describeTransaction(entry, {
    members: state.members,
    memberName,
    formatAmount: formatVnd,
  });
}

function transactionInvolves(entry, memberId) {
  return ledgerCore.transactionInvolves(entry, memberId);
}

function showEntryDetail(txId, { returnToBreakdown = null } = {}) {
  const entry = state.transactions.find((tx) => tx.id === txId);
  if (!entry) return;
  state.selectedTxId = txId;
  state.detailReturnBreakdown = returnToBreakdown;

  const desc = describeTransaction(entry);
  const impacts = computeImpacts(entry);
  const meta = [
    { label: "Type", value: entry.type },
    { label: "Category", value: categoryLabel(entry.category) || "Uncategorized" },
    { label: "Amount", value: formatVnd(entry.amountVnd || 0) },
    { label: "Event time", value: formatDateTime(getEventDate(entry)) },
    { label: "Created by", value: memberName(entry.createdBy) },
    { label: "Updated by", value: memberName(entry.updatedBy) },
  ];

  const detailHtml = `
    <div class="stack">
      ${
        entry.isDeleted
          ? `<div class="deleted-banner" role="status"><strong>Deleted entry</strong><span>This entry is kept for reference but does not affect any current balance.</span></div>`
          : ""
      }
      <div>
        <h4 class="panel-title">${escapeHtml(desc.title)}</h4>
        <div class="ledger-reason reason-lead">${escapeHtml(
          entry.reason || "No reason given"
        )}</div>
        <p class="muted">${escapeHtml(desc.detail)}</p>
      </div>
      <div class="details-grid">
        ${meta
          .map(
            (row) => `
              <div>
                <p class="label">${escapeHtml(row.label)}</p>
                <p>${escapeHtml(row.value) || "-"}</p>
              </div>
            `
          )
          .join("")}
      </div>
      <div>
        <p class="label">Impact on the ledger</p>
        ${
          impacts.length
            ? impacts
                .map(
                  (impact) => `
                    <div class="ledger-item">
                      <strong>${escapeHtml(impact.label)}</strong>
                      <div class="ledger-meta">${escapeHtml(impact.note)}</div>
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

  openModal(el.detailModal, el.closeDetail);
  loadAudit(entry.id).catch((error) => {
    console.error("Failed to load audit", error);
    if (state.selectedTxId !== entry.id) return;
    const audit = document.getElementById("auditLog");
    if (audit) audit.innerHTML = "<p class='muted'>Audit history could not be loaded.</p>";
  });
}

function computeImpacts(entry) {
  if (entry.type === "SETTLEMENT") {
    const amount = Number(entry.amountVnd) || 0;
    if (entry.isDeleted) {
      return [
        {
          label: `${memberName(entry.fromId)} paid ${memberName(entry.toId)}`,
          note: `${formatVnd(amount)} recorded, but this deleted entry has no current impact.`,
        },
      ];
    }

    const { rows } = buildContributions((transaction) =>
      pairDelta(transaction, entry.fromId, entry.toId)
    );
    const row = rows.find((candidate) => candidate.txId === entry.id);
    const before = row ? row.running - row.delta : 0;
    const after = row ? row.running : before - amount;
    let effect;
    if (before > 0 && after > 0) {
      effect = `Reduced ${memberName(entry.fromId)}'s debt from ${formatVnd(before)} to ${formatVnd(after)}.`;
    } else if (before > 0 && after === 0) {
      effect = `Cleared the full ${formatVnd(before)} debt between them.`;
    } else if (before > 0 && after < 0) {
      effect = `Cleared ${formatVnd(before)} and created ${formatVnd(Math.abs(after))} owed in the opposite direction.`;
    } else if (after < 0) {
      effect = `Moved the relationship to ${memberName(entry.toId)} owing ${memberName(entry.fromId)} ${formatVnd(Math.abs(after))}.`;
    } else {
      effect = `After this payment, ${pairStateText(entry.fromId, entry.toId, after)}.`;
    }
    return [
      {
        label: `${memberName(entry.fromId)} paid ${memberName(entry.toId)} ${formatVnd(amount)}`,
        note: effect,
      },
    ];
  }

  return ledgerCore.computeImpacts(entry, {
    members: state.members,
    memberName,
    formatAmount: formatVnd,
  });
}

function pairStateText(debtorId, creditorId, balance) {
  if (balance > 0) {
    return `${memberName(debtorId)} owed ${memberName(creditorId)} ${formatVnd(balance)}`;
  }
  if (balance < 0) {
    return `${memberName(creditorId)} owed ${memberName(debtorId)} ${formatVnd(Math.abs(balance))}`;
  }
  return `${memberName(debtorId)} and ${memberName(creditorId)} were settled`;
}

function memberStateText(memberId, balance) {
  if (balance > 0) {
    return `${memberName(memberId)} should receive ${formatVnd(balance)} overall`;
  }
  if (balance < 0) {
    return `${memberName(memberId)} should pay ${formatVnd(Math.abs(balance))} overall`;
  }
  return `${memberName(memberId)} was all square`;
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
  if (state.selectedTxId !== txId) return;

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
          <p class="label">${escapeHtml(entry.action)} by ${escapeHtml(by)}</p>
          <p class="muted">${escapeHtml(when)}</p>
          <details>
            <summary>View snapshot</summary>
            <pre>${escapeHtml(
              `${before ? `Before:\n${before}\n` : ""}${
                after ? `After:\n${after}` : ""
              }`
            )}</pre>
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
  el.entryCategory.value = entry.category || "";
  setEventAtValue(getEventDate(entry), true);

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
        locked: Boolean(existing),
      };
    });
    ensurePayerIncluded();
    renderParticipants();
  }

  el.entryModeNote.textContent = `Editing ${entry.type} entry.`;
  el.cancelEdit.classList.remove("hidden");
  el.submitEntry.textContent = "Update Entry";
  closeModal(el.detailModal, { restoreBreakdown: false });
  openEntryComposer();
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
  el.eventAtPicker.classList.add("hidden");
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

  closeModal(el.detailModal, { restoreBreakdown: false });
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

  closeModal(el.detailModal, { restoreBreakdown: false });
}

function setIdentityLock(locked) {
  document.body.classList.toggle("locked", locked);
  el.closeIdentity.classList.toggle("hidden", locked);
  el.closeIdentity.disabled = locked;
}

function refreshEventTimeIfAuto() {
  if (state.editingTxId || state.eventAtDirty) return;
  setEventAtValue(new Date());
}

function toggleEventPicker() {
  if (!el.eventAtPicker.classList.contains("hidden")) {
    el.eventAtPicker.classList.add("hidden");
    el.eventAtPickerBtn.focus();
    return;
  }
  el.eventAtPicker.classList.remove("hidden");
  if (typeof el.eventAtPicker.showPicker === "function") {
    el.eventAtPicker.showPicker();
  } else {
    el.eventAtPicker.focus();
  }
}

function setEventAtValue(date, markDirty = false) {
  if (!date || Number.isNaN(date.getTime())) return;
  el.eventAt.value = toLocalInputValue(date);
  syncEventPickerValue(date);
  if (markDirty) {
    state.eventAtDirty = true;
  }
}

function getPickerDate() {
  if (!el.eventAtPicker || !el.eventAtPicker.value) return null;
  const date = new Date(el.eventAtPicker.value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function syncEventPickerValue(date) {
  if (!el.eventAtPicker) return;
  el.eventAtPicker.value = toPickerInputValue(date);
}

function toPickerInputValue(date) {
  const pad = (num) => String(num).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(
    date.getDate()
  )}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function openModal(modal, initialFocus = null) {
  if (!modal) return;
  if (!modal.classList.contains("hidden")) {
    (initialFocus || modal.querySelector("button, input, select, textarea"))?.focus();
    return;
  }
  document.querySelectorAll(".modal:not(.hidden)").forEach((open) => {
    open.setAttribute("aria-hidden", "true");
  });
  state.modalFocusStack.push({ modal, opener: document.activeElement });
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  document.body.classList.add("modal-open");
  requestAnimationFrame(() => {
    const target =
      initialFocus ||
      modal.querySelector(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
      );
    target?.focus();
  });
}

function closeModal(modal, { restoreBreakdown = true } = {}) {
  if (!modal || modal.classList.contains("hidden")) return;
  if (modal === el.entryModal && state.editingTxId) clearEdit();
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  const stackIndex = state.modalFocusStack
    .map((entry) => entry.modal)
    .lastIndexOf(modal);
  const [closed] = stackIndex >= 0
    ? state.modalFocusStack.splice(stackIndex, 1)
    : [];
  if (!document.querySelector(".modal:not(.hidden)")) {
    document.body.classList.remove("modal-open");
  } else {
    const remaining = [...document.querySelectorAll(".modal:not(.hidden)")].at(-1);
    remaining?.setAttribute("aria-hidden", "false");
  }
  const restoreTarget = closed?.opener;
  if (restoreTarget && restoreTarget.isConnected && !restoreTarget.closest("[aria-hidden='true']")) {
    requestAnimationFrame(() => restoreTarget.focus());
  }
  if (modal === el.detailModal) {
    const context = state.detailReturnBreakdown;
    state.detailReturnBreakdown = null;
    if (restoreBreakdown && context) {
      requestAnimationFrame(() => reopenBreakdown(context));
    }
  }
  if (modal === el.breakdownModal && !state.detailReturnBreakdown) {
    state.breakdownContext = null;
  }
}

function reopenBreakdown(context) {
  if (context.type === "pair") {
    openPairwiseBreakdown(
      context.debtorId,
      context.creditorId,
      context.fromMemberId || null
    );
  } else if (context.type === "member") {
    openBalanceBreakdown(context.memberId);
  }
}

function showFormError(message) {
  el.formError.textContent = message;
  el.formError.classList.remove("hidden");
}

function clearFormError() {
  el.formError.textContent = "";
  el.formError.classList.add("hidden");
}

function formatVnd(amount) {
  return ledgerCore.formatVnd(Number(amount));
}

function formatSignedVnd(amount) {
  return ledgerCore.formatSignedVnd(Number(amount));
}

const HTML_ESCAPES = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value).replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

function memberName(memberId) {
  const member = state.members.find((entry) => entry.id === memberId);
  return member ? member.displayName : memberId || "Unknown";
}

function memberInitials(displayName) {
  return (
    String(displayName || "?")
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toLocaleUpperCase() || "")
      .join("") || "?"
  );
}

function toDate(value) {
  return ledgerCore.toDate(value);
}

function getEventDate(entry) {
  return ledgerCore.getEventDate(entry);
}

function formatDateTime(date) {
  return ledgerCore.formatDateTime(date, { timeZone: APP_CONFIG.timezone });
}

function toLocalInputValue(date) {
  return ledgerCore.toLocalInputValue(date);
}

function formatJson(value) {
  return ledgerCore.formatJson(value);
}

init();
updateEntryType();
