const API = "https://script.google.com/macros/s/AKfycbxLxhKZXuGVcTaD8qrlpGb7WpLWJVh5xdhfD9Q4FQPoYCGbnSA-koYGfw6KNZIlbzs/exec";
let requestLoadingCount = 0;
let requestLoadingStartedAt = 0;
let requestLoadingHideTimer = null;
let activeAdminSection = "requests";
const REQUEST_DATE_FROM_KEY = "requestDateFrom";
const REQUEST_DATE_TO_KEY = "requestDateTo";

function formatLocalIsoDate(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getCurrentMonthDateRange() {
  const now = new Date();
  return {
    dateFrom: formatLocalIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    dateTo: formatLocalIsoDate(new Date(now.getFullYear(), now.getMonth() + 1, 0))
  };
}

function getActiveRequestDateRange() {
  const defaults = getCurrentMonthDateRange();
  const dateFrom = sessionStorage.getItem(REQUEST_DATE_FROM_KEY) || defaults.dateFrom;
  const dateTo = sessionStorage.getItem(REQUEST_DATE_TO_KEY) || defaults.dateTo;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo) || dateFrom > dateTo) {
    return defaults;
  }
  return { dateFrom, dateTo };
}

function applyRequestDateFilter() {
  const dateFrom = document.getElementById("requestDateFrom")?.value || "";
  const dateTo = document.getElementById("requestDateTo")?.value || "";
  if (!dateFrom || !dateTo) {
    alert("Please select both Date From and Date To.");
    return;
  }
  if (dateFrom > dateTo) {
    alert("Date From cannot be later than Date To.");
    return;
  }
  sessionStorage.setItem(REQUEST_DATE_FROM_KEY, dateFrom);
  sessionStorage.setItem(REQUEST_DATE_TO_KEY, dateTo);
  window.location.reload();
}

function resetRequestDateFilterToCurrentMonth() {
  const range = getCurrentMonthDateRange();
  sessionStorage.setItem(REQUEST_DATE_FROM_KEY, range.dateFrom);
  sessionStorage.setItem(REQUEST_DATE_TO_KEY, range.dateTo);
  window.location.reload();
}

function initializeRequestDateFilter() {
  const mainHeader = document.querySelector(".main-header");
  if (!mainHeader || document.getElementById("requestDateFilter")) return;

  const range = getActiveRequestDateRange();
  const filter = document.createElement("section");
  filter.id = "requestDateFilter";
  filter.className = "request-date-filter";
  filter.setAttribute("aria-label", "Request date range");

  const heading = document.createElement("div");
  heading.className = "request-date-filter-heading";
  const title = document.createElement("strong");
  title.textContent = "Request Period";
  const subtitle = document.createElement("span");
  subtitle.textContent = "Only requests within this date range are retrieved.";
  heading.append(title, subtitle);

  const controls = document.createElement("div");
  controls.className = "request-date-filter-controls";
  [
    { id: "requestDateFrom", label: "Date From", value: range.dateFrom },
    { id: "requestDateTo", label: "Date To", value: range.dateTo }
  ].forEach(item => {
    const label = document.createElement("label");
    label.setAttribute("for", item.id);
    label.textContent = item.label;
    const input = document.createElement("input");
    input.id = item.id;
    input.type = "date";
    input.value = item.value;
    label.appendChild(input);
    controls.appendChild(label);
  });

  const applyButton = document.createElement("button");
  applyButton.type = "button";
  applyButton.className = "btn blue";
  applyButton.textContent = "Apply";
  applyButton.addEventListener("click", applyRequestDateFilter);
  const monthButton = document.createElement("button");
  monthButton.type = "button";
  monthButton.className = "btn";
  monthButton.textContent = "This Month";
  monthButton.addEventListener("click", resetRequestDateFilterToCurrentMonth);
  controls.append(applyButton, monthButton);

  filter.append(heading, controls);
  mainHeader.insertAdjacentElement("afterend", filter);
  if (document.getElementById("usersSection") || document.getElementById("settingsSection")) {
    setRequestDateFilterVisibility(activeAdminSection === "requests");
  }
}

function setRequestDateFilterVisibility(visible) {
  const filter = document.getElementById("requestDateFilter");
  if (!filter) return;
  filter.hidden = !visible;
  if (visible) {
    filter.style.removeProperty("display");
  } else {
    filter.style.setProperty("display", "none", "important");
  }
}

function getRequestLoadingIndicator() {
  let overlay = document.getElementById("requestLoadingOverlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "requestLoadingOverlay";
  overlay.className = "request-loading-overlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-hidden", "true");

  const card = document.createElement("div");
  card.className = "request-loading-card";
  const spinner = document.createElement("span");
  spinner.className = "request-loading-spinner";
  spinner.setAttribute("aria-hidden", "true");
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = "Retrieving requests...";
  const message = document.createElement("span");
  message.textContent = "Please wait while the latest records are loaded.";

  copy.append(title, message);
  card.append(spinner, copy);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  return overlay;
}

function beginDataLoading(titleText, messageText) {
  requestLoadingCount++;
  if (requestLoadingCount > 1) return;

  if (requestLoadingHideTimer) {
    window.clearTimeout(requestLoadingHideTimer);
    requestLoadingHideTimer = null;
  }
  requestLoadingStartedAt = Date.now();
  const overlay = getRequestLoadingIndicator();
  const title = overlay.querySelector("strong");
  const message = overlay.querySelector(".request-loading-card div span");
  if (title) title.textContent = titleText;
  if (message) message.textContent = messageText;
  overlay.setAttribute("aria-hidden", "false");
  window.requestAnimationFrame(() => overlay.classList.add("active"));
}

function endDataLoading() {
  requestLoadingCount = Math.max(0, requestLoadingCount - 1);
  if (requestLoadingCount > 0) return;

  const elapsed = Date.now() - requestLoadingStartedAt;
  const delay = Math.max(0, 350 - elapsed);
  requestLoadingHideTimer = window.setTimeout(() => {
    if (requestLoadingCount > 0) return;
    const overlay = document.getElementById("requestLoadingOverlay");
    if (overlay) {
      overlay.classList.remove("active");
      overlay.setAttribute("aria-hidden", "true");
    }
    requestLoadingHideTimer = null;
  }, delay);
}

function beginRequestLoading() {
  beginDataLoading("Retrieving requests...", "Please wait while the latest records are loaded.");
}

function endRequestLoading() {
  endDataLoading();
}

function beginUserLoading() {
  beginDataLoading("Retrieving users...", "Please wait while user accounts are loaded securely.");
}

function endUserLoading() {
  endDataLoading();
}

function clearSession() {
  sessionStorage.removeItem("authToken");
  sessionStorage.removeItem(REQUEST_DATE_FROM_KEY);
  sessionStorage.removeItem(REQUEST_DATE_TO_KEY);
  ["user", "role", "fullname", "position", "branchid"].forEach(key => localStorage.removeItem(key));
}

async function apiRequest(options = {}) {
  const token = sessionStorage.getItem("authToken");
  if (!token) {
    clearSession();
    window.location.href = "login.html";
    throw new Error("Authentication required");
  }

  const requestOptions = { ...options, method: "POST" };
  let payload = {};
  if (requestOptions.body) {
    payload = JSON.parse(requestOptions.body);
  }
  if (payload.action === "getRequests" || payload.action === "getDashboardCounts") {
    payload = { ...payload, ...getActiveRequestDateRange() };
  }
  requestOptions.body = JSON.stringify({ ...payload, token });
  const isLoadingRequests = payload.action === "getRequests";
  const isLoadingUsers = payload.action === "getUsers";
  if (isLoadingRequests) beginRequestLoading();
  if (isLoadingUsers) beginUserLoading();

  try {
    const response = await fetch(API, requestOptions);
    const clone = response.clone();
    let result;
    try {
      result = await clone.json();
    } catch (err) {
      throw new Error("The server returned an invalid response.");
    }

    if (result && result.error === "UNAUTHORIZED") {
      clearSession();
      window.location.href = "login.html";
      throw new Error("Your session expired. Please sign in again.");
    }
    return response;
  } finally {
    if (isLoadingRequests) endRequestLoading();
    if (isLoadingUsers) endUserLoading();
  }
}

let pendingLoginData = null;
let editingRequestId = null;
let isSubmittingRequest = false;
let allUsers = [];
let editingUserEmail = null;
let requestSubmissionKey = createSubmissionKey();
const pendingStatusUpdates = new Set();
let isLoggingOut = false;

function createSubmissionKey() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now()}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeRequestDateFilter);
} else {
  initializeRequestDateFilter();
}

function getRoleLabel(role) {
  return role === "admin"
    ? "System Administrator"
    : role === "branch_manager"
      ? "Branch Manager"
      : role === "finance_manager"
        ? "Savings and Credit Head"
        : "Teller";
}

function persistSession(data) {
  const fullname = data.fullname || (data.user && typeof data.user === "object" ? data.user.fullname || data.user.name : data.user) || "User";
  const position = data.position || getRoleLabel(data.role);
  const branchid = data.branchid || "";

  if (!data.token) throw new Error("The server did not issue a valid session.");

  sessionStorage.setItem("authToken", data.token);
  localStorage.setItem("user", typeof data.user === "object" ? JSON.stringify(data.user) : data.user);
  localStorage.setItem("role", data.role);
  localStorage.setItem("fullname", fullname);
  localStorage.setItem("position", position);
  localStorage.setItem("branchid", branchid);
}

function redirectToDashboard(role) {
  if (role === "teller") window.location.href = "teller.html";
  else if (role === "branch_manager") window.location.href = "branch.html";
  else if (role === "finance_manager") window.location.href = "finance.html";
  else if (role === "admin") window.location.href = "admin.html";
}

// 🔐 LOGIN
function setLoginButtonLoading(isLoading) {
  const button = document.getElementById("loginButton");
  if (!button) return;

  if (isLoading) {
    button.disabled = true;
    button.classList.add("is-loading");
    button.innerHTML = '<span class="btn-spinner" aria-hidden="true"></span><span>Signing In...</span>';
    return;
  }

  button.disabled = false;
  button.classList.remove("is-loading");
  button.innerHTML = "Sign In &rarr;";
}

async function login() {
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;

  if (!email || !password) {
    alert("Please enter your email and password.");
    return;
  }

  setLoginButtonLoading(true);

  try {
    const res = await fetch(API, {
      method: "POST",
      body: JSON.stringify({
        action: "login",
        email,
        password
      })
    });
    const data = await res.json();

    if (data.success) {
      if (data.mustChangePassword) {
        pendingLoginData = {
          email
        };
        document.getElementById("password").value = "";
        const opened = openFirstLoginPasswordModal(email);
        if (!opened) {
          alert("This account must change its password before continuing, but the password update form is unavailable on this page. Please reload and try again.");
        }
        setLoginButtonLoading(false);
        return;
      }

      persistSession(data);
      redirectToDashboard(data.role);
    } else {
      alert(data.message || "Invalid email or password");
      setLoginButtonLoading(false);
    }

  } catch (err) {
    console.error(err);
    alert("Connection error. Check your API URL.");
    setLoginButtonLoading(false);
  }
}

function openFirstLoginPasswordModal(email) {
  const modal = document.getElementById("firstLoginPasswordModal");
  const emailInput = document.getElementById("firstLoginEmail");
  const currentPasswordInput = document.getElementById("currentPassword");
  const newPasswordInput = document.getElementById("newPassword");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  if (!modal) {
    console.error("Missing first-login password modal in the current page.");
    return false;
  }

  if (emailInput) emailInput.value = email || "";
  if (currentPasswordInput) currentPasswordInput.value = "";
  if (newPasswordInput) newPasswordInput.value = "";
  if (confirmPasswordInput) confirmPasswordInput.value = "";

  modal.classList.add("active");
  return true;
}

function closeFirstLoginPasswordModal() {
  const modal = document.getElementById("firstLoginPasswordModal");
  if (modal) {
    modal.classList.remove("active");
  }
}

async function submitFirstLoginPasswordChange() {
  const emailInput = document.getElementById("firstLoginEmail");
  const currentPasswordInput = document.getElementById("currentPassword");
  const newPasswordInput = document.getElementById("newPassword");
  const confirmPasswordInput = document.getElementById("confirmPassword");

  const email = emailInput ? emailInput.value.trim() : "";
  const currentPassword = currentPasswordInput ? currentPasswordInput.value : "";
  const newPassword = newPasswordInput ? newPasswordInput.value : "";
  const confirmPassword = confirmPasswordInput ? confirmPasswordInput.value : "";

  if (!pendingLoginData) {
    alert("Please sign in again to continue.");
    closeFirstLoginPasswordModal();
    return;
  }

  if (!currentPassword || !newPassword || !confirmPassword) {
    alert("Please complete all password fields.");
    return;
  }

  if (newPassword.length < 12) {
    alert("Your new password must be at least 12 characters long.");
    return;
  }

  if (newPassword !== confirmPassword) {
    alert("New password and confirmation do not match.");
    return;
  }

  if (newPassword === currentPassword) {
    alert("Your new password must be different from your current password.");
    return;
  }

  try {
    const res = await fetch(API, {
      method: "POST",
      body: JSON.stringify({
        action: "changePassword",
        email,
        currentPassword,
        newPassword
      })
    });
    const data = await res.json();

    if (!data.success) {
      alert(data.message || "Unable to change password.");
      return;
    }

    persistSession(data);
    closeFirstLoginPasswordModal();
    pendingLoginData = null;
    alert("Password changed successfully. You can now continue.");
    redirectToDashboard(localStorage.getItem("role"));
  } catch (err) {
    console.error(err);
    alert("Connection error. Check your API URL.");
  }
}

function openForgotPasswordModal(event) {
  if (event) event.preventDefault();

  const modal = document.getElementById("forgotPasswordModal");
  const loginEmail = document.getElementById("email");
  const resetEmail = document.getElementById("forgotPasswordEmail");

  if (resetEmail && loginEmail && loginEmail.value.trim()) {
    resetEmail.value = loginEmail.value.trim();
  }

  if (modal) {
    modal.classList.add("active");
  }
}

function closeForgotPasswordModal() {
  const modal = document.getElementById("forgotPasswordModal");
  if (modal) {
    modal.classList.remove("active");
  }
}

async function requestPasswordReset() {
  const emailInput = document.getElementById("forgotPasswordEmail");
  const email = emailInput ? emailInput.value.trim() : "";

  if (!email) {
    alert("Please enter your email address.");
    return;
  }

  try {
    const res = await fetch(API, {
      method: "POST",
      body: JSON.stringify({
        action: "forgotPassword",
        email: email
      })
    });
    const data = await res.json();

    if (data.success) {
      alert("Password reset instructions have been sent to your email.");
      closeForgotPasswordModal();
    } else {
      alert(data.message || "Unable to process your request.");
    }
  } catch (err) {
    console.error(err);
    alert("Connection error. Check your API URL.");
  }
}

function showLogoutOverlay() {
  const overlay = document.createElement("div");
  overlay.className = "logout-overlay";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.setAttribute("aria-label", "Signing out");

  const card = document.createElement("div");
  card.className = "logout-card";
  const spinner = document.createElement("span");
  spinner.className = "logout-spinner";
  spinner.setAttribute("aria-hidden", "true");
  const title = document.createElement("strong");
  title.textContent = "Signing out...";
  const message = document.createElement("span");
  message.textContent = "Please wait while your secure session is closed.";

  card.append(spinner, title, message);
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  window.requestAnimationFrame(() => overlay.classList.add("active"));
  return overlay;
}

async function logout() {
  if (isLoggingOut) return;
  if (!window.confirm("Are you sure you want to sign out?")) return;

  isLoggingOut = true;
  document.querySelectorAll('button[onclick*="logout"]').forEach(button => {
    button.disabled = true;
    button.setAttribute("aria-disabled", "true");
  });
  showLogoutOverlay();

  try {
    const closeServerSession = sessionStorage.getItem("authToken")
      ? apiRequest({ body: JSON.stringify({ action: "logout" }) })
      : Promise.resolve();
    const minimumAnimationTime = new Promise(resolve => window.setTimeout(resolve, 500));
    const results = await Promise.allSettled([closeServerSession, minimumAnimationTime]);
    if (results[0].status === "rejected") throw results[0].reason;
  } catch (err) {
    console.warn("The server session could not be closed cleanly.", err);
  }
  clearSession();
  window.location.href = "login.html";
}

function loadUserProfile() {
  const fullname = localStorage.getItem("fullname") || "Teller";
  const email = localStorage.getItem("user") || "user@example.com";
  const position = localStorage.getItem("position") || "Teller";

  const fullNameEl = document.getElementById("userFullName");
  const emailEl = document.getElementById("userEmail");
  const positionEl = document.getElementById("userPosition");

  if (fullNameEl) fullNameEl.innerText = fullname;
  if (emailEl) emailEl.innerText = email;
  if (positionEl) positionEl.innerText = position;
}

function setDashboardUserDetails() {
  loadUserProfile();
}

function openRequestModal() {
  const modal = document.getElementById("requestModal");
  resetRequestForm();
  if (modal) {
    modal.style.display = "flex";
  }
}

function closeRequestModal() {
  if (isSubmittingRequest) {
    alert("Please wait until the system confirms the request submission.");
    return;
  }

  const modal = document.getElementById("requestModal");
  if (modal) {
    modal.style.display = "none";
  }
  resetRequestForm();
}

function setRequestSubmitLoading(isLoading) {
  isSubmittingRequest = isLoading;

  const submitButton = document.getElementById("requestSubmitButton");
  if (!submitButton) return;

  submitButton.disabled = isLoading;
  submitButton.innerText = isLoading
    ? "Submitting..."
    : editingRequestId
      ? "Save Changes"
      : "Submit Request";
}

function resetRequestForm() {
  editingRequestId = null;
  requestSubmissionKey = createSubmissionKey();

  const title = document.getElementById("requestModalTitle");
  const submitButton = document.getElementById("requestSubmitButton");

  if (title) title.innerText = "New Withdrawal Request";
  if (submitButton) {
    submitButton.innerText = isSubmittingRequest ? "Submitting..." : "Submit Request";
    submitButton.disabled = isSubmittingRequest;
  }

  const member = document.getElementById("requestMember");
  const contact = document.getElementById("requestContact");
  const total = document.getElementById("requestTotal");
  const amount = document.getElementById("requestAmount");
  const purpose = document.getElementById("requestPurpose");
  const balance = document.getElementById("formBalance");

  if (member) member.value = "";
  if (contact) contact.value = "";
  if (total) total.value = "";
  if (amount) amount.value = "";
  if (purpose) purpose.value = "";
  if (balance) balance.textContent = "0.00";
}

function populateRequestForm(request) {
  if (!Array.isArray(request)) return;

  const title = document.getElementById("requestModalTitle");
  const submitButton = document.getElementById("requestSubmitButton");
  const member = document.getElementById("requestMember");
  const contact = document.getElementById("requestContact");
  const total = document.getElementById("requestTotal");
  const amount = document.getElementById("requestAmount");
  const purpose = document.getElementById("requestPurpose");
  const balance = document.getElementById("formBalance");

  editingRequestId = request[0];

  if (title) title.innerText = "Edit Withdrawal Request";
  if (submitButton) {
    submitButton.innerText = isSubmittingRequest ? "Submitting..." : "Save Changes";
    submitButton.disabled = isSubmittingRequest;
  }
  if (member) member.value = request[1] || "";
  if (contact) contact.value = request[11] || "";
  if (total) total.value = request[2] || "";
  if (amount) amount.value = request[3] || "";
  if (purpose) purpose.value = request[5] || "";

  const remainingBalance = (parseFloat(request[2]) || 0) - (parseFloat(request[3]) || 0);
  if (balance) {
    balance.textContent = Math.max(remainingBalance, 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
}

function openEditRequest(requestId) {
  const request = allRequests.find(x => Array.isArray(x) && x[0] === requestId);
  if (!request || request[6] !== "Returned") return;

  populateRequestForm(request);

  const modal = document.getElementById("requestModal");
  if (modal) {
    modal.style.display = "flex";
  }
}

// 📥 LOAD REQUESTS
async function loadRequests(tableId) {
  const res = await apiRequest({
    method: "POST",
    body: JSON.stringify({ action: "getRequests" })
  });

  const data = sortRequestsByDatestamp(await res.json());

  let html = "";

  for (let i = 1; i < data.length; i++) {
    const r = data[i];

    html += `
      <tr>
        <td>${escapeHtml(r[0])}</td>
        <td>${escapeHtml(r[1])}</td>
        <td>₱${escapeHtml(r[2])}</td>
        <td>₱${escapeHtml(r[3])}</td>
        <td>₱${escapeHtml(r[4])}</td>
        <td>${escapeHtml(r[5])}</td>
        <td>${escapeHtml(r[6])}</td>
        <td>
          <button onclick="view(${escapeHtml(JSON.stringify(String(r[0])))})">View</button>
        </td>
      </tr>
    `;
  }

  document.getElementById(tableId).innerHTML = html;
}

// ➕ SUBMIT REQUEST (TELLER)
async function submitRequest() {
  if (isSubmittingRequest) return;

  const total = parseFloat(document.getElementById("requestTotal").value);
  const amount = parseFloat(document.getElementById("requestAmount").value);
  const memberName = document.getElementById("requestMember").value.trim();
  const contactNumber = document.getElementById("requestContact").value.trim();
  const purpose = document.getElementById("requestPurpose").value.trim();

  if (!memberName) {
    alert("Member Name is required.");
    return;
  }

  if (!purpose) {
    alert("Purpose is required.");
    return;
  }

  if (Number.isNaN(total) || Number.isNaN(amount)) {
    alert("Please enter valid investment and withdrawal amounts.");
    return;
  }

  if ((total - amount) < 3000) {
    alert("Balance must not go below ₱3,000");
    return;
  }

  const action = editingRequestId ? "editRequest" : "createRequest";
  const successMessage = editingRequestId ? "Request updated and resubmitted for review." : "Submitted!";

  setRequestSubmitLoading(true);

  try {
    const res = await apiRequest({
      method: "POST",
      body: JSON.stringify({
        action: action,
        request_id: editingRequestId,
        memberName: memberName,
        totalInvestment: total,
        amount: amount,
        purpose: purpose,
        contactNumber: contactNumber,
        idempotencyKey: requestSubmissionKey
      })
    });

    if (!res.ok) {
      throw new Error(`Request failed with status ${res.status}`);
    }

    const result = await res.json();
    if (!result.success) throw new Error(result.message || "The request was rejected by the server.");
    alert(successMessage);
    setRequestSubmitLoading(false);
    closeRequestModal();
    location.reload();
  } catch (err) {
    console.error("Failed to submit request", err);
    alert("The request was not confirmed by the system. Please try again.");
    setRequestSubmitLoading(false);
  }
}

// 🔄 UPDATE STATUS
async function updateStatus(id, status) {
  const updateKey = `${id}:${status}`;
  if (pendingStatusUpdates.has(updateKey)) return;

  const role = localStorage.getItem("role");
  let notes = "";

  if (role === "branch_manager" && status === "Returned") {
    notes = window.prompt("Enter notes for the teller before returning this request:", "") || "";
    notes = notes.trim();

    if (!notes) {
      alert("Notes are required before returning a request to the teller.");
      return;
    }
  }

  if (role === "finance_manager" && status === "Under Review") {
    notes = window.prompt("Enter notes for the branch manager before returning this request:", "") || "";
    notes = notes.trim();

    if (!notes) {
      alert("Notes are required before returning a request to the branch manager.");
      return;
    }
  }

  if (role === "finance_manager" && status === "Rejected") {
    notes = window.prompt("Enter reason or notes for rejecting this request:", "") || "";
    notes = notes.trim();

    if (!notes) {
      alert("Reason or notes are required before rejecting a request.");
      return;
    }
  }
  
  const updateData = {
    action: "updateStatus",
    request_id: id,
    status: status,
    notes: notes
  };

  pendingStatusUpdates.add(updateKey);
  const actionButtons = Array.from(document.querySelectorAll(".modal-footer button"));
  const originalButtonStates = actionButtons.map(button => ({
    button,
    disabled: button.disabled,
    text: button.textContent
  }));
  actionButtons.forEach(button => { button.disabled = true; });

  const selectedButton = status === "Approved"
    ? document.getElementById("approveBtn")
    : status === "Rejected"
      ? document.getElementById("rejectBtn")
      : actionButtons.find(button => (
          (status === "Forwarded" && /forward/i.test(button.textContent)) ||
          (status === "Returned" && /return to teller/i.test(button.textContent)) ||
          (status === "Under Review" && /^return$/i.test(button.textContent.trim()))
        ));
  if (selectedButton) selectedButton.textContent = "Processing...";

  let completed = false;
  try {
    const response = await apiRequest({
      method: "POST",
      body: JSON.stringify(updateData)
    });

    const result = await response.json();
    if (!result.success) {
      alert(result.message || "The status could not be updated.");
      return;
    }

    completed = true;
    alert("Updated!");
    location.reload();
  } catch (err) {
    console.error("Failed to update request status", err);
    alert(err.message || "The status could not be updated. Please try again.");
  } finally {
    pendingStatusUpdates.delete(updateKey);
    if (!completed) {
      originalButtonStates.forEach(state => {
        state.button.disabled = state.disabled;
        state.button.textContent = state.text;
      });
    }
  }
}


function getStatusClass(status) {
  if (status === "Pending") return "badge pending";
  if (status === "Under Review") return "badge review";
  if (status === "Approved") return "badge approved";
  if (status === "Rejected") return "badge rejected";
  if (status === "Forwarded") return "badge review";
  if (status === "Returned") return "badge rejected";
  return "badge";
}

// 📦 STORE DATA FOR MODAL
let allRequests = [];
const REQUEST_DATESTAMP_INDEX = 10;
const REQUEST_NOTES_INDEX = 13;

function normalizeValue(value) {
  return String(value ?? "").trim().toLowerCase();
}

function parseRequestDatestamp(value) {
  if (value instanceof Date) return value.getTime();

  if (typeof value === "number") {
    if (value > 100000000000) return value;
    if (value > 1000000000) return value * 1000;
    if (value > 20000 && value < 80000) return Math.round((value - 25569) * 86400000);
  }

  const trimmed = String(value ?? "").trim();
  if (!trimmed) return 0;

  const parsed = Date.parse(trimmed);
  if (!Number.isNaN(parsed)) return parsed;

  const localMatch = trimmed.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:,?\s+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (!localMatch) return 0;

  let first = Number(localMatch[1]);
  let second = Number(localMatch[2]);
  let year = Number(localMatch[3]);
  let hour = Number(localMatch[4] || 0);
  const minute = Number(localMatch[5] || 0);
  const secondValue = Number(localMatch[6] || 0);
  const meridiem = (localMatch[7] || "").toUpperCase();

  if (year < 100) year += 2000;
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;

  const month = first > 12 ? second : first;
  const day = first > 12 ? first : second;
  const localDate = new Date(year, month - 1, day, hour, minute, secondValue);

  return Number.isNaN(localDate.getTime()) ? 0 : localDate.getTime();
}

function getRequestIdTime(request) {
  const match = String(request?.[0] ?? "").match(/\d{10,}/);
  return match ? Number(match[0]) : 0;
}

function compareRequestsByDatestampDesc(a, b) {
  const dateDiff = parseRequestDatestamp(b?.[REQUEST_DATESTAMP_INDEX]) - parseRequestDatestamp(a?.[REQUEST_DATESTAMP_INDEX]);
  if (dateDiff !== 0) return dateDiff;
  return getRequestIdTime(b) - getRequestIdTime(a);
}

function sortRequestsByDatestamp(rows) {
  if (!Array.isArray(rows) || rows.length <= 1) return Array.isArray(rows) ? rows : [];

  const header = rows[0];
  const sortedRows = rows.slice(1).sort(compareRequestsByDatestampDesc);
  return [header, ...sortedRows];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function safeImageDataUrl(value) {
  const url = String(value || "");
  return /^data:image\/(?:png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(url) ? url : "";
}

function getRequestNotes(request) {
  return Array.isArray(request) ? String(request[REQUEST_NOTES_INDEX] || "").trim() : "";
}

function requestBelongsToBranch(request, branchId) {
  if (!Array.isArray(request)) return false;
  return normalizeValue(request[12]) === normalizeValue(branchId);
}

function isSavingsCreditHeadApprovalRequest(request) {
  return Array.isArray(request) && request[6] === "Forwarded";
}

function parseDateFilterInput(value, endOfDay = false) {
  const parts = String(value || "").split("-").map(Number);
  if (parts.length !== 3 || parts.some(part => !Number.isFinite(part))) return null;

  const [year, month, day] = parts;
  const date = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day);

  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function getAuditDateFilterBounds() {
  const startValue = document.getElementById("auditDateStart")?.value || "";
  const endValue = document.getElementById("auditDateEnd")?.value || "";

  return {
    startTimestamp: parseDateFilterInput(startValue),
    endTimestamp: parseDateFilterInput(endValue, true)
  };
}

function requestMatchesAuditDateFilter(request, startTimestamp, endTimestamp) {
  if (startTimestamp === null && endTimestamp === null) return true;

  const requestTimestamp = parseRequestDatestamp(request?.[REQUEST_DATESTAMP_INDEX]);
  if (!requestTimestamp) return false;

  if (startTimestamp !== null && requestTimestamp < startTimestamp) return false;
  if (endTimestamp !== null && requestTimestamp > endTimestamp) return false;

  return true;
}

function calculateFinanceDashboardCounts(requests) {
  const counts = {
    awaiting: 0,
    approved: 0,
    rejected: 0,
    review: 0
  };
  if (!Array.isArray(requests)) return counts;

  for (let i = 1; i < requests.length; i++) {
    const request = requests[i];
    if (!Array.isArray(request)) continue;

    const status = request[6];

    if (isSavingsCreditHeadApprovalRequest(request)) counts.awaiting++;
    if (status === "Under Review") counts.review++;
    if (status === "Approved") counts.approved++;
    if (status === "Rejected") counts.rejected++;
  }

  return counts;
}

function updateFinanceDashboardCardsFromRequests(requests) {
  const counts = calculateFinanceDashboardCounts(requests);

  const awaitingEl = document.getElementById("countAwaiting");
  const approvedEl = document.getElementById("countApproved");
  const rejectedEl = document.getElementById("countRejected");
  const reviewEl = document.getElementById("countReview");

  if (awaitingEl) awaitingEl.innerText = counts.awaiting;
  if (approvedEl) approvedEl.innerText = counts.approved;
  if (rejectedEl) rejectedEl.innerText = counts.rejected;
  if (reviewEl) reviewEl.innerText = counts.review;
}

async function loadStyledTable(tableId, role) {
  const res = await apiRequest({
    method: "POST",
    body: JSON.stringify({ action: "getRequests" })
  });

  const data = sortRequestsByDatestamp(await res.json());
  allRequests = data;

  let html = "";

  if (tableId === "tellerTable") {
    const storedUser = localStorage.getItem("user");
    let parsedUser;
    try {
      parsedUser = JSON.parse(storedUser);
    } catch (err) {
      parsedUser = storedUser;
    }
    const userIdentifier = parsedUser && typeof parsedUser === 'object'
      ? (parsedUser.email || parsedUser.name || parsedUser.fullname || storedUser)
      : storedUser;

    const filteredData = [];
    const tellerFullname = localStorage.getItem("fullname");

    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      if (!Array.isArray(r)) continue;
      
      // Check if request was created by this teller
      // r[7] should contain tellerName (from localStorage.getItem("fullname"))
      if (r[7] && (r[7] === tellerFullname || r[7] === storedUser)) {
        filteredData.push(r);
      }
    }

    allRequests = [data[0], ...filteredData]; // Update allRequests for modal

    for (let i = 0; i < filteredData.length; i++) {
      const r = filteredData[i];
      const dateStr = r[10] ? new Date(r[10]).toLocaleString() : "N/A";

      html += `
      <tr>
        <td>${escapeHtml(r[0])}</td>
        <td>${escapeHtml(r[1])}</td>
        <td>₱${escapeHtml(r[2])}</td>
        <td>₱${escapeHtml(r[3])}</td>
        <td>₱${escapeHtml(r[4])}</td>
        <td>${escapeHtml(r[5])}</td>
        <td><span class="${getStatusClass(r[6])}">${escapeHtml(r[6])}</span></td>
        <td>${dateStr}</td>
        <td>
          <button class="btn blue" onclick="openModal(${escapeHtml(JSON.stringify(String(r[0])))})">View</button>
        </td>
      </tr>
      `;
    }
  } else {
    const branchId = tableId === "branchTable" ? localStorage.getItem("branchid") : null;
    
    for (let i = 1; i < data.length; i++) {
      const r = data[i];
      const dateStr = r[10] ? new Date(r[10]).toLocaleString() : "N/A";

      let extraColumn = "";
      if (tableId === "branchTable") {
        // Branch managers only see requests from their branch
        if (!requestBelongsToBranch(r, branchId)) continue;
        extraColumn = `<td>${escapeHtml(r[7])}</td>`; // SUBMITTED BY
      } else if (tableId === "financeTable") {
        extraColumn = `<td>${escapeHtml(r[8])}</td>`; // BRANCH MANAGER
      }

      html += `
      <tr>
        <td>${escapeHtml(r[0])}</td>
        <td>${escapeHtml(r[1])}</td>
        <td>₱${escapeHtml(r[2])}</td>
        <td>₱${escapeHtml(r[3])}</td>
        <td>₱${escapeHtml(r[4])}</td>
        <td>${escapeHtml(r[5])}</td>
        ${extraColumn}
        <td><span class="${getStatusClass(r[6])}">${escapeHtml(r[6])}</span></td>
        <td>${dateStr}</td>
        <td>
          <button class="btn blue" onclick="openModal(${escapeHtml(JSON.stringify(String(r[0])))})">View</button>
        </td>
      </tr>
      `;
    }
  }

  document.getElementById(tableId).innerHTML = html;
}

// 🔍 MODAL
function openModal(id) {
  const r = allRequests.find(x => x[0] === id);
  if (!r) return;

  // Store current request ID for approval/rejection
  window.currentRequestId = id;

  const dateStr = r[10]
    ? new Date(r[10]).toLocaleDateString()
    : "N/A";
  const balance = parseFloat(r[4]) || 0;
  const total = parseFloat(r[2]) || 0;
  const withdrawn = parseFloat(r[3]) || 0;
  const tellerName = r[7] || localStorage.getItem("fullname") || "Unknown";
  const requestNotes = getRequestNotes(r);

  document.getElementById("modalContent").innerHTML = `
    <div style="margin-bottom: 20px; border-bottom: 1px solid #eee; padding-bottom: 15px;">
      <h3 style="margin: 0 0 5px 0;">Request Details — ${escapeHtml(r[0])}</h3>
      <p style="margin: 0; font-size: 13px; color: #666;">Member: ${escapeHtml(r[1])} · Submitted ${dateStr}</p>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; margin-bottom: 20px;">
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Member Name</label>
        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">${escapeHtml(r[1])}</p>
      </div>
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Submitted By</label>
        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">${escapeHtml(tellerName)}</p>
      </div>
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Contact Number</label>
        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">${escapeHtml(r[11] || 'N/A')}</p>
      </div>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 20px;">
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Total Investment</label>
        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">₱${total.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
      </div>
      <div>
        <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Amount Withdrawn</label>
        <p style="margin: 0; font-size: 16px; font-weight: 600; color: #333;">₱${withdrawn.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
      </div>
    </div>

    <div style="background: #e8f8f5; border-left: 4px solid #16a085; padding: 15px; border-radius: 4px; margin-bottom: 20px;">
      <label style="font-size: 11px; color: #16a085; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 5px;">Remaining Balance (Total Investment − Amount Withdrawn)</label>
      <p style="margin: 0; font-size: 18px; font-weight: 700; color: #16a085;">₱${balance.toLocaleString('en-US', {minimumFractionDigits: 2, maximumFractionDigits: 2})}</p>
    </div>

    <div style="margin-bottom: 20px;">
      <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 8px;">Purpose of Withdrawal</label>
      <p style="margin: 0; font-size: 14px; color: #333;">${escapeHtml(r[5])}</p>
    </div>

    <div style="display: flex; align-items: center; gap: 10px;">
      <label style="font-size: 11px; color: #999; text-transform: uppercase; font-weight: 600;">Current Status:</label>
      <span class="${getStatusClass(r[6])}" style="padding: 4px 10px; border-radius: 20px; font-size: 12px;">${escapeHtml(r[6])}</span>
    </div>
    ${((r[6] === "Returned" || r[6] === "Under Review" || r[6] === "Rejected") && requestNotes) ? `
      <div style="margin-top: 20px; padding: 16px; background: #fff4f4; border-left: 4px solid #dc2626; border-radius: 6px;">
        <label style="font-size: 11px; color: #b91c1c; text-transform: uppercase; font-weight: 600; display: block; margin-bottom: 8px;">${r[6] === "Returned" ? "Branch Manager Notes" : r[6] === "Rejected" ? "Rejection Reason / Notes" : "Finance Manager Notes"}</label>
        <p style="margin: 0; font-size: 14px; color: #7f1d1d;">${escapeHtml(requestNotes)}</p>
      </div>
    ` : ""}
  `;

  // Show/hide buttons based on role and status
  const approveBtn = document.getElementById("approveBtn");
  const rejectBtn = document.getElementById("rejectBtn");

  if (approveBtn) approveBtn.style.display = "none";
  if (rejectBtn) rejectBtn.style.display = "none";

  // Add role-specific buttons to modal footer
  const modalFooter = document.querySelector(".modal-footer");
  if (modalFooter) {
    // Check if buttons already exist, remove them
    const existingBtns = modalFooter.querySelectorAll('.role-action-btn');
    existingBtns.forEach(btn => btn.remove());

    if (localStorage.getItem("role") === "branch_manager" && (r[6] === "Pending" || r[6] === "Under Review")) {
      const returnBtn = document.createElement("button");
      returnBtn.className = "btn red role-action-btn";
      returnBtn.style.cssText = "margin-left: auto; margin-right: 10px;";
      returnBtn.textContent = "Return to Teller";
      returnBtn.onclick = () => updateStatus(r[0], "Returned");
      modalFooter.appendChild(returnBtn);

      const forwardBtn = document.createElement("button");
      forwardBtn.className = "btn green role-action-btn";
      forwardBtn.textContent = "Forward to Approver";
      forwardBtn.onclick = () => updateStatus(r[0], "Forwarded");
      modalFooter.appendChild(forwardBtn);
    } else if (localStorage.getItem("role") === "finance_manager" && r[6] === "Forwarded") {
      const returnBtn = document.createElement("button");
      returnBtn.className = "btn red role-action-btn";
      returnBtn.style.cssText = "margin-left: auto; margin-right: 10px;";
      returnBtn.textContent = "Return";
      returnBtn.onclick = () => updateStatus(r[0], "Under Review");
      modalFooter.appendChild(returnBtn);

      if (approveBtn) {
        approveBtn.style.display = "block";
        approveBtn.className = "btn green";
        approveBtn.style.cssText = "";
      }
      if (rejectBtn) {
        rejectBtn.style.display = "block";
        rejectBtn.className = "btn red";
      }
    }

    if (localStorage.getItem("role") === "teller" && r[6] === "Returned") {
      const editBtn = document.createElement("button");
      editBtn.className = "btn blue role-action-btn";
      editBtn.style.cssText = "margin-left: auto; margin-right: 10px;";
      editBtn.textContent = "Edit Entry";
      editBtn.onclick = () => {
        closeModal();
        openEditRequest(r[0]);
      };
      modalFooter.appendChild(editBtn);
    }

    if (localStorage.getItem("role") === "teller" && r[6] === "Approved") {
      const printBtn = document.createElement("button");
      printBtn.className = "btn blue role-action-btn";
      printBtn.style.cssText = "margin-left: auto; margin-right: 10px;";
      printBtn.textContent = "Print";
      printBtn.onclick = printRequest;
      modalFooter.appendChild(printBtn);
    }
  }

  document.getElementById("modal").style.display = "flex";
}

function approveRequest() {
  if (!window.currentRequestId) return;
  updateStatus(window.currentRequestId, "Approved");
}

function rejectRequest() {
  if (!window.currentRequestId) return;
  updateStatus(window.currentRequestId, "Rejected");
}

function closeModal() {
  document.getElementById("modal").style.display = "none";
}

async function printRequest() {
  const r = allRequests.find(x => x[0] === window.currentRequestId);
  if (!r || r[6] !== "Approved") {
    alert("Only approved requests can be printed.");
    return;
  }

  let settings = {};
  try {
    const settingsRes = await apiRequest({
      method: "POST",
      body: JSON.stringify({ action: "getSettings" })
    });
    const settingsData = await settingsRes.json();
    settings = settingsData.settings || {};
  } catch (err) {
    console.warn("Unable to load print settings:", err);
  }

  const headerImageSrc = safeImageDataUrl(settings.reportHeaderImage || settings.headerImage || "");

  const tellerName = escapeHtml(r[7] || settings.tellerName || localStorage.getItem("fullname") || "Teller");
  const branchManagerName = escapeHtml(r[8] || settings.branchManagerName || "Branch Manager");
  const financeManagerName = escapeHtml(r[9] || settings.financeManagerName || "Savings and Credit Head");
  const dateStr = r[10]
    ? new Date(r[10]).toLocaleDateString()
    : "N/A";

  const tellerSignature = safeImageDataUrl(settings.tellerSignatureData || "");
  const branchSignature = safeImageDataUrl(settings.branchManagerSignatureData || "");
  const financeSignature = safeImageDataUrl(settings.financeManagerSignatureData || "");
  const memberName = escapeHtml(r[1] || "N/A");
  const contactNumber = escapeHtml(r[11] || "N/A");
  const reason = escapeHtml(r[5] || "N/A");
  const totalAmount = `&#8369;${parseFloat(r[2] || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const withdrawnAmount = `&#8369;${parseFloat(r[3] || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const balanceAmount = `&#8369;${parseFloat(r[4] || 0).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const printWindow = window.open("", "PRINT", "height=900,width=900");
  if (!printWindow) return;

  printWindow.document.write(`<html><head><title>Investment Withdrawal Form ${escapeHtml(r[0])}</title>`);
  printWindow.document.write(`<style>
      @page{size:8.5in 11in; margin:11mm 12mm;}
      *{box-sizing:border-box;}
      body{font-family:Arial, sans-serif; margin:0; color:#111; background:#fff;}
      .page{max-width:760px; margin:0 auto; padding:4px 4px 0;}
      .header{text-align:center; margin-bottom:34px;}
      .header img{max-width:280px; max-height:72px; height:auto; display:block; margin:0 auto 14px;}
      .header h1{margin:0; font-size:22px; font-weight:700; letter-spacing:1.6px;}
      .top-row{display:grid; grid-template-columns:1fr 228px; align-items:start; margin-bottom:22px;}
      .date-group{display:grid; grid-template-columns:auto 1fr; align-items:center; column-gap:12px; justify-self:end; width:100%;}
      .label{font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1.2px; color:#666;}
      .inline-label{padding-top:0;}
      .field-box{border:1px solid #bfc5cb; border-radius:4px; min-height:62px; padding:14px 14px; font-size:14px; display:flex; align-items:center; background:#fff;}
      .date-box{min-height:54px; padding:10px 14px; justify-content:flex-start;}
      .field-grid{display:grid; grid-template-columns:1fr 1fr; gap:18px; margin-bottom:20px;}
      .field-group .label{display:block; margin-bottom:6px;}
      .name-box,.contact-box{min-height:66px; padding:16px 16px;}
      .summary{display:grid; grid-template-columns:repeat(3, 1fr); gap:12px; margin-bottom:16px;}
      .summary-item{border:2px solid #aeb3b8; border-radius:4px; text-align:center; padding:12px 10px;}
      .summary-item .label{margin-bottom:8px; font-size:10px;}
      .summary-item .amount{font-size:16px; font-weight:700; letter-spacing:0.2px;}
      .reason-label{font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1.1px; color:#c73342; margin-bottom:8px;}
      .reason-box{border:1px solid #bfc5cb; border-radius:4px; min-height:102px; padding:14px 14px; font-size:13px; line-height:1.45; margin-bottom:12px; align-items:flex-start;}
      .footer-note{margin:0 0 24px; font-size:13px; line-height:1.35; color:#444;}
      .subscriber-signature{display:flex; justify-content:flex-end; margin-bottom:42px;}
      .subscriber-signature .signature-box{text-align:center; min-width:220px;}
      .signature-image{display:block; max-width:145px; max-height:44px; margin:0 auto 4px;}
      .signature-line{width:138px; height:30px; border-bottom:1px solid #444; margin:0 auto 4px;}
      .signature-label{font-size:10px; font-weight:700; text-transform:uppercase; letter-spacing:1.1px; color:#666; margin-bottom:36px;}
      .signatory-name{font-size:13px; font-weight:700; text-transform:uppercase; line-height:1.2;}
      .signatory-role{font-size:11px; text-transform:uppercase; letter-spacing:0.7px; color:#666;}
      .signature-caption{font-size:10px; color:#444;}
      .approval-section{margin-top:6px;}
      .two-signatures{display:grid; grid-template-columns:1fr 1fr; gap:42px; margin-bottom:24px;}
      .two-signatures .signature-box{text-align:center;}
      .approved-signature{text-align:center; max-width:260px; margin:0 auto;}
      @media print{
        body{-webkit-print-color-adjust:exact; print-color-adjust:exact;}
      }
  </style>`);
  printWindow.document.write(`</head><body><div class="page">`);
  printWindow.document.write(`<div class="header">${headerImageSrc ? `<img src="${headerImageSrc}" alt="Report Header" />` : ''}<h1>Investment Withdrawal Form</h1></div>`);
  printWindow.document.write(`<div class="top-row"><div></div><div class="date-group"><div class="label inline-label">Date</div><div class="field-box date-box">${dateStr}</div></div></div>`);
  printWindow.document.write(`<div class="field-grid"><div class="field-group"><div class="label">Subscriber's Name</div><div class="field-box name-box">${memberName}</div></div><div class="field-group"><div class="label">Contact Number</div><div class="field-box contact-box">${contactNumber}</div></div></div>`);
  printWindow.document.write(`<div class="summary"><div class="summary-item"><div class="label">Total Investment</div><div class="amount">${totalAmount}</div></div><div class="summary-item"><div class="label">Withdrawal</div><div class="amount">${withdrawnAmount}</div></div><div class="summary-item"><div class="label">Remaining Balance</div><div class="amount">${balanceAmount}</div></div></div>`);
  printWindow.document.write(`<div class="reason-label">This is to request for withdrawal of my CATV/Internet investment for the reason:</div><div class="reason-box">${reason}</div>`);
  printWindow.document.write(`<p class="footer-note">I understand that an amount of Php 3,000 should be retained as my maintaining investment balance.</p>`);
  printWindow.document.write(`<div class="subscriber-signature"><div class="signature-box"><div style="height:62px;"></div><div class="signatory-name">${memberName}</div><div class="signature-caption">Subscriber's Name & Signature</div></div></div>`);
  printWindow.document.write(`<div class="approval-section"><div class="two-signatures"><div class="signature-box"><div class="signature-label">Prepared by</div>${tellerSignature ? `<img class="signature-image" src="${tellerSignature}" alt="Prepared by signature" />` : '<div class="signature-line"></div>'}<div class="signatory-name">${tellerName}</div><div class="signatory-role">Teller</div></div><div class="signature-box"><div class="signature-label">Noted by</div>${branchSignature ? `<img class="signature-image" src="${branchSignature}" alt="Noted by signature" />` : '<div class="signature-line"></div>'}<div class="signatory-name">${branchManagerName}</div><div class="signatory-role">Branch Manager</div></div></div><div class="approved-signature"><div class="signature-label">Approved by</div>${financeSignature ? `<img class="signature-image" src="${financeSignature}" alt="Approved by signature" />` : '<div class="signature-line"></div>'}<div class="signatory-name">${financeManagerName}</div><div class="signatory-role">Savings and Credit Head</div></div></div>`);
  printWindow.document.write(`</div></body></html>`);
  printWindow.document.close();
  setTimeout(() => {
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  }, 1000);
}

async function loadDashboardCounts() {
  let data = allRequests;

  if (!Array.isArray(data) || data.length <= 1) {
    const res = await apiRequest({
      method: "POST",
      body: JSON.stringify({ action: "getRequests" })
    });

    data = sortRequestsByDatestamp(await res.json());
    allRequests = data;
  }

  updateFinanceDashboardCardsFromRequests(data);
}

async function loadTellerCounts() {
  const res = await apiRequest({
    method: "POST",
    body: JSON.stringify({ action: "getRequests" })
  });

  const data = sortRequestsByDatestamp(await res.json());
  const tellerEmail = localStorage.getItem("user");
  const tellerFullname = localStorage.getItem("fullname");

  let total = 0;
  let pending = 0;
  let review = 0;
  let approved = 0;

  for (let i = 1; i < data.length; i++) {
    // Filter by current teller's email or fullname
    if (data[i][7] === tellerEmail || data[i][7] === tellerFullname) {
      total++;

      if (data[i][6] === "Pending") pending++;
      if (data[i][6] === "Under Review") review++;
      if (data[i][6] === "Approved") approved++;
    }
  }

  document.getElementById("countTotal").innerText = total;
  document.getElementById("countPending").innerText = pending;
  document.getElementById("countReview").innerText = review;
  document.getElementById("countApproved").innerText = approved;
}

async function loadBranchTable() {
  const res = await apiRequest({
    method: "POST",
    body: JSON.stringify({ action: "getRequests" })
  });

  const data = sortRequestsByDatestamp(await res.json());
  allRequests = data;

  const branchId = localStorage.getItem("branchid");
  let html = "";

  for (let i = 1; i < data.length; i++) {
    const r = data[i];

    // SHOW ONLY RELEVANT RECORDS FROM SAME BRANCH
    if ((r[6] === "Pending" || r[6] === "Under Review") && requestBelongsToBranch(r, branchId)) {
      const dateStr = r[10] ? new Date(r[10]).toLocaleString() : "N/A";

      html += `
      <tr>
        <td>${escapeHtml(r[0])}</td>
        <td>${escapeHtml(r[1])}</td>
        <td>₱${escapeHtml(r[2])}</td>
        <td>₱${escapeHtml(r[3])}</td>
        <td>₱${escapeHtml(r[4])}</td>
        <td>${escapeHtml(r[5])}</td>
        <td>${escapeHtml(r[7])}</td>
        <td><span class="${getStatusClass(r[6])}">${escapeHtml(r[6])}</span></td>
        <td>${dateStr}</td>
        <td>
          <button class="btn blue" onclick="openModal(${escapeHtml(JSON.stringify(String(r[0])))})">View</button>
        </td>
      </tr>
      `;
    }
  }

  document.getElementById("branchTable").innerHTML = html;
}

async function loadBranchCounts() {
  const res = await apiRequest({
    method: "POST",
    body: JSON.stringify({ action: "getRequests" })
  });

  const data = sortRequestsByDatestamp(await res.json());
  const branchId = localStorage.getItem("branchid");

  let total = 0;
  let pending = 0;
  let review = 0;
  let forwarded = 0;

  for (let i = 1; i < data.length; i++) {
    // Only count requests from same branch
    if (!requestBelongsToBranch(data[i], branchId)) continue;
    total++;

    if (data[i][6] === "Pending") pending++;
    if (data[i][6] === "Under Review") review++;
    if (data[i][6] === "Forwarded") forwarded++;
  }

  document.getElementById("bmTotal").innerText = total;
  document.getElementById("bmPending").innerText = pending;
  document.getElementById("bmReview").innerText = review;
  document.getElementById("bmForwarded").innerText = forwarded;
}

async function loadFinanceTable() {
  const res = await apiRequest({
    method: "POST",
    body: JSON.stringify({ action: "getRequests" })
  });

  const data = sortRequestsByDatestamp(await res.json());
  allRequests = data;

  renderFinanceTable();
  updateFinanceSummary();
  updateFinanceDashboardCardsFromRequests(allRequests);
}

function renderFinanceTable(searchText = "", statusFilter = "All Statuses") {
  let html = "";
  let filteredCount = 0;
  let forwardedCount = 0;

  if (!Array.isArray(allRequests)) {
    document.getElementById("financeTable").innerHTML = "";
    return;
  }

  for (let i = 1; i < allRequests.length; i++) {
    const r = allRequests[i];
    if (!Array.isArray(r) || !r.length) continue;
    if (!isSavingsCreditHeadApprovalRequest(r)) continue;

    forwardedCount++;

    const rowText = `${escapeHtml(r[0])} ${escapeHtml(r[1])} ${escapeHtml(r[5])} ${escapeHtml(r[8])} ${escapeHtml(r[6])}`.toLowerCase();
    if (searchText && !rowText.includes(searchText.toLowerCase())) continue;

    if (statusFilter !== "All Statuses" && r[6] !== statusFilter) continue;

    filteredCount++;
    const dateStr = r[10] ? new Date(r[10]).toLocaleString() : "N/A";

    html += `
      <tr>
        <td>${escapeHtml(r[0])}</td>
        <td>${escapeHtml(r[1])}</td>
        <td>₱${escapeHtml(r[2])}</td>
        <td>₱${escapeHtml(r[3])}</td>
        <td>₱${escapeHtml(r[4])}</td>
        <td>${escapeHtml(r[5])}</td>
        <td>${escapeHtml(r[8] || "N/A")}</td>
        <td><span class="${getStatusClass(r[6])}">${escapeHtml(r[6])}</span></td>
        <td>${dateStr}</td>
        <td>
          <button class="btn blue" onclick="openModal(${escapeHtml(JSON.stringify(String(r[0])))})">View</button>
        </td>
      </tr>
    `;
  }

  const table = document.getElementById("financeTable");
  if (table) table.innerHTML = html || '<tr><td colspan="10">No requests found.</td></tr>';

  if (document.getElementById("approvalBadge")) {
    document.getElementById("approvalBadge").innerText = forwardedCount;
  }
  if (document.getElementById("tableCount")) {
    document.getElementById("tableCount").innerText = `${filteredCount} requests · ${forwardedCount} awaiting your decision`;
  }
}

function updateFinanceSummary() {
  if (!Array.isArray(allRequests)) return;
  let forwardedCount = 0;

  for (let i = 1; i < allRequests.length; i++) {
    const r = allRequests[i];
    if (isSavingsCreditHeadApprovalRequest(r)) forwardedCount++;
  }

  if (document.getElementById("approvalBadge")) {
    document.getElementById("approvalBadge").innerText = forwardedCount;
  }
}

function initializeFinancePage() {
  const searchInput = document.getElementById("financeSearch");
  const statusSelect = document.getElementById("financeStatusFilter");
  const auditDateStart = document.getElementById("auditDateStart");
  const auditDateEnd = document.getElementById("auditDateEnd");
  const auditDateClear = document.getElementById("auditDateClear");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      renderFinanceTable(searchInput.value, statusSelect ? statusSelect.value : "All Statuses");
    });
  }

  if (statusSelect) {
    statusSelect.addEventListener("change", () => {
      renderFinanceTable(searchInput ? searchInput.value : "", statusSelect.value);
    });
  }

  [auditDateStart, auditDateEnd].forEach(input => {
    if (input) {
      input.addEventListener("change", () => loadAuditLogs());
    }
  });

  if (auditDateClear) {
    auditDateClear.addEventListener("click", () => {
      if (auditDateStart) auditDateStart.value = "";
      if (auditDateEnd) auditDateEnd.value = "";
      loadAuditLogs();
    });
  }
}

function navigateToBranch(page) {
  // Update sidebar active state
  document.querySelectorAll('.sidebar-main .sidebar-btn, .sidebar-more .sidebar-btn').forEach(btn => btn.classList.remove('active'));
  const selectedButton = Array.from(document.querySelectorAll('.sidebar-main .sidebar-btn, .sidebar-more .sidebar-btn'))
    .find(btn => btn.getAttribute('onclick')?.includes(`navigateToBranch('${page}')`));
  if (selectedButton) selectedButton.classList.add('active');

  const headerTitle = document.querySelector('.main-header h1');
  const subtitle = document.querySelector('.main-header .subtitle');
  const headerActions = document.querySelector('.main-header .header-actions');

  if (page === 'review') {
    if (headerTitle) headerTitle.innerText = '🔧 Branch Manager Review';
    if (subtitle) subtitle.innerText = 'Review withdrawal requests submitted by Tellers · Forward approved requests to Savings and Credit Head';
    if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="location.reload()"><span>🔄</span> Refresh</button>';
    loadBranchTable();
    loadBranchCounts();
  } else if (page === 'dashboard') {
    if (headerTitle) headerTitle.innerText = '📊 Branch Dashboard';
    if (subtitle) subtitle.innerText = 'Overview of branch activity, pending tasks, and forwarded approvals';
    if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="location.reload()"><span>🔄</span> Refresh</button>';
    loadBranchCounts();
  } else if (page === 'submitted') {
    if (headerTitle) headerTitle.innerText = '✅ Submitted to Savings and Credit Head';
    if (subtitle) subtitle.innerText = 'Requests you have forwarded and are awaiting finance review.';
    if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="location.reload()"><span>🔄</span> Refresh</button>';
    loadBranchSubmitted();
  } else if (page === 'notifications') {
    if (headerTitle) headerTitle.innerText = '🔔 Notifications';
    if (subtitle) subtitle.innerText = 'Branch Manager alerts and updates';
    if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="location.reload()"><span>🔄</span> Refresh</button>';
  } else if (page === 'settings') {
    if (headerTitle) headerTitle.innerText = '⚙️ Settings';
    if (subtitle) subtitle.innerText = 'Branch Manager preferences and account settings';
    if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="location.reload()"><span>🔄</span> Refresh</button>';
  }

  const reviewView = document.getElementById('reviewView');
  const dashboardView = document.getElementById('dashboardView');
  const submittedView = document.getElementById('submittedView');
  const notificationsView = document.getElementById('notificationsView');
  const settingsView = document.getElementById('settingsView');

  if (reviewView) reviewView.style.display = (page === 'review') ? 'block' : 'none';
  if (dashboardView) dashboardView.style.display = (page === 'dashboard') ? 'block' : 'none';
  if (submittedView) submittedView.style.display = (page === 'submitted') ? 'block' : 'none';
  if (notificationsView) notificationsView.style.display = (page === 'notifications') ? 'block' : 'none';
  if (settingsView) settingsView.style.display = (page === 'settings') ? 'block' : 'none';
}

function loadBranchSubmitted() {
  const branchId = localStorage.getItem("branchid");
  apiRequest({
    method: 'POST',
    body: JSON.stringify({ action: 'getRequests' })
  })
    .then(res => res.json())
    .then(rawData => {
      const data = sortRequestsByDatestamp(rawData);
      allRequests = data;
      let html = '';
      let count = 0;

      for (let i = 1; i < data.length; i++) {
        const r = data[i];
        if (!Array.isArray(r)) continue;
        if (r[6] === 'Forwarded' && requestBelongsToBranch(r, branchId)) {
          count++;
          const dateStr = r[10] ? new Date(r[10]).toLocaleString() : 'N/A';
          html += `
            <tr>
              <td>${escapeHtml(r[0])}</td>
              <td>${escapeHtml(r[1])}</td>
              <td>₱${escapeHtml(r[2])}</td>
              <td>₱${escapeHtml(r[3])}</td>
              <td>₱${escapeHtml(r[4])}</td>
              <td>${escapeHtml(r[5])}</td>
              <td>${escapeHtml(r[7])}</td>
              <td><span class="${getStatusClass(r[6])}">${escapeHtml(r[6])}</span></td>
              <td>${dateStr}</td>
              <td><button class="btn blue" onclick="openModal(${escapeHtml(JSON.stringify(String(r[0])))})">View</button></td>
            </tr>
          `;
        }
      }

      const submittedTable = document.getElementById('submittedTable');
      if (submittedTable) submittedTable.innerHTML = html || '<tr><td colspan="10">No forwarded requests found.</td></tr>';

      const submittedCount = document.getElementById('submittedCount');
      if (submittedCount) submittedCount.innerText = `${count} request${count !== 1 ? 's' : ''}`;
    })
    .catch(err => {
      console.error('Failed to load submitted requests', err);
    });
}

function navigateToFinance(page) {
  // Update sidebar active state
  document.querySelectorAll('.sidebar-main .sidebar-btn, .sidebar-admin .sidebar-btn, .sidebar-bottom .sidebar-btn').forEach(btn => btn.classList.remove('active'));
  const selectedButton = Array.from(document.querySelectorAll('.sidebar-main .sidebar-btn, .sidebar-admin .sidebar-btn, .sidebar-bottom .sidebar-btn'))
    .find(btn => btn.getAttribute('onclick')?.includes(`navigateToFinance('${page}')`));
  if (selectedButton) selectedButton.classList.add('active');

  // Update header
  const headerTitle = document.querySelector('.main-header h1');
  const subtitle = document.querySelector('.main-header .subtitle');
  const headerActions = document.querySelector('.main-header .header-actions');
  if (headerTitle && subtitle) {
    if (page === 'dashboard') {
      headerTitle.innerText = '💜 Finance Dashboard';
      subtitle.innerText = 'Overview of approvals, trends, and monthly performance.';
      if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="loadFinanceDashboard()">Refresh</button>';
    } else if (page === 'audit') {
      headerTitle.innerText = '💜 Audit Logs';
      subtitle.innerText = 'Audit history and request activity for review.';
      if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="loadAuditLogs()">Refresh</button>';
    } else {
      headerTitle.innerText = '💜 Savings and Credit Head Approval';
      subtitle.innerText = 'Review requests forwarded by Branch Manager · Approve or reject withdrawal requests';
      if (headerActions) headerActions.innerHTML = '<button class="btn blue" onclick="location.reload()">Refresh</button><button class="btn blue" onclick="exportData()">Export</button>';
    }
  }

  // Toggle views
  const summaryCards = document.getElementById('financeSummaryCards');
  const approvalQueue = document.getElementById('approvalQueueView');
  const dashboard = document.getElementById('dashboardView');
  const audit = document.getElementById('auditView');
  
  if (summaryCards) summaryCards.style.display = (page === 'approval') ? 'grid' : 'none';
  if (approvalQueue) approvalQueue.style.display = (page === 'approval') ? 'block' : 'none';
  if (dashboard) dashboard.style.display = (page === 'dashboard') ? 'block' : 'none';
  if (audit) audit.style.display = (page === 'audit') ? 'block' : 'none';

  console.log("Navigate to finance page:", page);
  
  if (page === 'approval') {
    loadFinanceTable();
  } else if (page === 'dashboard') {
    loadFinanceDashboard();
  } else if (page === 'audit') {
    loadAuditLogs();
  }
}

async function loadFinanceDashboard() {
  if (!Array.isArray(allRequests) || allRequests.length <= 1) {
    const res = await apiRequest({
      method: "POST",
      body: JSON.stringify({ action: "getRequests" })
    });
    allRequests = sortRequestsByDatestamp(await res.json());
  }

  let total = 0;
  let awaiting = 0;
  let approved = 0;
  let rejected = 0;

  for (let i = 1; i < allRequests.length; i++) {
    const r = allRequests[i];
    if (!Array.isArray(r)) continue;

    total++;
    if (r[6] === "Forwarded") awaiting++;
    if (r[6] === "Approved") approved++;
    if (r[6] === "Rejected") rejected++;
  }

  document.getElementById("dashboardTotal").innerText = total;
  document.getElementById("dashboardAwaiting").innerText = awaiting;
  document.getElementById("dashboardApproved").innerText = approved;
  document.getElementById("dashboardRejected").innerText = rejected;
  renderFinanceRejectedTable();
}

function renderFinanceRejectedTable() {
  const rejectedTable = document.getElementById("financeRejectedTable");
  if (!rejectedTable || !Array.isArray(allRequests)) return;

  let html = "";

  for (let i = 1; i < allRequests.length; i++) {
    const r = allRequests[i];
    if (!Array.isArray(r) || r[6] !== "Rejected") continue;

    const dateStr = r[10] ? new Date(r[10]).toLocaleString() : "N/A";
    const notes = getRequestNotes(r) || "No notes recorded.";
    const modalRequestId = escapeHtml(JSON.stringify(String(r[0])));

    html += `
      <tr>
        <td>${escapeHtml(r[0])}</td>
        <td>${escapeHtml(r[1])}</td>
        <td>â‚±${escapeHtml(r[3])}</td>
        <td>${escapeHtml(notes)}</td>
        <td>${escapeHtml(dateStr)}</td>
        <td><button class="btn blue" onclick="openModal(${modalRequestId})">View</button></td>
      </tr>
    `;
  }

  rejectedTable.innerHTML = html || '<tr><td colspan="6" style="text-align: center; padding: 20px; color: #999;">No rejected requests found.</td></tr>';
}

function getAuditAction(status) {
  if (status === "Pending") return "Submitted";
  if (status === "Forwarded") return "Forwarded to Savings and Credit Head";
  if (status === "Under Review") return "Returned to Branch Manager";
  if (status === "Returned") return "Returned to Teller";
  if (status === "Approved") return "Approved";
  if (status === "Rejected") return "Rejected";
  return "Updated";
}

function getAuditUser(request) {
  const status = request?.[6];

  if (status === "Approved" || status === "Rejected") {
    return request?.[9] || request?.[8] || request?.[7] || "Unknown";
  }

  if (status === "Forwarded" || status === "Under Review" || status === "Returned") {
    return request?.[8] || request?.[9] || request?.[7] || "Unknown";
  }

  return request?.[7] || request?.[8] || request?.[9] || "Unknown";
}

function formatAuditTimestamp(value) {
  if (!value) return "N/A";

  const parsed = parseRequestDatestamp(value);
  if (parsed) return new Date(parsed).toLocaleString();

  return String(value);
}

async function loadAuditLogs() {
  const auditTable = document.getElementById("auditTable");
  if (!auditTable) return;

  auditTable.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #999;">Loading audit logs...</td></tr>';

  try {
    if (!Array.isArray(allRequests) || allRequests.length <= 1) {
      const res = await apiRequest({
        method: "POST",
        body: JSON.stringify({ action: "getRequests" })
      });
      allRequests = sortRequestsByDatestamp(await res.json());
    }

    const { startTimestamp, endTimestamp } = getAuditDateFilterBounds();
    const hasDateFilter = startTimestamp !== null || endTimestamp !== null;

    const logs = Array.isArray(allRequests)
      ? allRequests
          .slice(1)
          .filter(request => (
            Array.isArray(request) &&
            request.length &&
            requestMatchesAuditDateFilter(request, startTimestamp, endTimestamp)
          ))
      : [];

    const html = logs.map(request => {
      const status = request[6] || "Updated";

      return `
        <tr>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${escapeHtml(request[0])}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${escapeHtml(getAuditAction(status))}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${escapeHtml(getAuditUser(request))}</td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;"><span class="${getStatusClass(status)}">${escapeHtml(status)}</span></td>
          <td style="padding: 10px; border-bottom: 1px solid #eee;">${escapeHtml(formatAuditTimestamp(request[REQUEST_DATESTAMP_INDEX]))}</td>
        </tr>
      `;
    }).join("");

    const emptyMessage = hasDateFilter
      ? "No audit logs found for the selected dates."
      : "No audit logs found.";

    auditTable.innerHTML = html || `<tr><td colspan="5" style="text-align: center; padding: 20px; color: #999;">${emptyMessage}</td></tr>`;
  } catch (err) {
    console.error("Failed to load audit logs", err);
    auditTable.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 20px; color: #b91c1c;">Unable to load audit logs.</td></tr>';
  }
}

function exportData() {
  alert("Export feature coming soon!");
}

function formatFirstLoginFlag(value) {
  return value ? "TRUE" : "FALSE";
}

function navigateToAdmin(section) {
  activeAdminSection = section;
  setRequestDateFilterVisibility(section === 'requests');
  document.querySelectorAll('.sidebar-main .sidebar-btn').forEach(btn => btn.classList.remove('active'));
  const selectedButton = Array.from(document.querySelectorAll('.sidebar-main .sidebar-btn'))
    .find(btn => btn.getAttribute('onclick')?.includes(`navigateToAdmin('${section}')`));
  if (selectedButton) selectedButton.classList.add('active');

  const headerTitle = document.querySelector('.main-header h1');
  const subtitle = document.querySelector('.main-header .subtitle');

  if (section === 'requests') {
    if (headerTitle) headerTitle.innerText = '💜 Admin Dashboard';
    if (subtitle) subtitle.innerText = 'Review system requests, settings, and approval metrics';
    loadAdminTable();
    loadAdminCounts();
    showSection('requests');
  } else if (section === 'users') {
    if (headerTitle) headerTitle.innerText = 'User Management';
    if (subtitle) subtitle.innerText = 'Add, review, and update system users.';
    loadUsers();
    showSection('users');
  } else if (section === 'settings') {
    if (headerTitle) headerTitle.innerText = '⚙️ Admin Settings';
    if (subtitle) subtitle.innerText = 'Manage signatory names and electronic signatures.';
    loadSettings();
    showSection('settings');
  }
}

async function loadUsers() {
  try {
    const res = await apiRequest({
      method: 'POST',
      body: JSON.stringify({ action: 'getUsers' })
    });
    const data = await res.json();

    if (!data.success) {
      alert(data.message || 'Failed to load users.');
      return;
    }

    allUsers = Array.isArray(data.users) ? data.users : [];
    renderUsersTable(allUsers);
  } catch (err) {
    console.error('Failed to load users', err);
    alert('Failed to load users.');
  }
}

function renderUsersTable(users) {
  const usersTable = document.getElementById('usersTable');
  const userTableCount = document.getElementById('userTableCount');

  if (!usersTable || !userTableCount) return;

  if (!Array.isArray(users) || !users.length) {
    usersTable.innerHTML = '<tr><td colspan="7">No users found.</td></tr>';
    userTableCount.innerText = '0 users listed';
    return;
  }

  let html = '';

  users.forEach(user => {
    const sourceIndex = allUsers.findIndex(item => item.email === user.email);
    html += `
      <tr>
        <td>${escapeHtml(user.email)}</td>
        <td>${escapeHtml(user.fullname)}</td>
        <td>${escapeHtml(user.position)}</td>
        <td>${escapeHtml(getRoleLabel(user.role))}</td>
        <td>${escapeHtml(user.branchid || '-')}</td>
        <td>${formatFirstLoginFlag(Boolean(user.firstLogin))}</td>
        <td><button class="btn blue" onclick="openUserModal('edit', ${sourceIndex})">Edit</button></td>
      </tr>
    `;
  });

  usersTable.innerHTML = html;
  userTableCount.innerText = `${users.length} users listed`;
}

function filterUsersTable() {
  const searchText = (document.getElementById('userSearch')?.value || '').trim().toLowerCase();
  const roleFilter = document.getElementById('userRoleFilter')?.value || 'All Roles';

  const filtered = allUsers.filter(user => {
    const rowText = `${user.email} ${user.fullname} ${user.position} ${user.branchid} ${user.role}`.toLowerCase();
    const matchesSearch = !searchText || rowText.includes(searchText);
    const matchesRole = roleFilter === 'All Roles' || user.role === roleFilter;
    return matchesSearch && matchesRole;
  });

  renderUsersTable(filtered);
}

function resetUserForm() {
  editingUserEmail = null;

  const title = document.getElementById('userModalTitle');
  const submitButton = document.getElementById('userSubmitButton');
  const passwordHint = document.getElementById('userPasswordHint');
  const emailInput = document.getElementById('userEmailInput');
  const passwordInput = document.getElementById('userPasswordInput');
  const fullnameInput = document.getElementById('userFullnameInput');
  const positionInput = document.getElementById('userPositionInput');
  const roleInput = document.getElementById('userRoleInput');
  const branchInput = document.getElementById('userBranchInput');
  const firstLoginInput = document.getElementById('userFirstLoginInput');

  if (title) title.innerText = 'Add User';
  if (submitButton) submitButton.innerText = 'Save User';
  if (passwordHint) passwordHint.innerText = 'This will be required when creating a new account.';
  if (emailInput) emailInput.value = '';
  if (passwordInput) passwordInput.value = '';
  if (fullnameInput) fullnameInput.value = '';
  if (positionInput) positionInput.value = '';
  if (roleInput) roleInput.value = 'teller';
  if (branchInput) branchInput.value = '';
  if (firstLoginInput) firstLoginInput.checked = true;
}

function openUserModal(mode = 'create', index = null) {
  const modal = document.getElementById('userModal');
  const title = document.getElementById('userModalTitle');
  const submitButton = document.getElementById('userSubmitButton');
  const passwordHint = document.getElementById('userPasswordHint');
  const emailInput = document.getElementById('userEmailInput');
  const passwordInput = document.getElementById('userPasswordInput');
  const fullnameInput = document.getElementById('userFullnameInput');
  const positionInput = document.getElementById('userPositionInput');
  const roleInput = document.getElementById('userRoleInput');
  const branchInput = document.getElementById('userBranchInput');
  const firstLoginInput = document.getElementById('userFirstLoginInput');

  resetUserForm();

  if (mode === 'edit' && index != null) {
    const user = allUsers[index];
    if (!user) {
      alert('User not found.');
      return;
    }

    editingUserEmail = user.email;

    if (title) title.innerText = 'Edit User';
    if (submitButton) submitButton.innerText = 'Update User';
    if (passwordHint) passwordHint.innerText = 'Leave this blank to keep the current password.';
    if (emailInput) emailInput.value = user.email || '';
    if (passwordInput) passwordInput.value = '';
    if (fullnameInput) fullnameInput.value = user.fullname || '';
    if (positionInput) positionInput.value = user.position || '';
    if (roleInput) roleInput.value = user.role || 'teller';
    if (branchInput) branchInput.value = user.branchid || '';
    if (firstLoginInput) firstLoginInput.checked = Boolean(user.firstLogin);
  }

  if (modal) modal.classList.add('active');
}

function closeUserModal() {
  const modal = document.getElementById('userModal');
  if (modal) modal.classList.remove('active');
  resetUserForm();
}

async function submitUserForm() {
  const email = document.getElementById('userEmailInput')?.value.trim().toLowerCase() || '';
  const password = document.getElementById('userPasswordInput')?.value || '';
  const fullname = document.getElementById('userFullnameInput')?.value.trim() || '';
  const position = document.getElementById('userPositionInput')?.value.trim() || '';
  const role = document.getElementById('userRoleInput')?.value || '';
  const branchid = document.getElementById('userBranchInput')?.value.trim() || '';
  const firstLogin = Boolean(document.getElementById('userFirstLoginInput')?.checked);
  const isEditing = Boolean(editingUserEmail);

  if (!email || !fullname || !position || !role) {
    alert('Please complete email, fullname, position, and role.');
    return;
  }

  if (!isEditing && !password) {
    alert('Please enter a default password.');
    return;
  }

  try {
    const res = await apiRequest({
      method: 'POST',
      body: JSON.stringify({
        action: isEditing ? 'updateUser' : 'createUser',
        originalEmail: editingUserEmail,
        email,
        password,
        fullname,
        position,
        role,
        branchid,
        firstLogin
      })
    });
    const data = await res.json();

    if (!data.success) {
      alert(data.message || 'Failed to save user.');
      return;
    }

    alert(isEditing ? 'User updated successfully.' : 'User created successfully.');
    closeUserModal();
    loadUsers();
  } catch (err) {
    console.error('Failed to save user', err);
    alert('Failed to save user.');
  }
}

async function loadAdminTable() {
  const res = await apiRequest({
    method: 'POST',
    body: JSON.stringify({ action: 'getRequests' })
  });
  const data = sortRequestsByDatestamp(await res.json());
  allRequests = data;

  let html = '';
  let count = 0;

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!Array.isArray(r) || !r.length) continue;
    count++;
    const dateStr = r[10] ? new Date(r[10]).toLocaleString() : 'N/A';

    html += `
      <tr>
        <td>${escapeHtml(r[0])}</td>
        <td>${escapeHtml(r[1])}</td>
        <td>₱${escapeHtml(r[2])}</td>
        <td>₱${escapeHtml(r[3])}</td>
        <td>₱${escapeHtml(r[4])}</td>
        <td>${escapeHtml(r[5])}</td>
        <td>${escapeHtml(r[8] || '—')}</td>
        <td><span class="${getStatusClass(r[6])}">${escapeHtml(r[6])}</span></td>
        <td>${dateStr}</td>
        <td><button class="btn blue" onclick="openModal(${escapeHtml(JSON.stringify(String(r[0])))})">View</button></td>
      </tr>
    `;
  }

  const adminTable = document.getElementById('adminTable');
  if (adminTable) adminTable.innerHTML = html || '<tr><td colspan="10">No requests found.</td></tr>';

  const tableCount = document.getElementById('tableCount');
  if (tableCount) tableCount.innerText = `${count} requests listed`;
}

async function loadAdminCounts() {
  const res = await apiRequest({
    method: 'POST',
    body: JSON.stringify({ action: 'getRequests' })
  });

  const data = await res.json();
  let total = 0;
  let pending = 0;
  let forwarded = 0;
  let approved = 0;

  for (let i = 1; i < data.length; i++) {
    const r = data[i];
    if (!Array.isArray(r) || !r.length) continue;
    total++;
    if (r[6] === 'Pending') pending++;
    if (r[6] === 'Forwarded') forwarded++;
    if (r[6] === 'Approved') approved++;
  }

  const totalEl = document.getElementById('adminTotal');
  const pendingEl = document.getElementById('adminPending');
  const forwardedEl = document.getElementById('adminForwarded');
  const approvedEl = document.getElementById('adminApproved');

  if (totalEl) totalEl.innerText = total;
  if (pendingEl) pendingEl.innerText = pending;
  if (forwardedEl) forwardedEl.innerText = forwarded;
  if (approvedEl) approvedEl.innerText = approved;
}

function filterAdminTable() {
  if (!Array.isArray(allRequests)) return;
  const searchText = (document.getElementById('adminSearch')?.value || '').toLowerCase();
  const statusFilter = document.getElementById('adminStatusFilter')?.value || 'All Statuses';

  let html = '';
  let count = 0;

  for (let i = 1; i < allRequests.length; i++) {
    const r = allRequests[i];
    if (!Array.isArray(r) || !r.length) continue;

    const rowText = `${escapeHtml(r[0])} ${escapeHtml(r[1])} ${escapeHtml(r[5])} ${escapeHtml(r[8])} ${escapeHtml(r[6])}`.toLowerCase();
    if (searchText && !rowText.includes(searchText)) continue;
    if (statusFilter !== 'All Statuses' && r[6] !== statusFilter) continue;

    count++;
    const dateStr = r[10] ? new Date(r[10]).toLocaleString() : 'N/A';

    html += `
      <tr>
        <td>${escapeHtml(r[0])}</td>
        <td>${escapeHtml(r[1])}</td>
        <td>₱${escapeHtml(r[2])}</td>
        <td>₱${escapeHtml(r[3])}</td>
        <td>₱${escapeHtml(r[4])}</td>
        <td>${escapeHtml(r[5])}</td>
        <td>${escapeHtml(r[8] || '—')}</td>
        <td><span class="${getStatusClass(r[6])}">${escapeHtml(r[6])}</span></td>
        <td>${dateStr}</td>
        <td><button class="btn blue" onclick="openModal(${escapeHtml(JSON.stringify(String(r[0])))})">View</button></td>
      </tr>
    `;
  }

  const adminTable = document.getElementById('adminTable');
  if (adminTable) adminTable.innerHTML = html || '<tr><td colspan="10">No requests found.</td></tr>';
  const tableCount = document.getElementById('tableCount');
  if (tableCount) tableCount.innerText = `${count} requests listed`;
}

async function loadSettings() {
  try {
    const res = await apiRequest({
      method: 'POST',
      body: JSON.stringify({ action: 'getSettings' })
    });
    const data = await res.json();
    const settings = data.settings || {};

    const tellerSignatory = document.getElementById('tellerSignatory');
    const branchSignatory = document.getElementById('branchManagerSignatory');
    const financeSignatory = document.getElementById('financeManagerSignatory');

    if (tellerSignatory) tellerSignatory.value = settings.tellerName || '';
    if (branchSignatory) branchSignatory.value = settings.branchManagerName || '';
    if (financeSignatory) financeSignatory.value = settings.financeManagerName || '';

    const previewMap = [
      {id: 'tellerSignaturePreview', value: settings.tellerSignatureData},
      {id: 'branchSignaturePreview', value: settings.branchManagerSignatureData},
      {id: 'financeSignaturePreview', value: settings.financeManagerSignatureData},
      {id: 'logoPreview', value: settings.reportHeaderImage}
    ];

    previewMap.forEach(item => {
      const img = document.getElementById(item.id);
      if (img) {
        const safeValue = safeImageDataUrl(item.value);
        img.src = safeValue;
        img.style.display = safeValue ? 'block' : 'none';
      }
    });
  } catch (err) {
    console.error('Failed to load admin settings', err);
  }
}

async function saveSignatorySettings() {
  const tellerSignatory = document.getElementById('tellerSignatory')?.value || '';
  const branchSignatory = document.getElementById('branchManagerSignatory')?.value || '';
  const financeSignatory = document.getElementById('financeManagerSignatory')?.value || '';

  const res = await apiRequest({
    method: 'POST',
    body: JSON.stringify({ action: 'saveSettings', settings: {
      tellerName: tellerSignatory,
      branchManagerName: branchSignatory,
      financeManagerName: financeSignatory
    }})
  });
  const data = await res.json();
  if (data.success) {
    alert('Settings saved successfully.');
  } else {
    alert('Failed to save settings.');
  }
}

function uploadSignature(role) {
  const inputId = role === 'teller' ? 'tellerSignatureFile' : role === 'branchManager' ? 'branchSignatureFile' : 'financeSignatureFile';
  const previewId = role === 'teller' ? 'tellerSignaturePreview' : role === 'branchManager' ? 'branchSignaturePreview' : 'financeSignaturePreview';
  const input = document.getElementById(inputId);
  const preview = document.getElementById(previewId);
  if (!input || !input.files || !input.files[0]) {
    alert('Please select a signature file to upload.');
    return;
  }

  const file = input.files[0];
  if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type) || file.size > 33000) {
    alert('Please select a PNG, JPEG, GIF, or WebP image smaller than 33KB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = async (event) => {
    const dataUrl = event.target.result;
    if (preview) {
      preview.src = dataUrl;
      preview.style.display = 'block';
    }

    const base64 = dataUrl.split(',')[1];
    const res = await apiRequest({
      method: 'POST',
      body: JSON.stringify({ action: 'saveSignature', role: role, mimeType: file.type, fileBase64: base64 })
    });
    const data = await res.json();
    if (!data.success) {
      alert('Failed to upload signature.');
    } else {
      alert('Signature uploaded successfully.');
    }
  };
  reader.readAsDataURL(file);
}

async function clearSignature(role) {
  const previewId = role === 'teller' ? 'tellerSignaturePreview' : role === 'branchManager' ? 'branchSignaturePreview' : 'financeSignaturePreview';
  const fileId = role === 'teller' ? 'tellerSignatureFile' : role === 'branchManager' ? 'branchSignatureFile' : 'financeSignatureFile';
  const preview = document.getElementById(previewId);
  const input = document.getElementById(fileId);

  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  if (input) {
    input.value = '';
  }

  const key = role === 'teller' ? 'tellerSignatureData' : role === 'branchManager' ? 'branchManagerSignatureData' : 'financeManagerSignatureData';
  await apiRequest({
    method: 'POST',
    body: JSON.stringify({ action: 'saveSettings', settings: { [key]: '' } })
  });
}

function uploadLogo() {
  const input = document.getElementById('logoFile');
  const preview = document.getElementById('logoPreview');
  if (!input || !input.files || !input.files[0]) {
    alert('Please select a logo file to upload.');
    return;
  }

  const file = input.files[0];
  if (!["image/png", "image/jpeg", "image/gif", "image/webp"].includes(file.type) || file.size > 33000) {
    alert('Please select a PNG, JPEG, GIF, or WebP image smaller than 33KB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = async (event) => {
    const dataUrl = event.target.result;
    if (!dataUrl.startsWith('data:image/')) {
      alert('Please select a valid image file.');
      return;
    }
    if (dataUrl.length > 45000) {
      alert('Image data is too large after encoding. Please use a smaller or compressed image.');
      return;
    }
    if (preview) {
      preview.src = dataUrl;
      preview.style.display = 'block';
    }

    const res = await apiRequest({
      method: 'POST',
      body: JSON.stringify({ action: 'saveSettings', settings: { reportHeaderImage: dataUrl } })
    });
    const data = await res.json();
    if (!data.success) {
      alert('Failed to upload logo.');
    } else {
      alert('Logo uploaded successfully.');
      loadSettings(); // Refresh the preview
    }
  };
  reader.readAsDataURL(file);
}

async function clearLogo() {
  const preview = document.getElementById('logoPreview');
  const input = document.getElementById('logoFile');

  if (preview) {
    preview.src = '';
    preview.style.display = 'none';
  }
  if (input) {
    input.value = '';
  }

  await apiRequest({
    method: 'POST',
    body: JSON.stringify({ action: 'saveSettings', settings: { reportHeaderImage: '' } })
  });
  alert('Logo cleared successfully.');
}

// 🔧 TELLER NAVIGATION
function navigateToTeller(page) {
  // Update sidebar active state
  document.querySelectorAll('.sidebar-main .sidebar-btn, .sidebar-more .sidebar-btn').forEach(btn => btn.classList.remove('active'));
  const selectedButton = Array.from(document.querySelectorAll('.sidebar-main .sidebar-btn, .sidebar-more .sidebar-btn'))
    .find(btn => btn.getAttribute('onclick')?.includes(`navigateToTeller('${page}')`));
  if (selectedButton) selectedButton.classList.add('active');

  // Update header
  const mainHeader = document.querySelector('.main-header');
  if (mainHeader) {
    const headerContent = mainHeader.querySelector('.header-content');
    if (page === 'entry') {
      headerContent.innerHTML = '<h1>Withdrawal Entry</h1><p class="subtitle">Teller Portal · Submit requests to Branch Manager for review</p>';
      mainHeader.querySelector('.header-actions').innerHTML = '<button class="btn" onclick="location.reload()">Refresh</button><button class="btn" onclick="alert(\'Export feature not configured yet\')">Export</button><button class="btn blue" onclick="openRequestModal()">New Withdrawal Request</button>';
    } else if (page === 'submissions') {
      headerContent.innerHTML = '<h1>My Submitted Requests</h1><p class="subtitle">Teller Portal · View all your submitted withdrawal requests</p>';
      mainHeader.querySelector('.header-actions').innerHTML = '<button class="btn" onclick="location.reload()">Refresh</button><button class="btn blue" onclick="openRequestModal()">New Request</button>';
    } else if (page === 'history') {
      headerContent.innerHTML = '<h1>Transaction History</h1><p class="subtitle">Teller Portal · Complete history of all withdrawal transactions</p>';
      mainHeader.querySelector('.header-actions').innerHTML = '<button class="btn" onclick="location.reload()">Refresh</button>';
    } else if (page === 'notifications') {
      headerContent.innerHTML = '<h1>Notifications</h1><p class="subtitle">Teller Portal · System notifications and alerts</p>';
      mainHeader.querySelector('.header-actions').innerHTML = '<button class="btn" onclick="location.reload()">Refresh</button>';
    }
  }

  // Toggle views
  const entryView = document.getElementById('entryView');
  const submissionsView = document.getElementById('submissionsView');
  const historyView = document.getElementById('historyView');
  const notificationsView = document.getElementById('notificationsView');

  if (entryView) entryView.style.display = (page === 'entry') ? 'block' : 'none';
  if (submissionsView) submissionsView.style.display = (page === 'submissions') ? 'block' : 'none';
  if (historyView) historyView.style.display = (page === 'history') ? 'block' : 'none';
  if (notificationsView) notificationsView.style.display = (page === 'notifications') ? 'block' : 'none';

  // Load data based on page
  if (page === 'submissions') {
    loadTellerSubmissions();
  } else if (page === 'history') {
    loadTellerHistory();
  }
}

function initializeTellerPage() {
  // No additional initialization needed
}

function loadTellerSubmissions() {
  if (!Array.isArray(allRequests)) return;
  
  const tellerEmail = localStorage.getItem("user");
  const tellerFullname = localStorage.getItem("fullname");
  
  let html = "";
  let count = 0;

  for (let i = 1; i < allRequests.length; i++) {
    const r = allRequests[i];
    if (!Array.isArray(r) || !r.length) continue;

    // Filter by teller email or fullname (column 7 is ProcessedBy which should have teller name)
    if (r[7] === tellerEmail || r[7] === tellerFullname) {
      count++;
      const dateStr = r[10] || (r[8] ? new Date(r[8]).toLocaleString() : "N/A");

      html += `
      <tr>
        <td>${escapeHtml(r[0])}</td>
        <td>${escapeHtml(r[1])}</td>
        <td>₱${escapeHtml(r[2])}</td>
        <td>₱${escapeHtml(r[3])}</td>
        <td>₱${escapeHtml(r[4])}</td>
        <td>${escapeHtml(r[5])}</td>
        <td><span class="${getStatusClass(r[6])}">${escapeHtml(r[6])}</span></td>
        <td>${dateStr}</td>
        <td>
          <button class="btn blue" onclick="openModal(${escapeHtml(JSON.stringify(String(r[0])))})">View</button>
        </td>
      </tr>
      `;
    }
  }

  const submissionsTable = document.getElementById("submissionsTable");
  if (submissionsTable) submissionsTable.innerHTML = html || '<tr><td colspan="9">No requests found.</td></tr>';

  const submissionsCount = document.getElementById("submissionsCount");
  if (submissionsCount) submissionsCount.innerText = `${count} request${count !== 1 ? 's' : ''}`;
}

function loadTellerHistory() {
  if (!Array.isArray(allRequests)) return;
  
  const tellerEmail = localStorage.getItem("user");
  const tellerFullname = localStorage.getItem("fullname");
  
  let html = "";
  let count = 0;

  for (let i = 1; i < allRequests.length; i++) {
    const r = allRequests[i];
    if (!Array.isArray(r) || !r.length) continue;

    // Filter by teller email or fullname
    if (r[7] === tellerEmail || r[7] === tellerFullname) {
      count++;
      const dateStr = r[10] || (r[8] ? new Date(r[8]).toLocaleString() : "N/A");

      html += `
      <tr>
        <td>${escapeHtml(r[0])}</td>
        <td>${escapeHtml(r[1])}</td>
        <td>₱${escapeHtml(r[3])}</td>
        <td>${escapeHtml(r[5])}</td>
        <td><span class="${getStatusClass(r[6])}">${escapeHtml(r[6])}</span></td>
        <td>${escapeHtml(r[7])}</td>
        <td>${escapeHtml(r[8] || "—")}</td>
        <td>${escapeHtml(r[9] || "—")}</td>
        <td>${dateStr}</td>
      </tr>
      `;
    }
  }

  const historyTable = document.getElementById("historyTable");
  if (historyTable) historyTable.innerHTML = html || '<tr><td colspan="9">No transactions found.</td></tr>';

  const historyCount = document.getElementById("historyCount");
  if (historyCount) historyCount.innerText = `${count} transaction${count !== 1 ? 's' : ''}`;
}
