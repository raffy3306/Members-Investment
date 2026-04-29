const SHEET_ID = "15A0drhU4vAa1HA0FNGO9fefiYvmzmpAQgnLRoja0978";

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
  const normalizedPassword = String(password).trim();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const sheetEmail = String(row[indexes.email] || "").trim().toLowerCase();
    const sheetPassword = String(row[indexes.password] || "").trim();

    if (sheetEmail === normalizedEmail && sheetPassword === normalizedPassword) {
      return {
        success: true,
        role: row[indexes.role],
        user: sheetEmail,
        branchid: row[indexes.branchid] || "",
        fullname: row[indexes.fullname] || "",
        position: row[indexes.position] || "",
        mustChangePassword: isFirstLoginUser(row, indexes)
      };
    }
  }

  return { success: false };
}

function doGet(e) {
  const action = e.parameter.action;
  let result = {};

  if (action === "login") {
    result = login(e.parameter.email, e.parameter.password);
  }

  return ContentService
    .createTextOutput(JSON.stringify(result))
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
    else if (action === "createRequest") result = createRequest(data);
    else if (action === "editRequest") result = editRequest(data);
    else if (action === "getRequests") result = getRequests(data);
    else if (action === "updateStatus") result = updateStatus(data);
    else if (action === "getDashboardCounts") result = getDashboardCounts();
    else if (action === "getSettings") result = getSettings();
    else if (action === "saveSettings") result = saveSettings(data.settings);
    else if (action === "saveSignature") result = saveSignature(data);
    else if (action === "getUsers") result = getUsers();
    else if (action === "createUser") result = createUser(data);
    else if (action === "updateUser") result = updateUser(data);
    else if (action === "getMembers") result = getMembers();
    else result = { success: false, message: "Unknown action: " + String(action) };

    return ContentService
      .createTextOutput(JSON.stringify(result))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ success: false, message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function changePassword(data) {
  const email = String(data.email || "").trim().toLowerCase();
  const currentPassword = String(data.currentPassword || "").trim();
  const newPassword = String(data.newPassword || "").trim();

  if (!email || !currentPassword || !newPassword) {
    return { success: false, message: "Email, current password, and new password are required." };
  }

  if (newPassword.length < 8) {
    return { success: false, message: "New password must be at least 8 characters long." };
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
      if (sheetPassword !== currentPassword) {
        return { success: false, message: "Current password is incorrect." };
      }

      meta.sheet.getRange(i + 1, indexes.password + 1).setValue(newPassword);

      if (indexes.firstLogin >= 0) {
        meta.sheet.getRange(i + 1, indexes.firstLogin + 1).setValue(false);
      }

      if (indexes.mustChangePassword >= 0) {
        meta.sheet.getRange(i + 1, indexes.mustChangePassword + 1).setValue(false);
      }

      return { success: true, message: "Password updated successfully." };
    }
  }

  return { success: false, message: "User account not found." };
}

function forgotPassword(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return { success: false, message: "Email is required." };
  }

  const meta = getUsersSheetMeta();
  const rows = meta.rows;
  const indexes = {
    email: getHeaderIndex(meta.headerLookup, ["email", "user", "username"], 0),
    password: getHeaderIndex(meta.headerLookup, ["password"], 1),
    fullname: getHeaderIndex(meta.headerLookup, ["fullname", "full name", "name"], 3)
  };

  for (let i = 1; i < rows.length; i++) {
    const sheetEmail = String(rows[i][indexes.email] || "").trim().toLowerCase();
    const sheetPassword = String(rows[i][indexes.password] || "").trim();
    const fullname = String(rows[i][indexes.fullname] || "User").trim();

    if (sheetEmail === normalizedEmail) {
      MailApp.sendEmail(
        normalizedEmail,
        "Investment Withdrawal System Password Recovery",
        "Hello " + fullname + ",\n\n" +
        "You requested help signing in to the Investment Withdrawal System.\n\n" +
        "Your current password is: " + sheetPassword + "\n\n" +
        "Please sign in and change it with your administrator if needed.\n\n" +
        "If you did not request this email, please ignore it."
      );

      return { success: true };
    }
  }

  return { success: false, message: "No account was found for that email address." };
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
    const password = String(data.password || "").trim();
    const role = String(data.role || "").trim();
    const fullname = String(data.fullname || "").trim();
    const position = String(data.position || "").trim();
    const branchid = String(data.branchid || "").trim();
    const firstLogin = typeof data.firstLogin === "boolean" ? data.firstLogin : true;

    if (!email || !password || !role || !fullname || !position) {
      return { success: false, message: "Email, password, role, fullname, and position are required." };
    }

    for (let i = 1; i < meta.rows.length; i++) {
      const existingEmail = String(meta.rows[i][indexes.email] || "").trim().toLowerCase();
      if (existingEmail === email) {
        return { success: false, message: "A user with this email already exists." };
      }
    }

    const rowLength = Math.max(meta.headers.length, indexes.mustChangePassword + 1, indexes.firstLogin + 1, indexes.branchid + 1, 6);
    const newRow = new Array(rowLength).fill("");

    newRow[indexes.email] = email;
    newRow[indexes.password] = password;
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
    const password = String(data.password || "").trim();
    const role = String(data.role || "").trim();
    const fullname = String(data.fullname || "").trim();
    const position = String(data.position || "").trim();
    const branchid = String(data.branchid || "").trim();
    const firstLogin = typeof data.firstLogin === "boolean" ? data.firstLogin : true;

    if (!originalEmail || !email || !role || !fullname || !position) {
      return { success: false, message: "Original email, email, role, fullname, and position are required." };
    }

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
      meta.sheet.getRange(rowNumber, indexes.password + 1).setValue(password);
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

function createRequest(data) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Withdrawals");

  const balance = data.totalInvestment - data.amount;

  if (balance < 3000) {
    return {
      success: false,
      message: "Remaining balance cannot go below ₱3,000"
    };
  }

  sheet.appendRow([
    generateID(),        // WithdrawalID
    data.memberName,     // MemberName
    data.totalInvestment,// TotalInvestment
    data.amount,         // AmountWithdrawn
    balance,             // Balance
    data.purpose,        // Purpose
    "Pending",         // Status
    data.tellerName || data.tellerEmail,   // ProcessedBy (fullname, fallback to email)
    "",                 // CheckedBy
    "",                 // ApprovedBy
    data.dateStamp || data.date || new Date().toLocaleString(),  // DateStamp in column K
    data.contactNumber,  // ContactNumber (column L = 11)
    data.tellerBranchId || "",  // TellerBranchId (column M = 12)
    ""  // Notes (column N = 13)
  ]);

  return { success: true };
}

const REQUEST_DATESTAMP_INDEX = 10;

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
function getRequests(data) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Withdrawals");
  const rows = sheet.getDataRange().getValues();

  return sortRequestsByDatestamp(rows);
}

// 🔄 UPDATE STATUS
function updateStatus(data) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Withdrawals");
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.request_id) {

      sheet.getRange(i + 1, 7).setValue(data.status); // Status (column 7)

      if (data.role === "branch_manager") {
        sheet.getRange(i + 1, 9).setValue(data.branchManagerName || data.branchManagerEmail); // CheckedBy (column 9) - fullname, fallback to email
      }

      if (data.role === "finance_manager") {
        if (data.status === "Approved" || data.status === "Rejected") {
          sheet.getRange(i + 1, 10).setValue(data.financeManagerName || data.financeManagerEmail); // ApprovedBy (column 10)
        } else {
          sheet.getRange(i + 1, 10).setValue(""); // Clear ApprovedBy when sent back for further review
        }
      }

      // Update DateStamp column (column K = 11)
      sheet.getRange(i + 1, 11).setValue(data.dateStamp || new Date().toLocaleString());

      // Save branch manager notes in column N when provided.
      if (typeof data.notes !== "undefined") {
        sheet.getRange(i + 1, 14).setValue(data.notes || "");
      }

      break;
    }
  }

  return { success: true };
}

function editRequest(data) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Withdrawals");
  const rows = sheet.getDataRange().getValues();

  const totalInvestment = Number(data.totalInvestment);
  const amount = Number(data.amount);
  const balance = totalInvestment - amount;

  if (balance < 3000) {
    return {
      success: false,
      message: "Remaining balance cannot go below â‚±3,000"
    };
  }

  for (let i = 1; i < rows.length; i++) {
    if (rows[i][0] === data.request_id) {
      if (String(rows[i][6] || "").trim() !== "Returned") {
        return { success: false, message: "Only returned requests can be edited." };
      }

      sheet.getRange(i + 1, 2).setValue(data.memberName || ""); // MemberName
      sheet.getRange(i + 1, 3).setValue(totalInvestment); // TotalInvestment
      sheet.getRange(i + 1, 4).setValue(amount); // AmountWithdrawn
      sheet.getRange(i + 1, 5).setValue(balance); // Balance
      sheet.getRange(i + 1, 6).setValue(data.purpose || ""); // Purpose
      sheet.getRange(i + 1, 7).setValue("Pending"); // Status
      sheet.getRange(i + 1, 9).setValue(""); // CheckedBy
      sheet.getRange(i + 1, 10).setValue(""); // ApprovedBy
      sheet.getRange(i + 1, 11).setValue(data.dateStamp || data.date || new Date().toLocaleString()); // DateStamp
      sheet.getRange(i + 1, 12).setValue(data.contactNumber || ""); // ContactNumber
      sheet.getRange(i + 1, 14).setValue(""); // Notes

      return { success: true };
    }
  }

  return { success: false, message: "Request not found." };
}

// 🔢 Generate ID
function generateID() {
  return "REQ-" + new Date().getTime();
}

function getDashboardCounts() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Withdrawals");
  const rows = sheet.getDataRange().getValues();

  let awaiting = 0;
  let approved = 0;
  let rejected = 0;
  let review = 0;

  const currentMonth = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const headers = rows[0].map(h => String(h).trim());
  const dateStampIndex = headers.findIndex(h => h === "DateStamp");

  for (let i = 1; i < rows.length; i++) {
    const status = rows[i][6]; // Status column (index 6)
    const date = dateStampIndex >= 0 ? new Date(rows[i][dateStampIndex]) : new Date(rows[i][10]);

    if (status === "Pending" || status === "Forwarded") awaiting++;

    if (date.getMonth() === currentMonth && date.getFullYear() === currentYear) {
      if (status === "Approved") approved++;
      if (status === "Rejected") rejected++;
    }

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
  console.log("saveSettings called with:", settings);

  try {
    const sheet = getSettingsSheet();
    console.log("Settings sheet obtained");

    const existing = {};
    const rows = sheet.getDataRange().getValues();
    console.log("Current sheet data:", rows);

    for (let i = 1; i < rows.length; i++) {
      const key = String(rows[i][0]).trim();
      if (key) existing[key] = i + 1;
    }

    console.log("Existing keys:", existing);

    const values = Object.keys(settings).map(key => [key, settings[key] || ""]);

    values.forEach(row => {
      const key = row[0];
      const value = row[1];
      if (existing[key]) {
        console.log(`Updating existing key ${key} at row ${existing[key]}`);
        sheet.getRange(existing[key], 2).setValue(value);
      } else {
        console.log(`Adding new key ${key}`);
        sheet.appendRow(row);
      }
    });

    console.log("Settings saved successfully");
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

  const signatureDataUrl = `data:${data.mimeType};base64,${data.fileBase64}`;
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
