const SHEET_ID = "15A0drhU4vAa1HA0FNGO9fefiYvmzmpAQgnLRoja0978";
const SESSION_TTL_SECONDS = 21600;
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_SECONDS = 900;
const VALID_ROLES = ["teller", "branch_manager", "finance_manager", "admin"];

function normalizeEmail(value) {
  return String(value == null ? "" : value).trim().toLowerCase();
}

function safeText(value, maxLength) {
  const text = String(value == null ? "" : value).trim();
  return text.slice(0, maxLength || 500);
}

function safeSheetText(value, maxLength) {
  const text = safeText(value, maxLength);
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

function makeSessionToken() {
  return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
}

function credentialFingerprint(value) {
  return digestToWebSafeBase64(
    Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value || ""), Utilities.Charset.UTF_8)
  );
}

function sessionCacheKey(token) {
  return "session:" + String(token || "");
}

function issueSession(user) {
  const token = makeSessionToken();
  const session = {
    email: normalizeEmail(user.email),
    role: safeText(user.role, 40),
    fullname: safeText(user.fullname, 150),
    position: safeText(user.position, 150),
    branchid: safeText(user.branchid, 100),
    authVersion: safeText(user.authVersion, 100)
  };
  CacheService.getScriptCache().put(sessionCacheKey(token), JSON.stringify(session), SESSION_TTL_SECONDS);
  return { token: token, session: session };
}

function getCurrentUserRecord(email) {
  const meta = getUsersSheetMeta();
  const indexes = getUserIndexes(meta);
  const target = normalizeEmail(email);

  for (let i = 1; i < meta.rows.length; i++) {
    const row = meta.rows[i];
    if (normalizeEmail(row[indexes.email]) === target) {
      return {
        email: target,
        role: safeText(row[indexes.role], 40),
        fullname: safeText(row[indexes.fullname], 150),
        position: safeText(row[indexes.position], 150),
        branchid: safeText(row[indexes.branchid], 100),
        authVersion: credentialFingerprint(row[indexes.password])
      };
    }
  }
  return null;
}

function requireSession(data) {
  const token = safeText(data && data.token, 200);
  if (!token) return null;

  const cache = CacheService.getScriptCache();
  const cached = cache.get(sessionCacheKey(token));
  if (!cached) return null;

  let session;
  try {
    session = JSON.parse(cached);
  } catch (err) {
    cache.remove(sessionCacheKey(token));
    return null;
  }

  // Re-read the account so role changes or account deletion take effect immediately.
  const current = getCurrentUserRecord(session.email);
  const missingRequiredBranch = current && (current.role === "teller" || current.role === "branch_manager") && !current.branchid;
  if (!current || VALID_ROLES.indexOf(current.role) < 0 || missingRequiredBranch || current.authVersion !== session.authVersion) {
    cache.remove(sessionCacheKey(token));
    return null;
  }

  cache.put(sessionCacheKey(token), JSON.stringify(current), SESSION_TTL_SECONDS);
  current.token = token;
  return current;
}

function isRole(session, allowedRoles) {
  return Boolean(session && allowedRoles.indexOf(session.role) >= 0);
}

function unauthorized(message) {
  return { success: false, error: "UNAUTHORIZED", message: message || "Authentication required." };
}

function forbidden(message) {
  return { success: false, error: "FORBIDDEN", message: message || "You do not have permission for this action." };
}

function loginAttemptKey(email) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalizeEmail(email), Utilities.Charset.UTF_8);
  return "login:" + digestToWebSafeBase64(digest);
}

function getLoginAttemptCount(email) {
  return Number(CacheService.getScriptCache().get(loginAttemptKey(email)) || 0);
}

function recordFailedLogin(email) {
  const cache = CacheService.getScriptCache();
  const key = loginAttemptKey(email);
  cache.put(key, String(getLoginAttemptCount(email) + 1), LOGIN_LOCK_SECONDS);
}

function clearFailedLogins(email) {
  CacheService.getScriptCache().remove(loginAttemptKey(email));
}

function getUsersSheet() {
  return SpreadsheetApp.openById(SHEET_ID).getSheetByName("Users");
}

function getUsersSheetMeta() {
  const sheet = getUsersSheet();
  const rows = sheet.getDataRange().getValues();
  const headers = rows.length
    ? rows[0].map(header => String(header || "").trim())
    : [];

  const headerLookup = {};
  headers.forEach((header, index) => {
    if (header) {
      headerLookup[header.toLowerCase()] = index;
    }
  });

  return { sheet, rows, headers, headerLookup };
}

function getHeaderIndex(headerLookup, candidates, fallbackIndex) {
  for (let i = 0; i < candidates.length; i++) {
    const key = String(candidates[i]).trim().toLowerCase();
    if (Object.prototype.hasOwnProperty.call(headerLookup, key)) {
      return headerLookup[key];
    }
  }

  return fallbackIndex;
}

function normalizeFlag(value) {
  const normalized = String(value == null ? "" : value).trim().toLowerCase();
  return normalized === "true" || normalized === "yes" || normalized === "y" || normalized === "1";
}

function isFirstLoginUser(row, indexes) {
  const firstLoginValue = indexes.firstLogin >= 0 ? row[indexes.firstLogin] : "";
  const mustChangeValue = indexes.mustChangePassword >= 0 ? row[indexes.mustChangePassword] : "";
  return normalizeFlag(firstLoginValue) || normalizeFlag(mustChangeValue);
}

const PASSWORD_HASH_ALGORITHM = "sha256p";
const PASSWORD_HASH_ITERATIONS = 12000;

function normalizePasswordInput(password) {
  return String(password == null ? "" : password).trim();
}

function makePasswordSalt() {
  return Utilities.getUuid().replace(/-/g, "") + Utilities.getUuid().replace(/-/g, "");
}

function getPasswordPepper() {
  const properties = PropertiesService.getScriptProperties();
  let pepper = properties.getProperty("PASSWORD_PEPPER");
  if (pepper) return pepper;

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    pepper = properties.getProperty("PASSWORD_PEPPER");
    if (!pepper) {
      pepper = makeSessionToken();
      properties.setProperty("PASSWORD_PEPPER", pepper);
    }
    return pepper;
  } finally {
    lock.releaseLock();
  }
}

function digestToWebSafeBase64(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, "");
}

function computePasswordHash(password, salt, iterations, algorithm) {
  const pepper = algorithm === "sha256p" ? getPasswordPepper() : "";
  let digestInput = normalizePasswordInput(password) + ":" + String(salt || "");
  if (algorithm === "sha256p") digestInput += ":" + pepper;

  for (let i = 0; i < iterations; i++) {
    digestInput = digestToWebSafeBase64(
      Utilities.computeDigest(
        Utilities.DigestAlgorithm.SHA_256,
        digestInput,
        Utilities.Charset.UTF_8
      )
    );
  }

  return digestInput;
}

function hashPassword(password) {
  const salt = makePasswordSalt();
  const hash = computePasswordHash(password, salt, PASSWORD_HASH_ITERATIONS, PASSWORD_HASH_ALGORITHM);
  return [PASSWORD_HASH_ALGORITHM, PASSWORD_HASH_ITERATIONS, salt, hash].join("$");
}

function isHashedPassword(storedPassword) {
  return /^(sha256|sha256p)\$\d+\$[^$]+\$[^$]+$/.test(String(storedPassword || "").trim());
}

function constantTimeEquals(left, right) {
  const leftText = String(left || "");
  const rightText = String(right || "");
  const maxLength = Math.max(leftText.length, rightText.length);
  let diff = leftText.length ^ rightText.length;

  for (let i = 0; i < maxLength; i++) {
    const leftCode = i < leftText.length ? leftText.charCodeAt(i) : 0;
    const rightCode = i < rightText.length ? rightText.charCodeAt(i) : 0;
    diff |= leftCode ^ rightCode;
  }

  return diff === 0;
}

function verifyPassword(password, storedPassword) {
  const stored = String(storedPassword || "").trim();
  const candidate = normalizePasswordInput(password);

  if (!stored) return false;

  if (!isHashedPassword(stored)) {
    return stored === candidate;
  }

  const parts = stored.split("$");
  const algorithm = parts[0];
  const iterations = Number(parts[1]);

  if (!iterations || iterations < 1) return false;

  const candidateHash = computePasswordHash(candidate, parts[2], iterations, algorithm);
  return constantTimeEquals(candidateHash, parts[3]);
}

function upgradePasswordHashIfNeeded(sheet, rowNumber, passwordIndex, password, storedPassword) {
  const parts = isHashedPassword(storedPassword) ? String(storedPassword).split("$") : [];
  const storedAlgorithm = parts[0] || "";
  const storedIterations = Number(parts[1] || 0);
  if (!isHashedPassword(storedPassword) || storedAlgorithm !== PASSWORD_HASH_ALGORITHM || storedIterations !== PASSWORD_HASH_ITERATIONS) {
    const upgraded = hashPassword(password);
    sheet.getRange(rowNumber, passwordIndex + 1).setValue(upgraded);
    return upgraded;
  }
  return storedPassword;
}

// 🔐 LOGIN - UNIFIED FUNCTION
function login(email, password) {
  const meta = getUsersSheetMeta();
  const rows = meta.rows;
  const indexes = {
    email: getHeaderIndex(meta.headerLookup, ["email", "user", "username"], 0),
    password: getHeaderIndex(meta.headerLookup, ["password"], 1),
    role: getHeaderIndex(meta.headerLookup, ["role"], 2),
    fullname: getHeaderIndex(meta.headerLookup, ["fullname", "full name", "name"], 3),
    position: getHeaderIndex(meta.headerLookup, ["position"], 4),
    branchid: getHeaderIndex(meta.headerLookup, ["branchid", "branch id"], 5),
    firstLogin: getHeaderIndex(meta.headerLookup, ["firstlogin", "first login"], -1),
    mustChangePassword: getHeaderIndex(meta.headerLookup, ["mustchangepassword", "must change password"], -1)
  };

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPassword = normalizePasswordInput(password);

  if (!normalizedEmail || !normalizedPassword) return { success: false };
  if (getLoginAttemptCount(normalizedEmail) >= MAX_LOGIN_ATTEMPTS) {
    return { success: false, error: "RATE_LIMITED", message: "Too many sign-in attempts. Please try again later." };
  }

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const sheetEmail = String(row[indexes.email] || "").trim().toLowerCase();
    const sheetPassword = String(row[indexes.password] || "").trim();

    if (sheetEmail === normalizedEmail && verifyPassword(normalizedPassword, sheetPassword)) {
      const currentStoredPassword = upgradePasswordHashIfNeeded(meta.sheet, i + 1, indexes.password, normalizedPassword, sheetPassword);

      const mustChangePassword = isFirstLoginUser(row, indexes);
      const user = {
        email: sheetEmail,
        role: row[indexes.role],
        branchid: row[indexes.branchid] || "",
        fullname: row[indexes.fullname] || "",
        position: row[indexes.position] || "",
        authVersion: credentialFingerprint(currentStoredPassword)
      };
      clearFailedLogins(normalizedEmail);

      if (VALID_ROLES.indexOf(String(user.role)) < 0 ||
          ((user.role === "teller" || user.role === "branch_manager") && !safeText(user.branchid, 100))) {
        return { success: false, message: "This account is not configured correctly. Contact an administrator." };
      }

      if (mustChangePassword) {
        return {
          success: true,
          role: user.role,
          user: user.email,
          branchid: user.branchid,
          fullname: user.fullname,
          position: user.position,
          mustChangePassword: true
        };
      }

      const issued = issueSession(user);

      return {
        success: true,
        token: issued.token,
        role: user.role,
        user: user.email,
        branchid: user.branchid,
        fullname: user.fullname,
        position: user.position,
        mustChangePassword: false
      };
    }
  }

  recordFailedLogin(normalizedEmail);
  return { success: false };
}

function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, message: "Use POST requests. Credentials are never accepted in URLs." }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;

    let result;

    if (action === "login") result = login(data.email, data.password);
    else if (action === "changePassword") result = changePassword(data);
    else if (action === "forgotPassword") result = forgotPassword(data.email);
    else {
      const session = requireSession(data);
      if (!session) result = unauthorized();
      else if (action === "logout") result = logoutSession(session);
      else if (action === "createRequest") result = createRequest(data, session);
      else if (action === "editRequest") result = editRequest(data, session);
      else if (action === "getRequests") result = getRequests(data, session);
      else if (action === "updateStatus") result = updateStatus(data, session);
      else if (action === "getDashboardCounts") result = getDashboardCounts(data, session);
      else if (action === "getSettings") result = isRole(session, ["teller", "admin"]) ? getSettings(session) : forbidden();
      else if (action === "saveSettings") result = isRole(session, ["admin"]) ? saveSettings(data.settings) : forbidden();
      else if (action === "saveSignature") result = isRole(session, ["admin"]) ? saveSignature(data) : forbidden();
      else if (action === "getUsers") result = isRole(session, ["admin"]) ? getUsers() : forbidden();
      else if (action === "createUser") result = isRole(session, ["admin"]) ? createUser(data) : forbidden();
      else if (action === "updateUser") result = isRole(session, ["admin"]) ? updateUser(data) : forbidden();
      else if (action === "getMembers") result = isRole(session, ["admin"]) ? getMembers() : forbidden();
      else result = { success: false, message: "Unknown action: " + String(action) };
    }

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    console.error(err);
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: "The request could not be processed." }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function logoutSession(session) {
  CacheService.getScriptCache().remove(sessionCacheKey(session.token));
  return { success: true };
}

function changePassword(data) {
  const email = String(data.email || "").trim().toLowerCase();
  const currentPassword = normalizePasswordInput(data.currentPassword);
  const newPassword = normalizePasswordInput(data.newPassword);

  if (!email || !currentPassword || !newPassword) {
    return { success: false, message: "Email, current password, and new password are required." };
  }

  if (getLoginAttemptCount(email) >= MAX_LOGIN_ATTEMPTS) {
    return { success: false, error: "RATE_LIMITED", message: "Too many attempts. Please try again later." };
  }

  if (newPassword.length < 12) {
    return { success: false, message: "New password must be at least 12 characters long." };
  }

  if (newPassword === currentPassword) {
    return { success: false, message: "New password must be different from the current password." };
  }

  const meta = getUsersSheetMeta();
  const indexes = {
    email: getHeaderIndex(meta.headerLookup, ["email", "user", "username"], 0),
    password: getHeaderIndex(meta.headerLookup, ["password"], 1),
    firstLogin: getHeaderIndex(meta.headerLookup, ["firstlogin", "first login"], -1),
    mustChangePassword: getHeaderIndex(meta.headerLookup, ["mustchangepassword", "must change password"], -1)
  };

  for (let i = 1; i < meta.rows.length; i++) {
    const row = meta.rows[i];
    const sheetEmail = String(row[indexes.email] || "").trim().toLowerCase();
    const sheetPassword = String(row[indexes.password] || "").trim();

    if (sheetEmail === email) {
      if (!verifyPassword(currentPassword, sheetPassword)) {
        recordFailedLogin(email);
        return { success: false, message: "Unable to change the password with the supplied credentials." };
      }

      meta.sheet.getRange(i + 1, indexes.password + 1).setValue(hashPassword(newPassword));

      if (indexes.firstLogin >= 0) {
        meta.sheet.getRange(i + 1, indexes.firstLogin + 1).setValue(false);
      }

      if (indexes.mustChangePassword >= 0) {
        meta.sheet.getRange(i + 1, indexes.mustChangePassword + 1).setValue(false);
      }

      return login(email, newPassword);
    }
  }

  recordFailedLogin(email);
  return { success: false, message: "Unable to change the password with the supplied credentials." };
}

function forgotPassword(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return { success: true };
  }

  const resetKey = "reset:" + loginAttemptKey(normalizedEmail);
  const cache = CacheService.getScriptCache();
  if (cache.get(resetKey)) return { success: true };
  cache.put(resetKey, "1", 600);

  const meta = getUsersSheetMeta();
  const rows = meta.rows;
  const indexes = {
    email: getHeaderIndex(meta.headerLookup, ["email", "user", "username"], 0),
    fullname: getHeaderIndex(meta.headerLookup, ["fullname", "full name", "name"], 3)
  };

  for (let i = 1; i < rows.length; i++) {
    const sheetEmail = String(rows[i][indexes.email] || "").trim().toLowerCase();
    const fullname = String(rows[i][indexes.fullname] || "User").trim();

    if (sheetEmail === normalizedEmail) {
      try {
        MailApp.sendEmail(
          normalizedEmail,
          "Investment Withdrawal System Password Recovery",
          "Hello " + fullname + ",\n\n" +
          "You requested help signing in to the Investment Withdrawal System.\n\n" +
          "For your security, passwords cannot be viewed or emailed. Please ask an administrator to reset your password from User Management.\n\n" +
          "If you did not request this email, please ignore it."
        );
      } catch (err) {
        console.error("Password recovery email could not be sent.");
      }

        return { success: true };
    }
  }

  // Always return the same result to prevent account enumeration.
  return { success: true };
}

// ➕ CREATE REQUEST
function getUserIndexes(meta) {
  return {
    email: getHeaderIndex(meta.headerLookup, ["email", "user", "username"], 0),
    password: getHeaderIndex(meta.headerLookup, ["password"], 1),
    role: getHeaderIndex(meta.headerLookup, ["role"], 2),
    fullname: getHeaderIndex(meta.headerLookup, ["fullname", "full name", "name"], 3),
    position: getHeaderIndex(meta.headerLookup, ["position"], 4),
    branchid: getHeaderIndex(meta.headerLookup, ["branchid", "branch id"], 5),
    firstLogin: getHeaderIndex(meta.headerLookup, ["firstlogin", "first login"], -1),
    mustChangePassword: getHeaderIndex(meta.headerLookup, ["mustchangepassword", "must change password"], -1)
  };
}

function getUsers() {
  try {
    const meta = getUsersSheetMeta();
    const indexes = getUserIndexes(meta);
    const users = [];

    for (let i = 1; i < meta.rows.length; i++) {
      const row = meta.rows[i];
      const email = String(row[indexes.email] || "").trim().toLowerCase();

      if (!email) continue;

      users.push({
        email: email,
        role: String(row[indexes.role] || "").trim(),
        fullname: String(row[indexes.fullname] || "").trim(),
        position: String(row[indexes.position] || "").trim(),
        branchid: String(row[indexes.branchid] || "").trim(),
        firstLogin: isFirstLoginUser(row, indexes)
      });
    }

    return { success: true, users: users };
  } catch (err) {
    return { success: false, message: "Error fetching users: " + err.toString() };
  }
}

function createUser(data) {
  try {
    const meta = getUsersSheetMeta();
    const indexes = getUserIndexes(meta);
    const email = String(data.email || "").trim().toLowerCase();
    const password = normalizePasswordInput(data.password);
    const role = String(data.role || "").trim();
    const fullname = safeSheetText(data.fullname, 150);
    const position = safeSheetText(data.position, 150);
    const branchid = safeSheetText(data.branchid, 100);
    const firstLogin = typeof data.firstLogin === "boolean" ? data.firstLogin : true;

    if (!email || !password || !role || !fullname || !position) {
      return { success: false, message: "Email, password, role, fullname, and position are required." };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, message: "Enter a valid email address." };
    if (password.length < 12) return { success: false, message: "Temporary passwords must contain at least 12 characters." };
    if (VALID_ROLES.indexOf(role) < 0) return { success: false, message: "Invalid role." };
    if ((role === "teller" || role === "branch_manager") && !branchid) return { success: false, message: "A branch is required for this role." };

    for (let i = 1; i < meta.rows.length; i++) {
      const existingEmail = String(meta.rows[i][indexes.email] || "").trim().toLowerCase();
      if (existingEmail === email) {
        return { success: false, message: "A user with this email already exists." };
      }
    }

    const rowLength = Math.max(meta.headers.length, indexes.mustChangePassword + 1, indexes.firstLogin + 1, indexes.branchid + 1, 6);
    const newRow = new Array(rowLength).fill("");

    newRow[indexes.email] = email;
    newRow[indexes.password] = hashPassword(password);
    newRow[indexes.role] = role;
    newRow[indexes.fullname] = fullname;
    newRow[indexes.position] = position;
    newRow[indexes.branchid] = branchid;

    if (indexes.firstLogin >= 0) {
      newRow[indexes.firstLogin] = firstLogin;
    }

    if (indexes.mustChangePassword >= 0) {
      newRow[indexes.mustChangePassword] = firstLogin;
    }

    meta.sheet.appendRow(newRow);
    return { success: true };
  } catch (err) {
    return { success: false, message: "Error creating user: " + err.toString() };
  }
}

function updateUser(data) {
  try {
    const meta = getUsersSheetMeta();
    const indexes = getUserIndexes(meta);
    const originalEmail = String(data.originalEmail || "").trim().toLowerCase();
    const email = String(data.email || "").trim().toLowerCase();
    const password = normalizePasswordInput(data.password);
    const role = String(data.role || "").trim();
    const fullname = safeSheetText(data.fullname, 150);
    const position = safeSheetText(data.position, 150);
    const branchid = safeSheetText(data.branchid, 100);
    const firstLogin = typeof data.firstLogin === "boolean" ? data.firstLogin : true;

    if (!originalEmail || !email || !role || !fullname || !position) {
      return { success: false, message: "Original email, email, role, fullname, and position are required." };
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { success: false, message: "Enter a valid email address." };
    if (password && password.length < 12) return { success: false, message: "New temporary passwords must contain at least 12 characters." };
    if (VALID_ROLES.indexOf(role) < 0) return { success: false, message: "Invalid role." };
    if ((role === "teller" || role === "branch_manager") && !branchid) return { success: false, message: "A branch is required for this role." };

    let rowNumber = -1;

    for (let i = 1; i < meta.rows.length; i++) {
      const existingEmail = String(meta.rows[i][indexes.email] || "").trim().toLowerCase();

      if (existingEmail === email && existingEmail !== originalEmail) {
        return { success: false, message: "Another user already uses this email address." };
      }

      if (existingEmail === originalEmail) {
        rowNumber = i + 1;
      }
    }

    if (rowNumber < 0) {
      return { success: false, message: "User account not found." };
    }

    meta.sheet.getRange(rowNumber, indexes.email + 1).setValue(email);
    meta.sheet.getRange(rowNumber, indexes.role + 1).setValue(role);
    meta.sheet.getRange(rowNumber, indexes.fullname + 1).setValue(fullname);
    meta.sheet.getRange(rowNumber, indexes.position + 1).setValue(position);
    meta.sheet.getRange(rowNumber, indexes.branchid + 1).setValue(branchid);

    if (password) {
      meta.sheet.getRange(rowNumber, indexes.password + 1).setValue(hashPassword(password));
    }

    if (indexes.firstLogin >= 0) {
      meta.sheet.getRange(rowNumber, indexes.firstLogin + 1).setValue(firstLogin);
    }

    if (indexes.mustChangePassword >= 0) {
      meta.sheet.getRange(rowNumber, indexes.mustChangePassword + 1).setValue(firstLogin);
    }

    return { success: true };
  } catch (err) {
    return { success: false, message: "Error updating user: " + err.toString() };
  }
}

function createRequest(data, session) {
  if (!isRole(session, ["teller"])) return forbidden("Only tellers can create withdrawal requests.");
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Withdrawals");
  const memberName = safeSheetText(data.memberName, 150);
  const purpose = safeSheetText(data.purpose, 500);
  const contactNumber = safeSheetText(data.contactNumber, 50);
  const totalInvestment = Number(data.totalInvestment);
  const amount = Number(data.amount);
  const balance = totalInvestment - amount;
  const idempotencyKey = safeText(data.idempotencyKey, 100);

  if (!memberName || !purpose) return { success: false, message: "Member name and purpose are required." };
  if (!isFinite(totalInvestment) || !isFinite(amount) || totalInvestment <= 0 || amount <= 0 || amount > totalInvestment) {
    return { success: false, message: "Enter valid positive investment and withdrawal amounts." };
  }
  if (!/^[a-z0-9_-]{16,100}$/i.test(idempotencyKey)) {
    return { success: false, message: "A valid submission key is required." };
  }

  if (balance < 3000) {
    return {
      success: false,
      message: "Remaining balance cannot go below ₱3,000"
    };
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    ensureWithdrawalSchema(sheet);
    const lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      const existingRows = sheet.getRange(2, 1, lastRow - 1, REQUEST_IDEMPOTENCY_KEY_INDEX + 1).getValues();
      for (let i = 0; i < existingRows.length; i++) {
        if (safeText(existingRows[i][REQUEST_IDEMPOTENCY_KEY_INDEX], 100) !== idempotencyKey) continue;
        if (normalizeEmail(existingRows[i][REQUEST_OWNER_EMAIL_INDEX]) === session.email) {
          return { success: true, duplicate: true, requestId: existingRows[i][0] };
        }
        return { success: false, message: "That submission key is already in use." };
      }
    }

    const requestId = generateID();
    sheet.appendRow([
      requestId, memberName, totalInvestment, amount, balance, purpose, "Pending",
      safeSheetText(session.fullname || session.email, 150), "", "", new Date(), contactNumber,
      session.branchid, "", session.email, "", "", idempotencyKey
    ]);
    return { success: true, requestId: requestId };
  } finally {
    lock.releaseLock();
  }
}

const REQUEST_DATESTAMP_INDEX = 10;
const REQUEST_PROCESSED_BY_INDEX = 7;
const REQUEST_NOTES_INDEX = 13;
const REQUEST_OWNER_EMAIL_INDEX = 14;
const REQUEST_CHECKED_BY_EMAIL_INDEX = 15;
const REQUEST_APPROVED_BY_EMAIL_INDEX = 16;
const REQUEST_IDEMPOTENCY_KEY_INDEX = 17;

function ensureWithdrawalSchema(sheet) {
  const requiredHeaders = [
    { index: REQUEST_OWNER_EMAIL_INDEX, name: "ProcessedByEmail" },
    { index: REQUEST_CHECKED_BY_EMAIL_INDEX, name: "CheckedByEmail" },
    { index: REQUEST_APPROVED_BY_EMAIL_INDEX, name: "ApprovedByEmail" },
    { index: REQUEST_IDEMPOTENCY_KEY_INDEX, name: "SubmissionKey" }
  ];

  requiredHeaders.forEach(function (column) {
    const currentHeader = safeText(sheet.getRange(1, column.index + 1).getValue(), 100);
    if (!currentHeader) {
      const lastRow = sheet.getLastRow();
      const existingRange = lastRow > 1
        ? sheet.getRange(2, column.index + 1, lastRow - 1, 1)
        : null;
      const existingValues = existingRange ? existingRange.getValues() : [];
      const existingFormulas = existingRange ? existingRange.getFormulas() : [];
      const columnIsUnused = existingValues.every(function (row, index) {
        return safeText(row[0], 100) === "" && safeText(existingFormulas[index][0], 500) === "";
      });
      if (!columnIsUnused) {
        throw new Error("Withdrawal column " + (column.index + 1) + " contains data and cannot be assigned to " + column.name + ".");
      }
      sheet.getRange(1, column.index + 1).setValue(column.name);
    } else if (currentHeader.toLowerCase() !== column.name.toLowerCase()) {
      throw new Error("Withdrawal column " + (column.index + 1) + " must be reserved for " + column.name + ".");
    }
  });
}

function parseRequestDatestamp(value) {
  if (value instanceof Date) return value.getTime();

  if (typeof value === "number") {
    if (value > 100000000000) return value;
    if (value > 1000000000) return value * 1000;
    if (value > 20000 && value < 80000) return Math.round((value - 25569) * 86400000);
  }

  const trimmed = String(value == null ? "" : value).trim();
  if (!trimmed) return 0;

  const parsed = Date.parse(trimmed);
  if (!isNaN(parsed)) return parsed;

  const localMatch = trimmed.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:,?\s+(\d{1,2})(?::(\d{2}))?(?::(\d{2}))?\s*(AM|PM)?)?$/i);
  if (!localMatch) return 0;

  let first = Number(localMatch[1]);
  let second = Number(localMatch[2]);
  let year = Number(localMatch[3]);
  let hour = Number(localMatch[4] || 0);
  const minute = Number(localMatch[5] || 0);
  const secondValue = Number(localMatch[6] || 0);
  const meridiem = String(localMatch[7] || "").toUpperCase();

  if (year < 100) year += 2000;
  if (meridiem === "PM" && hour < 12) hour += 12;
  if (meridiem === "AM" && hour === 12) hour = 0;

  const month = first > 12 ? second : first;
  const day = first > 12 ? first : second;
  const localDate = new Date(year, month - 1, day, hour, minute, secondValue);

  return isNaN(localDate.getTime()) ? 0 : localDate.getTime();
}

function getRequestIdTime(request) {
  const match = String(request && request[0] != null ? request[0] : "").match(/\d{10,}/);
  return match ? Number(match[0]) : 0;
}

function compareRequestsByDatestampDesc(a, b) {
  const dateDiff = parseRequestDatestamp(b && b[REQUEST_DATESTAMP_INDEX]) - parseRequestDatestamp(a && a[REQUEST_DATESTAMP_INDEX]);
  if (dateDiff !== 0) return dateDiff;
  return getRequestIdTime(b) - getRequestIdTime(a);
}

function sortRequestsByDatestamp(rows) {
  if (!Array.isArray(rows) || rows.length <= 1) return Array.isArray(rows) ? rows : [];

  const header = rows[0];
  const sortedRows = rows.slice(1).sort(compareRequestsByDatestampDesc);
  return [header].concat(sortedRows);
}

// 📥 GET REQUESTS
function requestOwnedByTeller(request, session) {
  const ownerEmail = normalizeEmail(request && request[REQUEST_OWNER_EMAIL_INDEX]);
  if (ownerEmail) return ownerEmail === session.email;

  // Compatibility for rows created before ProcessedByEmail was introduced.
  const processedBy = normalizeEmail(request && request[REQUEST_PROCESSED_BY_INDEX]);
  return processedBy === session.email || processedBy === normalizeEmail(session.fullname);
}

function requestBelongsToSessionBranch(request, session) {
  return safeText(request && request[12], 100).toLowerCase() === safeText(session.branchid, 100).toLowerCase();
}

function canViewRequest(request, session) {
  if (isRole(session, ["admin", "finance_manager"])) return true;
  if (session.role === "branch_manager") return requestBelongsToSessionBranch(request, session);
  if (session.role === "teller") return requestOwnedByTeller(request, session);
  return false;
}

function parseIsoRequestDate(value, endOfDay) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = endOfDay
    ? new Date(year, month - 1, day, 23, 59, 59, 999)
    : new Date(year, month - 1, day, 0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return null;
  return date.getTime();
}

function getRequestDateRange(data) {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).getTime();
  const defaultEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
  const selectedStart = parseIsoRequestDate(data && data.dateFrom, false);
  const selectedEnd = parseIsoRequestDate(data && data.dateTo, true);

  if (selectedStart === null || selectedEnd === null || selectedStart > selectedEnd) {
    return { start: defaultStart, end: defaultEnd };
  }
  return { start: selectedStart, end: selectedEnd };
}

function requestIsWithinDateRange(request, range) {
  const timestamp = parseRequestDatestamp(request && request[REQUEST_DATESTAMP_INDEX]);
  return timestamp >= range.start && timestamp <= range.end;
}

function getRequests(data, session) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Withdrawals");
  ensureWithdrawalSchema(sheet);
  const rows = sheet.getDataRange().getValues();
  if (!rows.length) return [];
  const range = getRequestDateRange(data);
  const visibleRows = [rows[0].slice(0, REQUEST_OWNER_EMAIL_INDEX)].concat(
    rows.slice(1).filter(function (row) {
      return canViewRequest(row, session) && requestIsWithinDateRange(row, range);
    }).map(function (row) {
      // ProcessedByEmail is authorization metadata and is not needed by the browser.
      return row.slice(0, REQUEST_OWNER_EMAIL_INDEX);
    })
  );
  return sortRequestsByDatestamp(visibleRows);
}

// 🔄 UPDATE STATUS
function updateStatus(data, session) {
  if (!isRole(session, ["branch_manager", "finance_manager"])) return forbidden();
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Withdrawals");
  const requestId = safeText(data.request_id, 100);
  const requestedStatus = safeText(data.status, 40);
  const notes = safeSheetText(data.notes, 1000);
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);

  try {
    ensureWithdrawalSchema(sheet);
    const rows = sheet.getDataRange().getValues();
    for (let i = 1; i < rows.length; i++) {
      if (String(rows[i][0]) !== requestId) continue;
      const currentStatus = safeText(rows[i][6], 40);
      if (!canViewRequest(rows[i], session)) return forbidden("This request is outside your assigned scope.");

      const repeatedForward = session.role === "branch_manager" &&
        requestedStatus === "Forwarded" && currentStatus === "Forwarded" &&
        normalizeEmail(rows[i][REQUEST_CHECKED_BY_EMAIL_INDEX]) === session.email;
      const repeatedApproval = session.role === "finance_manager" &&
        requestedStatus === "Approved" && currentStatus === "Approved" &&
        normalizeEmail(rows[i][REQUEST_APPROVED_BY_EMAIL_INDEX]) === session.email;
      if (repeatedForward || repeatedApproval) {
        return { success: true, duplicate: true };
      }

      const branchAllowed = session.role === "branch_manager" &&
        (currentStatus === "Pending" || currentStatus === "Under Review") &&
        (requestedStatus === "Forwarded" || requestedStatus === "Returned");
      const financeAllowed = session.role === "finance_manager" && currentStatus === "Forwarded" &&
        (requestedStatus === "Approved" || requestedStatus === "Rejected" || requestedStatus === "Under Review");
      if (!branchAllowed && !financeAllowed) return forbidden("That status transition is not allowed.");
      if ((requestedStatus === "Returned" || requestedStatus === "Rejected" || requestedStatus === "Under Review") && !notes) {
        return { success: false, message: "Notes are required for this status change." };
      }

      sheet.getRange(i + 1, 7).setValue(requestedStatus); // Status (column 7)

      if (session.role === "branch_manager") {
        sheet.getRange(i + 1, 9).setValue(safeSheetText(session.fullname || session.email, 150));
        sheet.getRange(i + 1, REQUEST_CHECKED_BY_EMAIL_INDEX + 1).setValue(session.email);
      }

      if (session.role === "finance_manager") {
        if (requestedStatus === "Approved" || requestedStatus === "Rejected") {
          sheet.getRange(i + 1, 10).setValue(safeSheetText(session.fullname || session.email, 150));
          sheet.getRange(i + 1, REQUEST_APPROVED_BY_EMAIL_INDEX + 1).setValue(session.email);
        } else {
          sheet.getRange(i + 1, 10).setValue(""); // Clear ApprovedBy when sent back for further review
          sheet.getRange(i + 1, REQUEST_APPROVED_BY_EMAIL_INDEX + 1).setValue("");
        }
      }

      // Update DateStamp column (column K = 11)
      sheet.getRange(i + 1, 11).setValue(new Date());

      // Save branch manager notes in column N when provided.
      sheet.getRange(i + 1, 14).setValue(notes);
      return { success: true };
    }
    return { success: false, message: "Request not found." };
  } finally {
    lock.releaseLock();
  }
}

function editRequest(data, session) {
  if (!isRole(session, ["teller"])) return forbidden("Only tellers can edit returned requests.");
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Withdrawals");
  ensureWithdrawalSchema(sheet);
  const rows = sheet.getDataRange().getValues();

  const totalInvestment = Number(data.totalInvestment);
  const amount = Number(data.amount);
  const balance = totalInvestment - amount;
  const memberName = safeSheetText(data.memberName, 150);
  const purpose = safeSheetText(data.purpose, 500);
  const contactNumber = safeSheetText(data.contactNumber, 50);

  if (!memberName || !purpose) return { success: false, message: "Member name and purpose are required." };
  if (!isFinite(totalInvestment) || !isFinite(amount) || totalInvestment <= 0 || amount <= 0 || amount > totalInvestment) {
    return { success: false, message: "Enter valid positive investment and withdrawal amounts." };
  }

  if (balance < 3000) {
    return {
      success: false,
      message: "Remaining balance cannot go below â‚±3,000"
    };
  }

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.request_id) {
      if (!requestOwnedByTeller(rows[i], session)) return forbidden("You can only edit your own requests.");
      if (String(rows[i][6] || "").trim() !== "Returned") {
        return { success: false, message: "Only returned requests can be edited." };
      }

      sheet.getRange(i + 1, 2).setValue(memberName); // MemberName
      sheet.getRange(i + 1, 3).setValue(totalInvestment); // TotalInvestment
      sheet.getRange(i + 1, 4).setValue(amount); // AmountWithdrawn
      sheet.getRange(i + 1, 5).setValue(balance); // Balance
      sheet.getRange(i + 1, 6).setValue(purpose); // Purpose
      sheet.getRange(i + 1, 7).setValue("Pending"); // Status
      sheet.getRange(i + 1, 8).setValue(safeSheetText(session.fullname || session.email, 150)); // ProcessedBy display name
      sheet.getRange(i + 1, 9).setValue(""); // CheckedBy
      sheet.getRange(i + 1, 10).setValue(""); // ApprovedBy
      sheet.getRange(i + 1, 11).setValue(new Date()); // DateStamp
      sheet.getRange(i + 1, 12).setValue(contactNumber); // ContactNumber
      sheet.getRange(i + 1, 13).setValue(session.branchid); // TellerBranchId
      sheet.getRange(i + 1, 14).setValue(""); // Notes
      sheet.getRange(i + 1, 15).setValue(session.email); // ProcessedByEmail ownership identifier
      sheet.getRange(i + 1, 16).setValue(""); // CheckedByEmail
      sheet.getRange(i + 1, 17).setValue(""); // ApprovedByEmail

      return { success: true };
    }
  }

  return { success: false, message: "Request not found." };
}

// 🔢 Generate ID
function generateID() {
  return "REQ-" + new Date().getTime();
}

function getDashboardCounts(data, session) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Withdrawals");
  const allRows = sheet.getDataRange().getValues();
  const range = getRequestDateRange(data);
  const rows = allRows.length ? [allRows[0]].concat(allRows.slice(1).filter(function (row) {
    return canViewRequest(row, session) && requestIsWithinDateRange(row, range);
  })) : [];

  let awaiting = 0;
  let approved = 0;
  let rejected = 0;
  let review = 0;

  for (let i = 1; i < rows.length; i++) {
    const status = rows[i][6]; // Status column (index 6)

    if (status === "Pending" || status === "Forwarded") awaiting++;

    if (status === "Approved") approved++;
    if (status === "Rejected") rejected++;

    if (status === "Under Review") review++;
  }

  return {
    awaiting,
    approved,
    rejected,
    review
  };
}

function getSettings() {
  const sheet = getSettingsSheet();
  const rows = sheet.getDataRange().getValues();
  const settings = {};

  for (let i = 1; i < rows.length; i++) {
    const key = String(rows[i][0]).trim();
    const value = String(rows[i][1]);
    if (key) {
      settings[key] = value;
    }
  }

  return {
    success: true,
    settings: {
      tellerName: settings.tellerName || "",
      branchManagerName: settings.branchManagerName || "",
      financeManagerName: settings.financeManagerName || "",
      tellerSignatureData: settings.tellerSignatureData || "",
      branchManagerSignatureData: settings.branchManagerSignatureData || "",
      financeManagerSignatureData: settings.financeManagerSignatureData || "",
      reportHeaderImage: settings.reportHeaderImage || ""
    }
  };
}

function saveSettings(settings) {
  try {
    if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
      return { success: false, message: "Invalid settings payload." };
    }
    const allowedTextKeys = ["tellerName", "branchManagerName", "financeManagerName"];
    const allowedImageKeys = ["tellerSignatureData", "branchManagerSignatureData", "financeManagerSignatureData", "reportHeaderImage"];
    const sanitized = {};

    Object.keys(settings).forEach(function (key) {
      if (allowedTextKeys.indexOf(key) >= 0) {
        sanitized[key] = safeSheetText(settings[key], 150);
      } else if (allowedImageKeys.indexOf(key) >= 0) {
        const image = String(settings[key] || "");
        if (image && (!/^data:image\/(png|jpeg|jpg|gif|webp);base64,[a-z0-9+/=\s]+$/i.test(image) || image.length > 45000)) {
          throw new Error("Invalid or oversized image data.");
        }
        sanitized[key] = image;
      }
    });

    if (!Object.keys(sanitized).length) return { success: false, message: "No supported settings were provided." };
    const sheet = getSettingsSheet();

    const existing = {};
    const rows = sheet.getDataRange().getValues();

    for (let i = 1; i < rows.length; i++) {
      const key = String(rows[i][0]).trim();
      if (key) existing[key] = i + 1;
    }

    const values = Object.keys(sanitized).map(key => [key, sanitized[key]]);

    values.forEach(row => {
      const key = row[0];
      const value = row[1];
      if (existing[key]) {
        sheet.getRange(existing[key], 2).setValue(value);
      } else {
        sheet.appendRow(row);
      }
    });

    return { success: true };
  } catch (error) {
    console.error("Error in saveSettings:", error);
    return { success: false, message: error.toString() };
  }
}

function saveSignature(data) {
  const signatureKeyMap = {
    teller: "tellerSignatureData",
    branchManager: "branchManagerSignatureData",
    financeManager: "financeManagerSignatureData"
  };

  const key = signatureKeyMap[data.role];
  if (!key) {
    return { success: false, message: "Invalid signature role" };
  }

  const mimeType = String(data.mimeType || "").toLowerCase();
  const fileBase64 = String(data.fileBase64 || "");
  if (["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"].indexOf(mimeType) < 0) {
    return { success: false, message: "Unsupported signature image type." };
  }
  if (!/^[a-z0-9+/=\s]+$/i.test(fileBase64) || fileBase64.length > 44000) {
    return { success: false, message: "Signature image is invalid or too large." };
  }

  const signatureDataUrl = `data:${mimeType};base64,${fileBase64}`;
  return saveSettings({ [key]: signatureDataUrl });
}

function getSettingsSheet() {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  let sheet = spreadsheet.getSheetByName("Settings");

  if (!sheet) {
    sheet = spreadsheet.insertSheet("Settings");
    sheet.appendRow(["Key", "Value"]);
  } else {
    // Check if header row exists, add if missing
    const data = sheet.getDataRange().getValues();
    if (data.length === 0 || data[0][0] !== "Key" || data[0][1] !== "Value") {
      if (data.length === 0) {
        sheet.appendRow(["Key", "Value"]);
      } else {
        sheet.getRange(1, 1, 1, 2).setValues([["Key", "Value"]]);
      }
    }
  }

  return sheet;
}

// 👥 GET MEMBERS LIST
function getMembers() {
  try {
    const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Members");
    const rows = sheet.getDataRange().getValues();
    
    const members = [];
    
    // Skip header row and process members
    for (let i = 1; i < rows.length; i++) {
      if (rows[i][0]) { // Check if MemberID exists
        members.push({
          memberID: rows[i][0],
          fullName: rows[i][1],
          address: rows[i][2],
          contactNumber: rows[i][3],
          branch: rows[i][4],
          status: rows[i][5]
        });
      }
    }
    
    return {
      success: true,
      members: members
    };
  } catch (err) {
    return {
      success: false,
      message: "Error fetching members: " + err.toString()
    };
  }
}

/**
 * Read-only preview. Run this from the Apps Script editor first and inspect the
 * execution result/log before running migrateWithdrawalIdentityColumns().
 */
function previewWithdrawalIdentityMigration() {
  return runWithdrawalIdentityMigration(true);
}

/**
 * One-time historical identity migration. This function is intentionally not
 * routed through doPost and can only be run by an Apps Script project editor.
 */
function migrateWithdrawalIdentityColumns() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    return runWithdrawalIdentityMigration(false);
  } finally {
    lock.releaseLock();
  }
}

function runWithdrawalIdentityMigration(dryRun) {
  const spreadsheet = SpreadsheetApp.openById(SHEET_ID);
  const withdrawals = spreadsheet.getSheetByName("Withdrawals");
  if (!withdrawals) throw new Error("Withdrawals sheet was not found.");

  const lastRow = withdrawals.getLastRow();
  const result = {
    dryRun: Boolean(dryRun),
    rowsScanned: Math.max(lastRow - 1, 0),
    identitiesMigrated: 0,
    displayNamesUpdated: 0,
    unresolved: []
  };

  if (lastRow <= 1) {
    console.log(JSON.stringify(result));
    return result;
  }

  validateMigrationIdentityColumns(withdrawals);

  if (!dryRun) {
    const timestamp = Utilities.formatDate(
      new Date(),
      Session.getScriptTimeZone() || "GMT",
      "yyyyMMdd-HHmmss"
    );
    const backupName = "Withdrawals Backup " + timestamp + "-" + Utilities.getUuid().slice(0, 4);
    withdrawals.copyTo(spreadsheet).setName(backupName);
    result.backupSheet = backupName;
    ensureWithdrawalSchema(withdrawals);
  }

  const meta = getUsersSheetMeta();
  const indexes = getUserIndexes(meta);
  const usersByEmail = {};
  const usersByName = {};

  for (let i = 1; i < meta.rows.length; i++) {
    const email = normalizeEmail(meta.rows[i][indexes.email]);
    const fullname = safeText(meta.rows[i][indexes.fullname], 150);
    if (!email) continue;

    const user = { email: email, fullname: fullname };
    usersByEmail[email] = user;
    const nameKey = fullname.toLowerCase();
    if (nameKey) {
      if (!usersByName[nameKey]) usersByName[nameKey] = [];
      usersByName[nameKey].push(user);
    }
  }

  const identityColumns = [
    { label: "Teller", displayIndex: REQUEST_PROCESSED_BY_INDEX, emailIndex: REQUEST_OWNER_EMAIL_INDEX },
    { label: "Branch Manager", displayIndex: 8, emailIndex: REQUEST_CHECKED_BY_EMAIL_INDEX },
    { label: "Approver", displayIndex: 9, emailIndex: REQUEST_APPROVED_BY_EMAIL_INDEX }
  ];
  const width = REQUEST_APPROVED_BY_EMAIL_INDEX + 1;
  const rows = withdrawals.getRange(2, 1, lastRow - 1, width).getValues();
  const outputColumns = {};
  identityColumns.forEach(function (identity) {
    outputColumns[identity.displayIndex] = rows.map(function (row) { return [row[identity.displayIndex]]; });
    outputColumns[identity.emailIndex] = rows.map(function (row) { return [row[identity.emailIndex]]; });
  });

  rows.forEach(function (row, offset) {
    identityColumns.forEach(function (identity) {
      const displayValue = safeText(row[identity.displayIndex], 150);
      const storedEmail = normalizeEmail(row[identity.emailIndex]);
      if (!displayValue && !storedEmail) return;

      const displayAsEmail = normalizeEmail(displayValue);
      const displayLooksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(displayAsEmail);
      let resolvedUser = null;
      let resolvedEmail = storedEmail;

      if (storedEmail) {
        resolvedUser = usersByEmail[storedEmail] || null;
        if (displayLooksLikeEmail && displayAsEmail !== storedEmail) {
          result.unresolved.push([
            offset + 2, identity.label, displayValue, storedEmail,
            "Display email conflicts with stored identity email"
          ]);
          return;
        }
      } else if (displayLooksLikeEmail) {
        resolvedEmail = displayAsEmail;
        resolvedUser = usersByEmail[resolvedEmail] || null;
      } else {
        const candidates = usersByName[displayValue.toLowerCase()] || [];
        if (candidates.length === 1) {
          resolvedUser = candidates[0];
          resolvedEmail = resolvedUser.email;
        } else {
          result.unresolved.push([
            offset + 2, identity.label, displayValue, "",
            candidates.length > 1 ? "Full name matches multiple users" : "No matching user"
          ]);
          return;
        }
      }

      if (!storedEmail && resolvedEmail) {
        outputColumns[identity.emailIndex][offset][0] = resolvedEmail;
        result.identitiesMigrated++;
      }

      if ((!displayValue || displayLooksLikeEmail) && resolvedUser && resolvedUser.fullname) {
        outputColumns[identity.displayIndex][offset][0] = safeSheetText(resolvedUser.fullname, 150);
        result.displayNamesUpdated++;
      } else if (displayLooksLikeEmail && !resolvedUser) {
        result.unresolved.push([
          offset + 2, identity.label, displayValue, resolvedEmail,
          "Email is not present in Users; identity email retained but display name was not changed"
        ]);
      }
    });
  });

  if (!dryRun) {
    Object.keys(outputColumns).forEach(function (zeroBasedIndex) {
      withdrawals.getRange(2, Number(zeroBasedIndex) + 1, rows.length, 1)
        .setValues(outputColumns[zeroBasedIndex]);
    });
    result.reportSheet = writeIdentityMigrationReport(spreadsheet, result);
  }

  console.log(JSON.stringify(result));
  return result;
}

function validateMigrationIdentityColumns(sheet) {
  const columns = [
    { index: REQUEST_OWNER_EMAIL_INDEX, name: "ProcessedByEmail" },
    { index: REQUEST_CHECKED_BY_EMAIL_INDEX, name: "CheckedByEmail" },
    { index: REQUEST_APPROVED_BY_EMAIL_INDEX, name: "ApprovedByEmail" },
    { index: REQUEST_IDEMPOTENCY_KEY_INDEX, name: "SubmissionKey" }
  ];
  const lastRow = sheet.getLastRow();

  columns.forEach(function (column) {
    const header = safeText(sheet.getRange(1, column.index + 1).getValue(), 100);
    if (header && header.toLowerCase() !== column.name.toLowerCase()) {
      throw new Error("Column " + (column.index + 1) + " is already used by " + header + ".");
    }
    if (!header && lastRow > 1) {
      const range = sheet.getRange(2, column.index + 1, lastRow - 1, 1);
      const values = range.getValues();
      const formulas = range.getFormulas();
      if (values.some(function (row, index) {
        return safeText(row[0], 100) !== "" || safeText(formulas[index][0], 500) !== "";
      })) {
        throw new Error("Column " + (column.index + 1) + " contains data but has no expected identity header.");
      }
    }
  });
}

function writeIdentityMigrationReport(spreadsheet, result) {
  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || "GMT",
    "yyyyMMdd-HHmmss"
  );
  const name = "Identity Migration " + timestamp + "-" + Utilities.getUuid().slice(0, 4);
  const report = spreadsheet.insertSheet(name);
  const summaryRows = [
    ["Metric", "Value", "", "", ""],
    ["Rows scanned", result.rowsScanned, "", "", ""],
    ["Identity emails populated", result.identitiesMigrated, "", "", ""],
    ["Display names updated", result.displayNamesUpdated, "", "", ""],
    ["Unresolved identities", result.unresolved.length, "", "", ""],
    ["Backup sheet", result.backupSheet || "", "", "", ""],
    ["", "", "", "", ""],
    ["Withdrawal row", "Role", "Current display value", "Stored email", "Reason"]
  ];
  const safeUnresolvedRows = result.unresolved.map(function (row) {
    return row.map(function (value, index) {
      return index === 0 ? value : safeSheetText(value, 500);
    });
  });
  const reportRows = summaryRows.concat(safeUnresolvedRows);
  report.getRange(1, 1, reportRows.length, 5).setValues(reportRows);
  report.setFrozenRows(1);
  report.autoResizeColumns(1, 5);
  return name;
}
