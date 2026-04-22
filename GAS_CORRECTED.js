const SHEET_ID = "15A0drhU4vAa1HA0FNGO9fefiYvmzmpAQgnLRoja0978";

// 🔐 LOGIN - UNIFIED FUNCTION
function login(email, password) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Users");
  const rows = sheet.getDataRange().getValues();

  const normalizedEmail = String(email).trim().toLowerCase();
  const normalizedPassword = String(password).trim();

  for (let i = 1; i < rows.length; i++) {
    const sheetEmail = String(rows[i][0]).trim().toLowerCase();
    const sheetPassword = String(rows[i][1]).trim();

    if (sheetEmail === normalizedEmail && sheetPassword === normalizedPassword) {
      return {
        success: true,
        role: rows[i][2],
        user: sheetEmail,
        branchid: rows[i][5] || "",  // Column F (index 5) contains branchid
        fullname: rows[i][3] || "",
        position: rows[i][4] || ""
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
    else if (action === "forgotPassword") result = forgotPassword(data.email);
    else if (action === "createRequest") result = createRequest(data);
    else if (action === "getRequests") result = getRequests(data);
    else if (action === "updateStatus") result = updateStatus(data);
    else if (action === "getDashboardCounts") result = getDashboardCounts();
    else if (action === "getSettings") result = getSettings();
    else if (action === "saveSettings") result = saveSettings(data.settings);
    else if (action === "saveSignature") result = saveSignature(data);
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

function forgotPassword(email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  if (!normalizedEmail) {
    return { success: false, message: "Email is required." };
  }

  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Users");
  const rows = sheet.getDataRange().getValues();

  for (let i = 1; i < rows.length; i++) {
    const sheetEmail = String(rows[i][0] || "").trim().toLowerCase();
    const sheetPassword = String(rows[i][1] || "").trim();
    const fullname = String(rows[i][3] || "User").trim();

    if (sheetEmail === normalizedEmail) {
      GmailApp.sendEmail(
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
    data.dateStamp || new Date().toLocaleString(),  // DateStamp (column K = 10)
    data.contactNumber,  // ContactNumber (column L = 11)
    data.tellerBranchId || ""  // TellerBranchId (column M = 12)
  ]);

  return { success: true };
}

// 📥 GET REQUESTS
function getRequests(data) {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Withdrawals");
  const rows = sheet.getDataRange().getValues();

  return rows;
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
        sheet.getRange(i + 1, 10).setValue(data.financeManagerName || data.financeManagerEmail); // ApprovedBy (column 10)
      }

      // Update DateStamp column (column K = 11)
      sheet.getRange(i + 1, 11).setValue(data.dateStamp || new Date().toLocaleString());

      break;
    }
  }

  return { success: true };
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
