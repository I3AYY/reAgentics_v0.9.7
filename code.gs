// =========================================================================
// System: reAgentics - Laboratory Reagent Management System
// Version: 0.9.7 AI Core - Glassmorphism UI & VISITER Role Implemented
// Developer: I3AYY & AI Assistant (Medical Tech & CyberSec Expert)
// Update: Caching Layer, Batch setValues, Webhook Security, Least Privilege
// =========================================================================

// -------------------------------------------------------------------------
// 1. DATABASE CONFIGURATION (SaaS Architecture)
// -------------------------------------------------------------------------
const DEFAULT_DB = {
  MAIN: 'ใส่_ID_ไฟล์_reAgentics_DB_ที่นี่',        // Items, Stock_Balance
  UNIT: 'ใส่_ID_ไฟล์_reAgentics_Units_ที่นี่',      // Units, ReagUnits, Analyzers, storageLocation, Company, ReagTypes
  USER: 'ใส่_ID_ไฟล์_reAgentics_User_ที่นี่',       // User
  CONFIG: 'ใส่_ID_ไฟล์_reAgentics_Config_ที่นี่',  // Sticker_Config, App_Logo, Year_Config
  LOG: 'ใส่_ID_ไฟล์_reAgentics_Log_ที่นี่',        // System_Logs
  FOLDER_PROFILE: '', // Folder ID สำหรับโปรไฟล์
  FOLDER_LOGO: ''     // Folder ID สำหรับโลโก้
};

// Security: สร้าง Secret Key สำหรับตรวจสอบ Webhook ป้องกันการยิง Request ปลอม
const WEBHOOK_SECRET = "reAgentics_Secure_Token_2024"; 

function getDbConfig() {
  // Optimization: ใช้ CacheService ลดภาระการอ่าน PropertiesService ทุกครั้งที่รันโค้ด
  const cache = CacheService.getScriptCache();
  const cachedConfig = cache.get('DB_CONFIG_CACHE');
  if (cachedConfig) {
    return JSON.parse(cachedConfig);
  }

  const props = PropertiesService.getScriptProperties();
  const config = {
    MAIN: props.getProperty('DB_MAIN') || DEFAULT_DB.MAIN,
    UNIT: props.getProperty('DB_UNIT') || DEFAULT_DB.UNIT,
    USER: props.getProperty('DB_USER') || DEFAULT_DB.USER,
    CONFIG: props.getProperty('DB_CONFIG') || DEFAULT_DB.CONFIG,
    LOG: props.getProperty('DB_LOG') || DEFAULT_DB.LOG,
    FOLDER_PROFILE: props.getProperty('FOLDER_PROFILE') || DEFAULT_DB.FOLDER_PROFILE,
    FOLDER_LOGO: props.getProperty('FOLDER_LOGO') || DEFAULT_DB.FOLDER_LOGO
  };
  
  cache.put('DB_CONFIG_CACHE', JSON.stringify(config), 3600); // เก็บ Cache ไว้ 1 ชั่วโมง
  return config;
}

function clearDbConfigCache() {
  CacheService.getScriptCache().remove('DB_CONFIG_CACHE');
}

function checkDatabaseSetup() {
  const config = getDbConfig();
  if (!config.MAIN || config.MAIN.includes('ใส่_ID_ไฟล์') || !config.USER || config.USER.includes('ใส่_ID_ไฟล์')) {
    throw new Error("คุณยังไม่ได้ตั้งค่า Google Sheet ID ครับ กรุณานำ ID มาใส่ในหน้า 'ตั้งค่าฐานข้อมูล' ให้ครบถ้วน");
  }
}

function deleteOldDriveFile(oldUrl) {
  if (oldUrl && oldUrl.includes("drive.google.com")) {
    try {
      let fileId = "";
      const idMatch = oldUrl.match(/id=([^&]+)/);
      const dMatch = oldUrl.match(/\/d\/([a-zA-Z0-9_-]+)/);
      if (idMatch && idMatch[1]) fileId = idMatch[1];
      else if (dMatch && dMatch[1]) fileId = dMatch[1];
      if (fileId) DriveApp.getFileById(fileId).setTrashed(true);
    } catch (err) { console.warn("Delete old file warning: " + err.message); }
  }
}

// -------------------------------------------------------------------------
// 2. CORE WEB APP FUNCTIONS & TELEGRAM WEBHOOK HANDLER
// -------------------------------------------------------------------------
function doGet(e) {
  if (e.parameter.report) {
     return HtmlService.createHtmlOutput(`
       <div style="font-family: sans-serif; text-align: center; padding: 50px;">
         <h2>🚀 กำลังพัฒนาโมดูล Export PDF/Excel</h2>
         <p>ระบบได้รับคำสั่งสร้างรายงาน: <b>${e.parameter.report}</b></p>
         <p>กรุณากลับไปที่ Telegram หรือเข้าสู่ระบบ reAgentics เพื่อดูข้อมูล</p>
       </div>
     `).setTitle('reAgentics | Report Generator');
  }

  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('reAgentics | Lab Inventory System (v0.9.7 AI Core)')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doPost(e) {
  // Security Check: ตรวจสอบ Secret Parameter ป้องกันคนนอกยิง Webhook
  if (!e.parameter.secret || e.parameter.secret !== WEBHOOK_SECRET) {
      logSystem("Security Alert", "Unauthorized Webhook attempt blocked", "SYSTEM");
      return ContentService.createTextOutput("Unauthorized").setMimeType(ContentService.MimeType.TEXT);
  }

  if (e.postData && e.postData.contents) {
    try {
      const update = JSON.parse(e.postData.contents);
      if (update.callback_query) {
        const callbackQuery = update.callback_query;
        const data = callbackQuery.data; 
        const message = callbackQuery.message;
        
        const threadId = message.message_thread_id ? ":" + message.message_thread_id : "";
        const parts = data.split('_');
        
        if (parts.length >= 3) {
          const format = parts[0]; 
          const reportType = parts[1]; 
          const unitName = parts.slice(2).join('_');
          
          answerCallbackQuery(callbackQuery.id, "กำลังเตรียมข้อมูล...", unitName);
          
          let fullReportType = '';
          if (reportType === 'bal') fullReportType = 'balance';
          else if (reportType === 'low') fullReportType = 'lowstock';
          else if (reportType === 'exp') fullReportType = 'expiry';
          
          let specificChatId = String(message.chat.id) + threadId;
          generateAndSendTelegramReport(fullReportType, unitName, format, specificChatId);
        }
      }
    } catch (error) {
      console.error("Webhook Error: ", error);
    }
  }
  return ContentService.createTextOutput("OK");
}

function answerCallbackQuery(callbackQueryId, text, targetUnit = null) {
  try {
    const config = getDbConfig();
    const ss = SpreadsheetApp.openById(config.UNIT);
    const sheet = ss.getSheetByName('Units');
    const data = sheet.getDataRange().getValues();
    let token = '';
    
    for (let i = 1; i < data.length; i++) {
      if (targetUnit && String(data[i][1]).trim() === String(targetUnit).trim() && data[i][5]) { 
        token = String(data[i][5]).trim(); break; 
      } else if (!targetUnit && data[i][5]) {
        token = String(data[i][5]).trim(); break;
      }
    }
    
    if (token) {
      const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
      const payload = { callback_query_id: callbackQueryId, text: text, show_alert: false };
      UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
    }
  } catch(e) {}
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function safeString(val) {
  if (val instanceof Date) return Utilities.formatDate(val, Session.getScriptTimeZone(), "yyyy-MM-dd");
  if (val === null || val === undefined) return "";
  let str = String(val).trim();
  if (str.startsWith("'")) return str.substring(1);
  return str;
}

// -------------------------------------------------------------------------
// 3. SYSTEM LOGGING & TELEGRAM (MINI APP & SMART ALERTS)
// -------------------------------------------------------------------------
function logSystem(action, detail, userId) {
  try {
    checkDatabaseSetup(); 
    const config = getDbConfig();
    if (config.LOG && !config.LOG.includes('ใส่_ID_ไฟล์')) {
      const logSS = SpreadsheetApp.openById(config.LOG);
      let sheet = logSS.getSheetByName('System_Logs');
      if (!sheet) {
        sheet = logSS.insertSheet('System_Logs');
        sheet.appendRow(['Timestamp', 'UserID', 'Action', 'Detail']);
        sheet.getRange("A1:D1").setFontWeight("bold").setBackground("#e2e8f0");
        sheet.setFrozenRows(1);
      }
      let timeStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
      sheet.appendRow([timeStr, userId, action, detail]);
    }
  } catch(e) { console.error("Log Sys Error: " + e); }
}

function sendTelegramNotification(unitName, messageText, replyMarkup = null, documentBlob = null, documentName = "", specificChatId = null) {
  try {
    const config = getDbConfig();
    if (!config.UNIT || config.UNIT.includes('ใส่_ID_ไฟล์')) return;
    const ss = SpreadsheetApp.openById(config.UNIT);
    const sheet = ss.getSheetByName('Units');
    if (!sheet) return;
    const data = sheet.getDataRange().getValues();
    let token = '', rawChatId = '';
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]).trim() === String(unitName).trim()) {
        token = String(data[i][5]).trim(); 
        rawChatId = String(data[i][6]).trim(); 
        break;
      }
    }

    if (token && rawChatId) {
      let finalChatId = specificChatId || rawChatId;
      let topicId = null;

      if (String(finalChatId).includes(":")) {
        let parts = String(finalChatId).split(":");
        finalChatId = parts[0];
        topicId = parseInt(parts[1], 10);
      }

      if (documentBlob) {
        const url = `https://api.telegram.org/bot${token}/sendDocument`;
        const payload = { chat_id: finalChatId, caption: messageText, parse_mode: 'HTML', document: documentBlob };
        if (topicId) payload.message_thread_id = topicId;
        if (replyMarkup) payload.reply_markup = JSON.stringify(replyMarkup);
        UrlFetchApp.fetch(url, { method: 'post', payload: payload, muteHttpExceptions: true });
      } else {
        const url = `https://api.telegram.org/bot${token}/sendMessage`;
        const payload = { chat_id: finalChatId, text: messageText, parse_mode: 'HTML', disable_web_page_preview: false };
        if (topicId) payload.message_thread_id = topicId;
        if (replyMarkup) payload.reply_markup = replyMarkup;
        UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), muteHttpExceptions: true });
      }
    }
  } catch(e) { console.error("Telegram Error: ", e); }
}

function apiSetupTelegramWebhooks(userId) {
  try {
    const config = getDbConfig();
    const webAppUrl = ScriptApp.getService().getUrl(); 
    // แนบ Secret ไปด้วยเพื่อความปลอดภัย
    const secureUrl = `${webAppUrl}?secret=${WEBHOOK_SECRET}`;
    
    if(!config.UNIT || config.UNIT.includes('ใส่_ID_ไฟล์')) throw new Error("ไม่พบฐานข้อมูลหน่วยงาน");
    const ss = SpreadsheetApp.openById(config.UNIT);
    const sheet = ss.getSheetByName('Units');
    const data = sheet.getDataRange().getValues();
    
    let successCount = 0;
    let botTokens = new Set();
    
    for (let i = 1; i < data.length; i++) {
      let token = String(data[i][5]).trim();
      if (token && !botTokens.has(token)) {
        botTokens.add(token);
        let url = `https://api.telegram.org/bot${token}/setWebhook?url=${encodeURIComponent(secureUrl)}`;
        let res = UrlFetchApp.fetch(url, {muteHttpExceptions: true});
        let result = JSON.parse(res.getContentText());
        if (result.ok) successCount++;
      }
    }
    
    logSystem("Setup Webhooks", `Admin synced ${successCount} Telegram Webhooks`, userId);
    return { success: true, message: `ซิงค์ Webhook สำเร็จจำนวน ${successCount} บอท` };
  } catch(e) { return { success: false, message: e.message }; }
}

// -------------------------------------------------------------------------
// 3.1 TELEGRAM PDF/CSV REPORT GENERATOR
// -------------------------------------------------------------------------
function generateAndSendTelegramReport(reportType, unitName, format = 'rep', specificChatId = null) {
  try {
    const dataObj = getItemsData(null, null); 
    if (!dataObj.success) return;
    const allData = dataObj.data;
    
    let unitData = allData.filter(item => String(item.unitID).trim() === String(unitName).trim());
    if (unitData.length === 0) return;

    let title = "";
    let filteredData = [];
    let summaryText = "";

    const todayStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm");

    if (reportType === 'balance') {
      title = `รายงานน้ำยาคงเหลือ_${unitName}`;
      filteredData = unitData.filter(item => item.balance > 0 || item.minLevel > 0);
      summaryText = `📦 <b>สรุปรายงานน้ำยาคงเหลือ</b>\nหน่วยงาน: ${unitName}\nอัปเดต: ${todayStr}\nพบรายการที่ใช้งานอยู่: ${filteredData.length} รายการ`;
    } 
    else if (reportType === 'lowstock') {
      title = `รายงานน้ำยาต่ำกว่าเกณฑ์_${unitName}`;
      filteredData = unitData.filter(item => item.balance < item.minLevel && item.status === 'Active');
      summaryText = `📊 <b>สรุปรายงานน้ำยาต่ำกว่าเกณฑ์</b>\nหน่วยงาน: ${unitName}\nอัปเดต: ${todayStr}\n⚠️ พบรายการที่ต้องสั่งซื้อด่วน: ${filteredData.length} รายการ`;
    } 
    else if (reportType === 'expiry') {
      title = `รายงานน้ำยาใกล้หมดอายุ_${unitName}`;
      filteredData = unitData.filter(item => item.expStatus === 'Expiring' || item.expStatus === 'Expired');
      summaryText = `⏳ <b>สรุปรายงานน้ำยาใกล้/หมดอายุ</b>\nหน่วยงาน: ${unitName}\nอัปเดต: ${todayStr}\n🚨 พบรายการเฝ้าระวัง: ${filteredData.length} รายการ`;
    }

    if (filteredData.length === 0) {
      sendTelegramNotification(unitName, `${summaryText}\n\n✅ <i>ไม่พบข้อมูลที่เข้าเงื่อนไขในรายงานนี้ ถือว่าระบบปกติครับ</i>`, null, null, "", specificChatId);
      return;
    }

    if (format === 'csv') {
      let csvContent = "\uFEFF"; 
      csvContent += "รหัสน้ำยา,ชื่อน้ำยา,คงเหลือ,หน่วย,เกณฑ์ต่ำสุด,สถานะหมดอายุ\n";
      
      filteredData.forEach(item => {
        let safeName = String(item.itemName).replace(/,/g, " "); 
        csvContent += `${item.itemID},${safeName},${item.balance},${item.unit},${item.minLevel},${item.expStatus}\n`;
      });

      const blob = Utilities.newBlob(csvContent, 'text/csv', `${title}.csv`);
      sendTelegramNotification(unitName, summaryText + "\n(ดูรายละเอียดในไฟล์แนบ)", null, blob, `${title}.csv`, specificChatId);
    } 
    else {
      let msgDetails = summaryText + "\n───────────────\n";
      filteredData.forEach(item => {
        msgDetails += `• <b>${item.itemName}</b>\n  เหลือ: ${item.balance} ${item.unit} | สถานะ: ${item.expStatus === 'Active' ? 'ปกติ' : item.expStatus}\n`;
      });
      if (msgDetails.length > 4000) {
        msgDetails = msgDetails.substring(0, 3900) + "\n\n... (ข้อมูลยาวเกินไป กรุณากดขอรายงานแบบ CSV แทนครับ)";
      }
      sendTelegramNotification(unitName, msgDetails, null, null, "", specificChatId);
    }

  } catch (error) {
    console.error("Generate Telegram Report Error: ", error);
  }
}

// -------------------------------------------------------------------------
// 4. AUTHENTICATION & SECURITY
// -------------------------------------------------------------------------
function verifyLogin(userId, password) {
  try {
    checkDatabaseSetup(); 
    const config = getDbConfig();
    const ss = SpreadsheetApp.openById(config.USER);
    const sheet = ss.getSheetByName("User");
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === String(userId) && String(data[i][2]) === String(password)) {
        let status = String(data[i][8] || "ปกติ").trim();
        if (status === "ระงับการใช้งาน") {
          logSystem("Login Blocked", "Suspended user tried to login", userId);
          return { success: false, message: `บัญชีผู้ใช้ ${userId} ถูกระงับ โปรดติดต่อผู้ดูแลระบบ` };
        }

        let email = data[i][3];
        let name = data[i][0];
        let otpStatus = String(data[i][9] || "ON").trim().toUpperCase();
        
        if (!email && otpStatus === "ON") {
          logSystem("Login Failed", "Account missing email", userId);
          return { success: false, message: "บัญชีนี้ยังไม่ได้ตั้งค่า Email กรุณาติดต่อ Admin" };
        }

        if (otpStatus === "OFF") {
          let userProfile = getUserProfileById(userId);
          if (userProfile) {
            logSystem("Login Success", "User authenticated (OTP Bypassed)", userId);
            let availableYears = getAvailableYears();
            return { success: true, bypassed: true, message: "เข้าสู่ระบบสำเร็จ (OTP Bypassed)", user: userProfile, years: availableYears };
          } else { return { success: false, message: "ไม่พบข้อมูลโปรไฟล์ผู้ใช้งาน" }; }
        }

        let cache = CacheService.getScriptCache();
        let existingOtp = cache.get("OTP_" + userId);
        
        if (existingOtp) {
          logSystem("Login Info", "User logged in with active OTP session", userId);
          return { success: true, message: "ระบบได้ส่ง OTP ไปก่อนหน้านี้แล้ว กรุณาใช้รหัสเดิม (อายุรหัส 5 นาที)", email: email, userId: userId, otpExists: true };
        } else {
          let otpResult = generateAndSendOTP(userId, email, name);
          if (otpResult.success) {
            logSystem("OTP Requested", "New OTP sent to email", userId);
            return { success: true, message: "กรุณาตรวจสอบ OTP ที่อีเมลของคุณ", email: email, userId: userId };
          } else {
            logSystem("OTP Error", otpResult.error, userId);
            return { success: false, message: "ไม่สามารถส่งอีเมล OTP ได้: " + otpResult.error };
          }
        }
      }
    }
    logSystem("Login Failed", "Invalid credentials", userId);
    return { success: false, message: "UserID หรือ Password ไม่ถูกต้อง!" };
  } catch (error) { return { success: false, message: "ระบบฐานข้อมูลขัดข้อง: " + error.message }; }
}

function apiRequestNewOTP(userId) {
  try {
    const config = getDbConfig(); 
    const ss = SpreadsheetApp.openById(config.USER); 
    const sheet = ss.getSheetByName("User");
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === String(userId)) {
        let email = data[i][3]; 
        let name = data[i][0];
        if (!email) return { success: false, message: "บัญชีนี้ยังไม่ได้ตั้งค่า Email" };
        
        CacheService.getScriptCache().remove("OTP_" + userId);
        let otpResult = generateAndSendOTP(userId, email, name);
        if (otpResult.success) return { success: true, message: "ส่ง OTP รหัสใหม่เรียบร้อยแล้ว" };
        else return { success: false, message: "เกิดข้อผิดพลาด: " + otpResult.error };
      }
    }
    return { success: false, message: "ไม่พบข้อมูลผู้ใช้งาน" };
  } catch (e) { return { success: false, message: e.message }; }
}

function generateAndSendOTP(userId, email, name) {
  try {
    let otp = Math.floor(100000 + Math.random() * 900000).toString(); 
    CacheService.getScriptCache().put("OTP_" + userId, otp, 300);
    
    let logoUrl = "https://cdn-icons-png.flaticon.com/512/3003/3003251.png"; 
    try {
      const config = getDbConfig();
      if(config.CONFIG && !config.CONFIG.includes('ใส่_ID_ไฟล์')) {
        const configSS = SpreadsheetApp.openById(config.CONFIG);
        const logoSheet = configSS.getSheetByName('App_Logo');
        if (logoSheet && logoSheet.getLastRow() > 1) { logoUrl = logoSheet.getRange(2, 2).getValue() || logoUrl; }
      }
    } catch(e) {}

    const htmlTemplate = `
        <div style="font-family: -apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; color: #1e293b; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; margin-bottom: 24px;">
                <img src="${logoUrl}" alt="reAgentics Logo" style="width: 56px; height: 56px; border-radius: 12px; object-fit: contain; vertical-align: middle;">
                <span style="font-size: 28px; font-weight: 700; color: #0ea5e9; vertical-align: middle; margin-left: 12px; letter-spacing: -0.5px; display: inline-block;">reAgentics</span>
            </div>
            <h2 style="font-size: 22px; font-weight: 500; text-align: center; margin-bottom: 24px; color: #334155;">กรุณายืนยันตัวตนของคุณ, <strong>${name}</strong></h2>
            <div style="background-color: #ffffff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);">
                <p style="margin-top: 0; margin-bottom: 16px; font-size: 15px; text-align: center;">นี่คือรหัส OTP สำหรับเข้าสู่ระบบบริหารจัดการน้ำยา:</p>
                <div style="text-align: center; font-size: 36px; font-family: ui-monospace, SFMono-Regular, Consolas, monospace; font-weight: 700; letter-spacing: 10px; color: #0f172a; margin: 28px 0; background-color: #f8fafc; padding: 16px; border-radius: 8px;">${otp}</div>
                <p style="font-size: 14px; margin-bottom: 16px; text-align: center; color: #475569;">รหัสนี้มีอายุการใช้งาน <strong>5 นาที</strong> และใช้ได้เพียงครั้งเดียว</p>
                <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 24px 0;">
                <p style="font-size: 13px; margin-bottom: 12px; color: #64748b;"><strong style="color: #ef4444;">ข้อควรระวัง (PDPA):</strong> โปรดอย่าแชร์รหัสนี้กับบุคคลอื่น ทีมงาน reAgentics จะไม่ขอรหัสผ่านหรือ OTP ของคุณผ่านช่องทางใดๆ โดยเด็ดขาด</p>
            </div>
        </div>
    `;

    MailApp.sendEmail({ to: email, subject: "รหัส OTP สำหรับเข้าสู่ระบบ reAgentics", htmlBody: htmlTemplate, name: "reAgentics LIS" });
    return { success: true };
  } catch (error) { return { success: false, error: error.message }; }
}

function verifyOTP(userId, inputOtp) {
  try {
    checkDatabaseSetup();
    let cache = CacheService.getScriptCache();
    let cachedOtp = cache.get("OTP_" + userId);
    
    if (!cachedOtp) {
      logSystem("Login Failed", "Expired or missing OTP", userId);
      return { success: false, message: "OTP หมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่" };
    }
    
    if (cachedOtp === inputOtp.toString()) {
      cache.remove("OTP_" + userId);
      let userProfile = getUserProfileById(userId);
      if(userProfile) {
        logSystem("Login Success", "User successfully authenticated", userId);
        let availableYears = getAvailableYears();
        return { success: true, message: "เข้าสู่ระบบสำเร็จ", user: userProfile, years: availableYears };
      } else { return { success: false, message: "ไม่พบข้อมูลโปรไฟล์ผู้ใช้งาน" }; }
    } else {
      logSystem("Login Failed", "Invalid OTP entered", userId);
      return { success: false, message: "รหัส OTP ไม่ถูกต้อง" };
    }
  } catch (e) { return { success: false, message: "Verify Error: " + e.message }; }
}

function verifyPasswordOnly(userId, password) {
  try {
    checkDatabaseSetup();
    const config = getDbConfig();
    const ss = SpreadsheetApp.openById(config.USER);
    const sheet = ss.getSheetByName('User');
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][1]) === String(userId) && String(data[i][2]) === String(password)) {
        let status = String(data[i][8] || "ปกติ").trim();
        if (status === "ระงับการใช้งาน") {
          logSystem("Unlock Blocked", "Suspended user tried to unlock screen", userId);
          return { success: false, message: `บัญชีผู้ใช้ ${userId} ถูกระงับ โปรดติดต่อผู้ดูแลระบบ` };
        }
        logSystem("Unlock Screen", "Successfully unlocked screen", userId);
        return { success: true };
      }
    }
    logSystem("Unlock Failed", "Invalid password during screen unlock", userId);
    return { success: false, message: 'รหัสผ่านไม่ถูกต้อง' };
  } catch (e) { return { success: false, message: 'System Error: ' + e.message }; }
}

function getUserProfileById(userId) {
  const config = getDbConfig(); 
  const ss = SpreadsheetApp.openById(config.USER); 
  const sheet = ss.getSheetByName("User");
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][1]) === String(userId)) { 
      let profile = { name: data[i][0], userId: data[i][1], group: data[i][4], role: data[i][5], unitIdRaw: data[i][6], image: data[i][7] || "", allowedUnits: [] };
      try {
        if(config.UNIT && !config.UNIT.includes('ใส่_ID_ไฟล์')) {
          const unitData = SpreadsheetApp.openById(config.UNIT).getSheetByName("Units").getDataRange().getValues();
          const isAdmin = String(profile.role).toUpperCase() === 'ADMIN';
          for (let r = 1; r < unitData.length; r++) {
            if (isAdmin || String(unitData[r][0]).trim() === String(profile.group).trim()) { 
               if (String(unitData[r][1]).trim() && !profile.allowedUnits.includes(String(unitData[r][1]).trim())) {
                 profile.allowedUnits.push(String(unitData[r][1]).trim());
               }
            }
          }
        }
      } catch (e) { 
        if (profile.unitIdRaw) profile.allowedUnits = String(profile.unitIdRaw).split(',').map(s => s.trim()); 
      }
      return profile;
    }
  }
  return null;
}

function getAvailableYears() {
  try {
    const config = getDbConfig(); 
    if(!config.CONFIG || config.CONFIG.includes('ใส่_ID_ไฟล์')) return [];
    
    const sheet = SpreadsheetApp.openById(config.CONFIG).getSheetByName('Year_Config');
    if (!sheet) return [];
    
    const data = sheet.getDataRange().getValues(); 
    let years = [];
    for (let i = 1; i < data.length; i++) { 
      if(data[i][0] && (data[i][2] === 'Connected' || !data[i][2])) {
        years.push(String(data[i][0])); 
      }
    }
    return years.length > 0 ? years : [];
  } catch (e) { return []; }
}

// -------------------------------------------------------------------------
// 4.5 USER MANAGEMENT API (ADMIN SYSTEM)
// -------------------------------------------------------------------------
function apiGetUsersList() {
  try {
    const config = getDbConfig(); 
    const sheet = SpreadsheetApp.openById(config.USER).getSheetByName("User");
    const data = sheet.getDataRange().getValues();
    let usersList = [];
    
    for (let i = 1; i < data.length; i++) {
      if (data[i][1]) {
        usersList.push({ 
          originalUserId: data[i][1], 
          name: data[i][0], 
          userId: data[i][1], 
          email: data[i][3], 
          group: data[i][4], 
          role: data[i][5], 
          unitIdRaw: data[i][6] || '', 
          status: data[i][8] || 'ปกติ', 
          otpStatus: data[i][9] || 'ON' 
        });
      }
    }
    return { success: true, data: usersList };
  } catch (e) { return { success: false, message: e.message }; }
}

function apiSaveUserAdmin(payload, actionByUserId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); 
    const config = getDbConfig(); 
    const sheet = SpreadsheetApp.openById(config.USER).getSheetByName("User");
    const data = sheet.getDataRange().getValues(); 
    let rowIdx = -1;
    
    for (let i = 1; i < data.length; i++) { 
      if (String(data[i][1]) === String(payload.originalUserId)) { 
        rowIdx = i + 1; 
        break; 
      } 
    }
    
    if (rowIdx === -1) throw new Error("ไม่พบข้อมูลผู้ใช้");
    
    let role = String(payload.role).trim().toUpperCase(); 
    let unitIdRaw = String(payload.unitIdRaw).trim();
    // Update: รองรับ Role VISITER อย่างถูกต้อง (ให้อยู่ระดับใกล้เคียงกับ USER เพื่อป้องกันการเข้าถึงทุกแผนกแบบ Admin)
    if (role === 'ADMIN') unitIdRaw = 'ALL'; else if (role === 'USER' || role === 'VISITER') unitIdRaw = '';
    
    // Performance: Use setValues instead of multiple setValues
    sheet.getRange(rowIdx, 1, 1, 10).setValues([[
      payload.name, 
      payload.userId, 
      data[rowIdx-1][2], 
      payload.email, 
      payload.group, 
      role, 
      unitIdRaw, 
      data[rowIdx-1][7], 
      payload.status, 
      payload.otpStatus || 'ON'
    ]]);
    
    SpreadsheetApp.flush(); 
    logSystem("Admin Action", `Updated user: ${payload.userId}`, actionByUserId);
    return { success: true, message: "บันทึกเรียบร้อย" };
  } catch (e) { return { success: false, message: e.message }; } finally { lock.releaseLock(); }
}

// -------------------------------------------------------------------------
// 5. DATABASE CONFIG MANAGER
// -------------------------------------------------------------------------
function apiGetDbConfig() {
  try {
    const config = getDbConfig(); 
    let years = []; 
    let unitFolders = []; 
    let deliveryNoteFolders = []; 
    let telegramConfigs = [];
    
    try {
      if(config.CONFIG && !config.CONFIG.includes('ใส่_ID_ไฟล์')) {
        let sheet = SpreadsheetApp.openById(config.CONFIG).getSheetByName('Year_Config');
        if (sheet) {
          let yData = sheet.getDataRange().getValues();
          for (let i = 1; i < yData.length; i++) {
            if(yData[i][0]) {
              years.push({ year: String(yData[i][0]), fileId: String(yData[i][1]), status: yData[i][2] || 'Connected' });
            }
          }
        }
      }
    } catch(e) { console.error("Error loading year config:", e); }
    
    try {
      if(config.UNIT && !config.UNIT.includes('ใส่_ID_ไฟล์')) {
         let unitSheet = SpreadsheetApp.openById(config.UNIT).getSheetByName('Units');
         if (unitSheet) {
           let uData = unitSheet.getDataRange().getValues();
           for(let i = 1; i < uData.length; i++) {
               if(uData[i][1]) { 
                   let uName = String(uData[i][1]).trim();
                   unitFolders.push({ name: uName, folderId: String(uData[i][3] || '').trim() });
                   deliveryNoteFolders.push({ name: uName, folderId: String(uData[i][4] || '').trim() });
                   telegramConfigs.push({ name: uName, botToken: String(uData[i][5] || '').trim(), chatId: String(uData[i][6] || '').trim() });
               }
           }
         }
      }
    } catch(e) { console.error("Error loading unit config:", e); }
    
    return { 
      success: true, 
      config: { 
        mainId: config.MAIN, 
        unitId: config.UNIT, 
        userId: config.USER, 
        configId: config.CONFIG, 
        logId: config.LOG, 
        folderProfile: config.FOLDER_PROFILE, 
        folderLogo: config.FOLDER_LOGO, 
        years: years, 
        unitFolders: unitFolders, 
        deliveryNoteFolders: deliveryNoteFolders, 
        telegramConfigs: telegramConfigs 
      } 
    };
  } catch (e) { return { success: false, message: e.message }; }
}

function apiSaveCoreDbConfig(payload, userId) {
  try {
    const props = PropertiesService.getScriptProperties();
    if (payload.mainId !== undefined) props.setProperty('DB_MAIN', payload.mainId.trim());
    if (payload.unitId !== undefined) props.setProperty('DB_UNIT', payload.unitId.trim());
    if (payload.userId !== undefined) props.setProperty('DB_USER', payload.userId.trim());
    if (payload.configId !== undefined) props.setProperty('DB_CONFIG', payload.configId.trim());
    if (payload.logId !== undefined) props.setProperty('DB_LOG', payload.logId.trim());
    if (payload.folderProfile !== undefined) props.setProperty('FOLDER_PROFILE', payload.folderProfile.trim());
    if (payload.folderLogo !== undefined) props.setProperty('FOLDER_LOGO', payload.folderLogo.trim());

    // ล้าง Cache ทันทีเพื่อให้ค่าใหม่ถูกนำไปใช้
    clearDbConfigCache();
    const config = getDbConfig();

    if(config.UNIT && !config.UNIT.includes('ใส่_ID_ไฟล์')) {
        const unitSS = SpreadsheetApp.openById(config.UNIT);
        let unitSheet = unitSS.getSheetByName('Units');
        if(unitSheet) {
            const data = unitSheet.getDataRange().getValues();
            for(let i = 1; i < data.length; i++) {
                let uName = String(data[i][1]).trim();
                
                if (payload.unitFolders && payload.unitFolders.length > 0) {
                    let matchImage = payload.unitFolders.find(u => u.name === uName);
                    if(matchImage) unitSheet.getRange(i + 1, 4).setValue(matchImage.folderId); 
                }
                
                if (payload.deliveryNoteFolders && payload.deliveryNoteFolders.length > 0) {
                    let matchPDF = payload.deliveryNoteFolders.find(u => u.name === uName);
                    if(matchPDF) unitSheet.getRange(i + 1, 5).setValue(matchPDF.folderId); 
                }
                
                if (payload.telegramConfigs && payload.telegramConfigs.length > 0) {
                    let matchTel = payload.telegramConfigs.find(u => u.name === uName);
                    if(matchTel) {
                        unitSheet.getRange(i + 1, 6).setValue(matchTel.botToken); 
                        unitSheet.getRange(i + 1, 7).setValue(matchTel.chatId); 
                    }
                }
            }
        }
    }

    logSystem("Update DB Config", "Admin updated core database & folder configurations", userId);
    return { success: true };
  } catch (e) { return { success: false, message: e.message }; }
}

function apiCreateYearSheet(year, userId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); checkDatabaseSetup();
    const config = getDbConfig();
    if(!config.CONFIG || config.CONFIG.includes('ใส่_ID_ไฟล์')) throw new Error("กรุณาระบุ Sheet ID สำหรับไฟล์ Config ก่อนสร้างปีงบประมาณ");
    const configSS = SpreadsheetApp.openById(config.CONFIG); 
    let yearSheet = configSS.getSheetByName('Year_Config');
    
    if (!yearSheet) {
      yearSheet = configSS.insertSheet('Year_Config');
      yearSheet.appendRow(['Year', 'FileID', 'Status']);
      yearSheet.getRange("A1:C1").setFontWeight("bold").setBackground("#e2e8f0");
      yearSheet.setFrozenRows(1);
    }
    
    const data = yearSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(year)) return { success: false, message: `มีการตั้งค่าไฟล์ของปี ${year}อยู่แล้วในระบบครับ` };
    }
    
    const fileName = `reAgentics_Transactions_${year}`;
    const newSS = SpreadsheetApp.create(fileName);
    const fileId = newSS.getId();
    let sheet = newSS.getSheets()[0];
    sheet.setName(String(year));
    const headers = ['transactionID', 'timestamp', 'type', 'itemID', 'lot', 'expiry_Date', 'quantity', 'actionBy_UserID', 'Transport_Temp', 'Transport_Speed', 'Delivery_Note_URL'];
    sheet.appendRow(headers);
    sheet.getRange("A1:K1").setFontWeight("bold").setBackground("#f8fafc");
    sheet.setFrozenRows(1);
    
    yearSheet.appendRow([year, fileId, 'Connected']);
    logSystem("Create Year Sheet", `Created new transaction file for year ${year} (ID: ${fileId})`, userId);
    return { success: true, fileId: fileId, year: year, status: 'Connected' };
  } catch (e) { return { success: false, message: e.message }; } finally { lock.releaseLock(); }
}

function apiManualAddYearSheet(year, fileId, userId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); checkDatabaseSetup();
    const config = getDbConfig();
    if(!config.CONFIG || config.CONFIG.includes('ใส่_ID_ไฟล์')) throw new Error("Missing Config DB ID");
    const configSS = SpreadsheetApp.openById(config.CONFIG); 
    let yearSheet = configSS.getSheetByName('Year_Config');
    if (!yearSheet) {
      yearSheet = configSS.insertSheet('Year_Config');
      yearSheet.appendRow(['Year', 'FileID', 'Status']);
      yearSheet.getRange("A1:C1").setFontWeight("bold").setBackground("#e2e8f0");
      yearSheet.setFrozenRows(1);
    }
    const data = yearSheet.getDataRange().getValues();
    let isExist = false;
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(year)) {
        yearSheet.getRange(i + 1, 2).setValue(fileId); 
        yearSheet.getRange(i + 1, 3).setValue('Connected'); 
        isExist = true; 
        break;
      }
    }
    if (!isExist) yearSheet.appendRow([year, fileId, 'Connected']);
    
    try { SpreadsheetApp.openById(fileId); } catch(err) { throw new Error("ไม่สามารถเข้าถึงไฟล์ Sheet ID ที่ระบุได้ กรุณาตรวจสอบสิทธิ์การเข้าถึง"); }
    
    logSystem("Manual Connect Year", `Manually connected file for year ${year} (ID: ${fileId})`, userId);
    return { success: true, fileId: fileId, year: year, status: 'Connected' };
  } catch (e) { return { success: false, message: e.message }; } finally { lock.releaseLock(); }
}

function apiDisconnectYearSheet(year, userId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const config = getDbConfig();
    if(!config.CONFIG || config.CONFIG.includes('ใส่_ID_ไฟล์')) throw new Error("Missing Config DB ID");
    const configSS = SpreadsheetApp.openById(config.CONFIG); 
    let yearSheet = configSS.getSheetByName('Year_Config');
    if (!yearSheet) return { success: false, message: 'ไม่พบตารางตั้งค่าปี' };
    
    const data = yearSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(year)) {
        yearSheet.getRange(i + 1, 3).setValue('Disconnected'); 
        logSystem("Disconnect Year", `Disconnected transaction file for year ${year}`, userId);
        return { success: true };
      }
    }
    return { success: false, message: 'ไม่พบข้อมูลปีที่ต้องการระงับการเชื่อมต่อ' };
  } catch (e) { return { success: false, message: e.message }; } finally { lock.releaseLock(); }
}

function apiDeleteYearSheet(year, userId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const config = getDbConfig();
    if(!config.CONFIG || config.CONFIG.includes('ใส่_ID_ไฟล์')) throw new Error("Missing Config DB ID");
    const configSS = SpreadsheetApp.openById(config.CONFIG); 
    let yearSheet = configSS.getSheetByName('Year_Config');
    if (!yearSheet) return { success: false, message: 'ไม่พบตารางตั้งค่าปี' };
    
    const data = yearSheet.getDataRange().getValues();
    for (let i = 1; i < data.length; i++) {
      if (String(data[i][0]) === String(year)) {
        yearSheet.deleteRow(i + 1); 
        logSystem("Delete Year Link", `Removed year ${year} from config database`, userId);
        return { success: true };
      }
    }
    return { success: false, message: 'ไม่พบข้อมูลปีที่ต้องการลบ' };
  } catch (e) { return { success: false, message: e.message }; } finally { lock.releaseLock(); }
}

function apiGetSystemLogo() {
  try {
    const config = getDbConfig();
    if(!config.CONFIG || config.CONFIG.includes('ใส่_ID_ไฟล์')) return { success: false };
    const sysSS = SpreadsheetApp.openById(config.CONFIG); 
    let sheet = sysSS.getSheetByName('App_Logo');
    if (sheet) {
      let url = sheet.getRange("B2").getValue();
      if (!url) url = sheet.getRange("B1").getValue();
      if (url) return { success: true, url: url };
    }
    return { success: false };
  } catch(e) { return { success: false }; }
}

function apiChangePassword(userId, newPassword) {
  try {
    const config = getDbConfig();
    const userSS = SpreadsheetApp.openById(config.USER); 
    const sheet = userSS.getSheetByName('User'); 
    const data = sheet.getDataRange().getValues();
    
    for (let i = 1; i < data.length; i++) { 
      if (String(data[i][1]) === String(userId)) { 
        sheet.getRange(i + 1, 3).setValue(newPassword); 
        logSystem("Change Password", "Updated password", userId); 
        return { status: 'success' }; 
      } 
    }
    return { status: 'error', message: 'User not found' };
  } catch (e) { return { status: 'error', message: e.toString() }; }
}

function apiSaveProfileImage(userId, base64Data) {
  try {
    const config = getDbConfig();
    const userSS = SpreadsheetApp.openById(config.USER); 
    const sheet = userSS.getSheetByName('User'); 
    const data = sheet.getDataRange().getDisplayValues();
    
    let rowIndex = -1; 
    let oldFileUrl = "";
    
    for (let i = 1; i < data.length; i++) { 
      if (String(data[i][1]) === String(userId)) { 
        rowIndex = i + 1; 
        oldFileUrl = data[i][7]; 
        break; 
      } 
    }
    
    if (rowIndex === -1) return { status: 'error', message: 'User not found' };
    deleteOldDriveFile(oldFileUrl);
    
    let folder;
    if (config.FOLDER_PROFILE) { 
      try { folder = DriveApp.getFolderById(config.FOLDER_PROFILE); } catch(e) {} 
    }
    
    if (!folder) {
        const folderName = "reAgentics_Profiles";
        const folders = DriveApp.getFoldersByName(folderName);
        if (folders.hasNext()) folder = folders.next(); else folder = DriveApp.createFolder(folderName);
    }
    
    const contentType = base64Data.substring(5, base64Data.indexOf(';')); 
    let ext = "png"; 
    if (contentType.includes("gif")) ext = "gif"; else if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
    
    const bytes = Utilities.base64Decode(base64Data.substr(base64Data.indexOf('base64,')+7));
    const blob = Utilities.newBlob(bytes, contentType, `profile_${userId}_${Date.now()}.${ext}`); 
    const file = folder.createFile(blob); 
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
    
    const fileUrl = `https://drive.google.com/thumbnail?id=${file.getId()}&sz=s800`; 
    sheet.getRange(rowIndex, 8).setValue(fileUrl); 
    logSystem("Change Profile Pic", "Updated profile image", userId); 
    return { status: 'success', url: fileUrl };
  } catch (e) { return { status: 'error', message: e.toString() }; }
}

function apiSaveSystemLogo(base64Data, userId) {
  try {
    const config = getDbConfig();
    if(!config.CONFIG || config.CONFIG.includes('ใส่_ID_ไฟล์')) throw new Error("กรุณาตั้งค่า Config ID ในหน้าตั้งค่าฐานข้อมูลก่อน");
    
    const sysSS = SpreadsheetApp.openById(config.CONFIG); 
    let sheet = sysSS.getSheetByName('App_Logo');
    if (!sheet) { sheet = sysSS.insertSheet('App_Logo'); }
    
    let oldFileUrl = "";
    try { oldFileUrl = sheet.getRange("B2").getValue() || sheet.getRange("B1").getValue(); } catch(e) {}
    deleteOldDriveFile(oldFileUrl);
    
    let folder;
    if (config.FOLDER_LOGO) { 
      try { folder = DriveApp.getFolderById(config.FOLDER_LOGO); } catch(e) {} 
    }
    
    if (!folder) {
        const folderName = "reAgentics_Logos";
        const folders = DriveApp.getFoldersByName(folderName);
        if (folders.hasNext()) folder = folders.next(); else folder = DriveApp.createFolder(folderName);
    }
    
    const contentType = base64Data.substring(5, base64Data.indexOf(';')); 
    let ext = "png"; 
    if (contentType.includes("gif")) ext = "gif"; else if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
    
    const bytes = Utilities.base64Decode(base64Data.substr(base64Data.indexOf('base64,')+7)); 
    const blob = Utilities.newBlob(bytes, contentType, `app_logo_${Date.now()}.${ext}`);
    const file = folder.createFile(blob); 
    try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
    
    const fileUrl = `https://drive.google.com/thumbnail?id=${file.getId()}&sz=s800`;
    sheet.clear();
    sheet.getRange("A1").setValue("Name").setFontWeight("bold"); 
    sheet.getRange("B1").setValue("Url").setFontWeight("bold");
    sheet.getRange("A2").setValue("MainLogo"); 
    sheet.getRange("B2").setValue(fileUrl);
    SpreadsheetApp.flush();
    
    logSystem("Change Logo", "Updated system logo", userId); 
    return { status: 'success', url: fileUrl };
  } catch (e) { return { status: 'error', message: e.toString() }; }
}

function apiUploadReagentImage(base64Data, unitName, oldUrl, userId) {
    try {
        const config = getDbConfig();
        let targetFolderId = "";
        
        if(config.UNIT && !config.UNIT.includes('ใส่_ID_ไฟล์')) {
             const unitSS = SpreadsheetApp.openById(config.UNIT);
             let unitSheet = unitSS.getSheetByName('Units');
             if(unitSheet) {
                 const data = unitSheet.getDataRange().getValues();
                 for(let i = 1; i < data.length; i++) {
                     if(String(data[i][1]).trim() === String(unitName).trim()) {
                         targetFolderId = String(data[i][3] || '').trim(); 
                         break;
                     }
                 }
             }
        }
        
        deleteOldDriveFile(oldUrl);
        let folder;
        if (targetFolderId) { try { folder = DriveApp.getFolderById(targetFolderId); } catch(e) {} }
        
        if (!folder) {
            const folderName = "reAgentics_Items_" + unitName;
            const folders = DriveApp.getFoldersByName(folderName);
            if (folders.hasNext()) folder = folders.next(); else folder = DriveApp.createFolder(folderName);
        }
        
        const contentType = base64Data.substring(5, base64Data.indexOf(';')); 
        let ext = "png"; 
        if (contentType.includes("gif")) ext = "gif"; else if (contentType.includes("jpeg") || contentType.includes("jpg")) ext = "jpg";
        
        const bytes = Utilities.base64Decode(base64Data.substr(base64Data.indexOf('base64,')+7));
        const blob = Utilities.newBlob(bytes, contentType, `item_${Date.now()}.${ext}`); 
        const file = folder.createFile(blob); 
        try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
        
        const fileUrl = `https://drive.google.com/thumbnail?id=${file.getId()}&sz=s800`; 
        logSystem("Upload Reagent Image", `Uploaded image to folder for unit: ${unitName}`, userId);
        return { success: true, url: fileUrl };
    } catch(e) { return { success: false, message: e.toString() }; }
}

function apiUploadDeliveryNote(base64Data, unitName, userId) {
    try {
        const config = getDbConfig();
        let targetFolderId = ""; 
        let prefix = unitName; 
        
        if(config.UNIT && !config.UNIT.includes('ใส่_ID_ไฟล์')) {
             const unitSS = SpreadsheetApp.openById(config.UNIT);
             let unitSheet = unitSS.getSheetByName('Units');
             if(unitSheet) {
                 const data = unitSheet.getDataRange().getValues();
                 for(let i = 1; i < data.length; i++) {
                     if(String(data[i][1]).trim() === String(unitName).trim()) {
                         prefix = String(data[i][2]).trim() || unitName; 
                         targetFolderId = String(data[i][4] || '').trim(); 
                         break;
                     }
                 }
             }
        }
        
        let folder;
        if (targetFolderId) { try { folder = DriveApp.getFolderById(targetFolderId); } catch(e) {} }
        if (!folder) {
            const folderName = "reAgentics_DeliveryNotes_" + unitName;
            const folders = DriveApp.getFoldersByName(folderName);
            if (folders.hasNext()) folder = folders.next(); else folder = DriveApp.createFolder(folderName);
        }
        
        const today = new Date();
        const dateStr = Utilities.formatDate(today, Session.getScriptTimeZone(), "yyyy-MM-dd");
        const randomStr = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const fileName = `${prefix}_${dateStr}_${randomStr}.pdf`;
        const contentType = 'application/pdf';
        const base64Clean = base64Data.split(',')[1];
        const bytes = Utilities.base64Decode(base64Clean);
        const blob = Utilities.newBlob(bytes, contentType, fileName); 
        const file = folder.createFile(blob); 
        try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch(e) {}
        
        const fileUrl = file.getUrl(); 
        logSystem("Upload Delivery Note", `Uploaded PDF to folder for unit: ${unitName}`, userId);
        return { success: true, url: fileUrl };
    } catch(e) { return { success: false, message: e.toString() }; }
}

// -------------------------------------------------------------------------
// 7. STICKER CONFIG API
// -------------------------------------------------------------------------
function apiGetStickerConfig() {
  try {
    const dbConfig = getDbConfig();
    if(!dbConfig.CONFIG || dbConfig.CONFIG.includes('ใส่_ID_ไฟล์')) {
      return { status: 'success', config: getDefaultStickerConfig() };
    }
    const sysSS = SpreadsheetApp.openById(dbConfig.CONFIG);
    let sheet = sysSS.getSheetByName('Sticker_Config');
    let config = getDefaultStickerConfig();
    
    if (!sheet) {
      sheet = sysSS.insertSheet('Sticker_Config');
      sheet.appendRow(['Key', 'Value', 'Description']);
      sheet.getRange("A1:C1").setFontWeight("bold").setBackground("#f1f5f9");
      const descriptions = {
        width: "ความกว้างของสติ๊กเกอร์ (mm)", height: "ความสูงของสติ๊กเกอร์ (mm)",
        autoPrintCount: "จำนวนแผ่นที่จะพิมพ์อัตโนมัติเมื่อรับเข้าเสร็จ", manualPrintCount: "จำนวนแผ่นที่จะพิมพ์เมื่อกดปุ่มพิมพ์จากหน้าจอ",
        barcodeHeight: "ความสูงของเส้นบาร์โค้ด (px)", barcodeWidth: "สเกลความกว้างเส้นบาร์โค้ด", layoutJSON: "พิกัด X/Y, ขนาด, การหมุน ของแต่ละองค์ประกอบ (ห้ามแก้ไขด้วยมือ)"
      };
      for (let key in config) { sheet.appendRow([key, config[key], descriptions[key]]); }
      sheet.setColumnWidth(1, 150); sheet.setColumnWidth(2, 250); sheet.setColumnWidth(3, 300);
    } else {
      const data = sheet.getDataRange().getValues();
      for (let i = 1; i < data.length; i++) {
        if (config.hasOwnProperty(data[i][0])) {
          let val = data[i][1];
          if (val === 'true' || val === true) config[data[i][0]] = true;
          else if (val === 'false' || val === false) config[data[i][0]] = false;
          else if (data[i][0] === 'layoutJSON') config[data[i][0]] = String(val);
          else config[data[i][0]] = Number(val) || val;
        }
      }
    }
    return { status: 'success', config: config };
  } catch (e) { return { status: 'error', message: 'Get Sticker Config Error: ' + e.message }; }
}

function getDefaultStickerConfig() {
  return {
    width: 50, height: 30, autoPrintCount: 2, manualPrintCount: 1, barcodeHeight: 35, barcodeWidth: 1.5,   
    layoutJSON: JSON.stringify({
      cyto:    { x: 25, y: 4, size: 11, rot: 0, visible: true, bold: true, font: 'Montserrat' }, 
      name:    { x: 25, y: 9, size: 9, rot: 0, visible: false, bold: false, font: 'Montserrat' }, 
      age:     { x: 10, y: 26, size: 10, rot: 0, visible: true, bold: true, font: 'Roboto Mono' }, 
      spec:    { x: 40, y: 26, size: 10, rot: 0, visible: true, bold: true, font: 'Roboto Mono' }, 
      unit:    { x: 25, y: 28, size: 8, rot: 0, visible: false, bold: false, font: 'Montserrat' }, 
      bar:     { x: 25, y: 13, rot: 0, visible: true, width: 1.5 },
      barText: { x: 25, y: 21, size: 11, rot: 0, visible: true, bold: true, font: 'Roboto Mono' } 
    })
  };
}

function apiSaveStickerConfig(newConfig, userId) {
  const lock = LockService.getScriptLock(); lock.tryLock(10000);
  try {
    const dbConfig = getDbConfig();
    if(!dbConfig.CONFIG || dbConfig.CONFIG.includes('ใส่_ID_ไฟล์')) throw new Error("กรุณาตั้งค่า Config ID ในหน้าตั้งค่าฐานข้อมูลก่อน");
    
    const sysSS = SpreadsheetApp.openById(dbConfig.CONFIG);
    let sheet = sysSS.getSheetByName('Sticker_Config');
    if (!sheet) return { status: 'error', message: 'Sticker_Config sheet not found' };
    
    const data = sheet.getDataRange().getValues();
    for (let key in newConfig) {
      let found = false;
      for (let i = 1; i < data.length; i++) {
        if (data[i][0] === key) {
          sheet.getRange(i + 1, 2).setValue(newConfig[key]);
          found = true; break;
        }
      }
      if (!found) sheet.appendRow([key, newConfig[key], "Auto-generated field"]);
    }
    
    logSystem("Update Config", "Admin updated Sticker Configuration Layout", userId);
    return { status: 'success' };
  } catch (e) { return { status: 'error', message: 'Save Sticker Config Error: ' + e.message }; } finally { lock.releaseLock(); }
}

// -------------------------------------------------------------------------
// 8. DATA FETCHING (DROPDOWNS & AUTO-IDs) 
// -------------------------------------------------------------------------
function apiGetFormOptions() {
  try {
    const config = getDbConfig(); 
    if(!config.UNIT || config.UNIT.includes('ใส่_ID_ไฟล์')) return { success: false, message: 'ไม่ได้ตั้งค่า Unit DB' };
    
    const unitSS = SpreadsheetApp.openById(config.UNIT); 
    const options = { units: [], reagUnits: [], analyzers: [], storageLocations: [], companies: [], reagTypes: [] };
    
    try { 
      let sheetUnits = unitSS.getSheetByName('Units');
      if(sheetUnits) {
        let data = sheetUnits.getDataRange().getValues(); 
        for(let i=1; i<data.length; i++) {
          if(data[i][1]) options.units.push({ group: String(data[i][0]).trim(), name: String(data[i][1]).trim(), prefix: String(data[i][2]).trim() }); 
        }
      }
    } catch(e) { console.error("Error loading Units:", e); }
    
    try { 
      let sheetReagUnits = unitSS.getSheetByName('ReagUnits');
      if(sheetReagUnits) {
        let data = sheetReagUnits.getDataRange().getValues(); 
        for(let i=1; i<data.length; i++) {
          if(data[i][0]) options.reagUnits.push(data[i][0]); 
        }
      }
    } catch(e) { console.error("Error loading ReagUnits:", e); }
    
    try { 
      let sheetReagTypes = unitSS.getSheetByName('ReagTypes');
      if(sheetReagTypes) {
        let data = sheetReagTypes.getDataRange().getValues(); 
        for(let i=1; i<data.length; i++) {
          if(data[i][0]) options.reagTypes.push(data[i][0]); 
        }
      }
    } catch(e) { console.error("Error loading ReagTypes:", e); }
    
    try { 
      let sheetAnalyzers = unitSS.getSheetByName('Analyzers');
      if(sheetAnalyzers) {
        let data = sheetAnalyzers.getDataRange().getValues(); 
        for(let i=1; i<data.length; i++) {
          if(data[i][0] && data[i][1]) options.analyzers.push({ unit: data[i][0], name: data[i][1] }); 
        }
      }
    } catch(e) { console.error("Error loading Analyzers:", e); }
    
    try { 
      let sheetStorage = unitSS.getSheetByName('storageLocation');
      if(sheetStorage) {
        let data = sheetStorage.getDataRange().getValues(); 
        for(let i=1; i<data.length; i++) {
          if(data[i][0]) options.storageLocations.push(data[i][0]); 
        }
      }
    } catch(e) { console.error("Error loading storageLocation:", e); }
    
    try { 
      let sheetCompany = unitSS.getSheetByName('Company');
      if(sheetCompany) {
        let data = sheetCompany.getDataRange().getValues(); 
        const uniqueCompanies = [...new Set(data.slice(1).map(r => String(r[0]).trim()).filter(String))]; 
        options.companies = uniqueCompanies; 
      }
    } catch(e) { console.error("Error loading Company:", e); }
    
    return { success: true, data: options };
  } catch(e) { return { success: false, message: e.message }; }
}

function apiGetNextItemID(unitName) {
  try {
    const config = getDbConfig();
    const unitSS = SpreadsheetApp.openById(config.UNIT);
    const unitSheet = unitSS.getSheetByName('Units');
    if (!unitSheet) throw new Error("ไม่พบแท็บ Units ในฐานข้อมูลหน่วยงาน");
    
    const unitData = unitSheet.getDataRange().getValues();
    let prefix = "";
    for(let i=1; i<unitData.length; i++) {
      if(String(unitData[i][1]).trim() === String(unitName).trim()) { prefix = String(unitData[i][2]).trim(); break; }
    }
    if(!prefix) return { success: false, message: "ไม่พบรหัส Prefix สำหรับหน่วยงานนี้" };
    
    const mainSS = SpreadsheetApp.openById(config.MAIN);
    const itemSheet = mainSS.getSheetByName('Items');
    let maxNum = 0;
    
    if (itemSheet) {
      const itemData = itemSheet.getDataRange().getValues();
      for(let i=1; i<itemData.length; i++) {
        const id = String(itemData[i][0]).trim();
        if(id.startsWith(prefix + "-")) {
          const numPart = parseInt(id.replace(prefix + "-", ""), 10);
          if(!isNaN(numPart) && numPart > maxNum) maxNum = numPart;
        }
      }
    }
    const nextId = prefix + "-" + String(maxNum + 1).padStart(3, '0');
    return { success: true, nextId: nextId };
  } catch(e) { return { success: false, message: e.message }; }
}

function apiGetActiveLots(itemID) {
  try {
    const config = getDbConfig(); 
    const stockSheet = SpreadsheetApp.openById(config.MAIN).getSheetByName('Stock_Balance');
    if(!stockSheet) return { success: true, lots: [] };
    
    const data = stockSheet.getDataRange().getValues(); 
    const lots = [];
    
    for(let i=1; i<data.length; i++) {
      if(String(data[i][0]).trim() === String(itemID).trim() && Number(data[i][4]) >= 1) {
        let rawLot = String(data[i][2]); 
        let cleanLot = rawLot.startsWith("'") ? rawLot.substring(1) : rawLot;
        lots.push({ lot: cleanLot, exp: safeString(data[i][3]), qty: Number(data[i][4]), unit: String(data[i][5]) });
      }
    }
    return { success: true, lots: lots };
  } catch(e) { return { success: false, message: e.message }; }
}

function apiGetLotHistory(itemID) {
  try {
    const config = getDbConfig(); 
    const stockSheet = SpreadsheetApp.openById(config.MAIN).getSheetByName('Stock_Balance');
    if(!stockSheet) return { success: true, lots: [] };
    
    const data = stockSheet.getDataRange().getValues(); 
    const lots = [];
    
    for(let i=1; i<data.length; i++) {
      if(String(data[i][0]).trim() === String(itemID).trim()) {
        let rawLot = String(data[i][2]); 
        let cleanLot = rawLot.startsWith("'") ? rawLot.substring(1) : rawLot;
        let qty = Number(data[i][4]); 
        let expStatus = 'Active'; 
        let expStr = data[i][3];
        
        if (expStr && expStr !== '-') {
          let diffDays = (new Date(expStr).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays < 0) expStatus = 'Expired'; 
          else if (diffDays <= 60) expStatus = 'Expiring'; 
        }
        
        if (qty === 0) expStatus = 'Empty';
        
        let lastUpdate = "-"; 
        try { 
          lastUpdate = typeof data[i][6] === 'string' ? data[i][6] : Utilities.formatDate(new Date(data[i][6]), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm"); 
        } catch(e){}
        
        lots.push({ lot: cleanLot, exp: safeString(expStr), qty: qty, unit: String(data[i][5]), status: expStatus, lastUpdate: lastUpdate });
      }
    }
    return { success: true, lots: lots };
  } catch(e) { return { success: false, message: e.message }; }
}

// -------------------------------------------------------------------------
// 9. INVENTORY & TRANSACTION ENGINE 
// -------------------------------------------------------------------------
function getItemsData(yearSheetId, dashboardFilterMonth) {
  try {
    checkDatabaseSetup();
    const config = getDbConfig();
    const ss = SpreadsheetApp.openById(config.MAIN);
    let unitGroupMap = {};
    
    try {
      if(config.UNIT && !config.UNIT.includes('ใส่_ID_ไฟล์')) {
        const unitSS = SpreadsheetApp.openById(config.UNIT);
        const unitSheet = unitSS.getSheetByName('Units');
        if (unitSheet) {
          const unitData = unitSheet.getDataRange().getValues();
          for (let i=1; i<unitData.length; i++) {
             let group = String(unitData[i][0]).trim(); 
             let uName = String(unitData[i][1]).trim();
             if(uName) unitGroupMap[uName] = group;
          }
        }
      }
    } catch(e) { console.error("Error reading Units for Items Data", e); }
    
    const itemSheet = ss.getSheetByName("Items");
    if (!itemSheet) throw new Error("ไม่พบชีต 'Items' ในฐานข้อมูลหลัก");
    
    const itemData = itemSheet.getDataRange().getDisplayValues();
    let stockSheet = ss.getSheetByName("Stock_Balance");
    let stockData = [];
    if (stockSheet) { stockData = stockSheet.getDataRange().getValues(); }
    
    const today = new Date();
    today.setHours(0,0,0,0);
    const balanceMap = {};
    
    if (stockData.length > 1) {
      for (let r = 1; r < stockData.length; r++) {
        let itemId = String(stockData[r][0]).trim();
        let qty = Number(stockData[r][4]) || 0;
        let expStr = stockData[r][3];
        if (!balanceMap[itemId]) balanceMap[itemId] = { totalQty: 0, earliestExp: Infinity };
        if(qty > 0) {
            balanceMap[itemId].totalQty += qty;
            if (expStr && expStr !== '-') {
                let expDate = new Date(expStr).getTime();
                if (!isNaN(expDate) && expDate < balanceMap[itemId].earliestExp) {
                    balanceMap[itemId].earliestExp = expDate;
                }
            }
        }
      }
    }
    
    let txReportMap = {};
    if (yearSheetId && config.CONFIG && !config.CONFIG.includes('ใส่_ID_ไฟล์')) {
        try {
            const configSS = SpreadsheetApp.openById(config.CONFIG);
            let yearSheet = configSS.getSheetByName('Year_Config');
            if (yearSheet) {
                let transFileId = "";
                let yData = yearSheet.getDataRange().getValues();
                for (let i = 1; i < yData.length; i++) {
                    if (String(yData[i][0]) === String(yearSheetId) && yData[i][2] !== 'Disconnected') { transFileId = yData[i][1]; break; }
                }
                if (transFileId) {
                    const transSS = SpreadsheetApp.openById(transFileId);
                    let tSheet = transSS.getSheetByName(String(yearSheetId));
                    if (tSheet && tSheet.getLastRow() > 1) {
                        const tData = tSheet.getDataRange().getValues();
                        for (let r = 1; r < tData.length; r++) {
                            let timestamp = new Date(tData[r][1]);
                            let tType = String(tData[r][2]).trim().toUpperCase();
                            let tItemId = String(tData[r][3]).trim();
                            let tQty = Number(tData[r][6]) || 0;
                            let includeRow = true;
                            if (dashboardFilterMonth && dashboardFilterMonth !== 'All') {
                                let filterM = Number(dashboardFilterMonth);
                                if (timestamp.getMonth() + 1 !== filterM) { includeRow = false; }
                            }
                            if (includeRow) {
                                if(!txReportMap[tItemId]) txReportMap[tItemId] = { rx: 0, disp: 0 };
                                if(tType === 'RECEIVE') txReportMap[tItemId].rx += tQty;
                                else if(tType === 'DISPENSE') txReportMap[tItemId].disp += tQty;
                            }
                        }
                    }
                }
            }
        } catch(e) { console.error("Error generating report data", e); }
    }
    
    const resultData = []; 
    const reportData = [];
    
    for (let i = 1; i < itemData.length; i++) {
      let row = itemData[i];
      let itemId = String(row[0]).trim();
      if (!itemId) continue; 
      
      let currentBalance = balanceMap[itemId] ? balanceMap[itemId].totalQty : 0;
      let earliestExp = balanceMap[itemId] ? balanceMap[itemId].earliestExp : Infinity;
      let expStatus = 'Active';
      
      if (earliestExp !== Infinity) {
          const diffDays = (earliestExp - today.getTime()) / (1000 * 60 * 60 * 24);
          if (diffDays < 0) expStatus = 'Expired';
          else if (diffDays <= 60) expStatus = 'Expiring'; 
      } else if (currentBalance === 0) { 
          expStatus = '-'; 
      }
      
      let uName = String(row[4]).trim();
      let group = unitGroupMap[uName] || 'ไม่ระบุ';
      
      let itemObj = {
        itemID: itemId, itemName: row[1], minLevel: row[2], unit: row[3], unitID: uName, group: group,
        reagType: String(row[5] || '').trim(), analyzer: row[6], storageTemp: row[7], storageLocation: row[8], status: String(row[9]).trim(),
        expStatus: expStatus, image: String(row[10] || '').trim(), company: String(row[11] || '').trim(), price: Number(row[12]) || 0, balance: currentBalance 
      };
      resultData.push(itemObj);
      
      if (yearSheetId) {
          reportData.push({ 
              ...itemObj, 
              receiveSum: txReportMap[itemId] ? txReportMap[itemId].rx : 0, 
              dispenseSum: txReportMap[itemId] ? txReportMap[itemId].disp : 0 
          });
      }
    }
    return { success: true, data: resultData, reportData: reportData };
  } catch (error) { return { success: false, message: error.message }; }
}

function apiGetTransactionLogs(payload) {
  try {
    const { yearSheetId, startDate, endDate } = payload; 
    const config = getDbConfig();
    
    let transFileId = ""; 
    let yData = SpreadsheetApp.openById(config.CONFIG).getSheetByName('Year_Config').getDataRange().getValues();
    for (let i = 1; i < yData.length; i++) {
       if (String(yData[i][0]) === String(yearSheetId) && yData[i][2] !== 'Disconnected') { 
          transFileId = yData[i][1]; 
          break; 
       }
    }
    if (!transFileId) throw new Error("ไม่พบไฟล์ฐานข้อมูลประวัติการทำรายการสำหรับปี " + yearSheetId);
    
    const tSheet = SpreadsheetApp.openById(transFileId).getSheetByName(String(yearSheetId)); 
    if (!tSheet) return { success: true, logs: [] };
    
    const mainSS = SpreadsheetApp.openById(config.MAIN); 
    const iData = mainSS.getSheetByName("Items").getDataRange().getValues();
    let itemMap = {}; 
    for(let r=1; r<iData.length; r++) {
       itemMap[String(iData[r][0]).trim()] = { 
          unitID: String(iData[r][4]).trim(), 
          unit: String(iData[r][3]).trim(), 
          image: String(iData[r][10] || '').trim(), 
          name: String(iData[r][1]) 
       };
    }
    
    let stockMap = {}; 
    try { 
       const sData = mainSS.getSheetByName("Stock_Balance").getDataRange().getValues(); 
       for(let r=1; r<sData.length; r++) { 
          let cleanLot = String(sData[r][2]).trim().startsWith("'") ? String(sData[r][2]).trim().substring(1) : String(sData[r][2]).trim(); 
          stockMap[String(sData[r][0]).trim() + '|' + cleanLot.toUpperCase()] = { exp: sData[r][3], unit: String(sData[r][5]).trim() }; 
       } 
    } catch(e) { console.error("Error parsing Stock_Balance", e); }
    
    let unitGroupMap = {}; 
    try { 
       const uData = SpreadsheetApp.openById(config.UNIT).getSheetByName('Units').getDataRange().getValues(); 
       for (let i=1; i<uData.length; i++) {
          unitGroupMap[String(uData[i][1]).trim()] = String(uData[i][0]).trim(); 
       }
    } catch(e) { console.error("Error parsing Units", e); }
    
    const tData = tSheet.getDataRange().getValues(); 
    const result = [];
    let startMs = startDate ? new Date(startDate).setHours(0,0,0,0) : 0; 
    let endMs = endDate ? new Date(endDate).setHours(23,59,59,999) : Infinity;
    
    for (let i = tData.length - 1; i >= 1; i--) {
        let tsStr = tData[i][1]; 
        let timeMs = 0;
        
        if (typeof tsStr === 'string' && tsStr.includes('/')) { 
           let d = tsStr.split(' ')[0].split('/'); 
           if(d.length === 3) timeMs = new Date(d[2], d[1] - 1, d[0]).getTime(); 
        } else { 
           timeMs = new Date(tsStr).getTime(); 
        }
        
        if (timeMs >= startMs && timeMs <= endMs) {
            let itemId = String(tData[i][3]).trim(); 
            let rawLotId = String(tData[i][4]).trim(); 
            let cleanLot = rawLotId.startsWith("'") ? rawLotId.substring(1) : rawLotId;
            let iDetail = itemMap[itemId] || { unitID: 'Unknown', unit: '', image: '', name: itemId };
            let sInfo = stockMap[itemId + '|' + cleanLot.toUpperCase()] || {};
            let dTime = (typeof tsStr === 'string' && tsStr.includes('/')) ? tsStr : Utilities.formatDate(new Date(tsStr), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");
            
            result.push({ 
               transId: tData[i][0], 
               timestamp: dTime, 
               type: tData[i][2], 
               itemID: itemId, 
               itemName: iDetail.name, 
               lot: cleanLot, 
               exp: safeString(sInfo.exp || tData[i][5]), 
               qty: tData[i][6], 
               unit: sInfo.unit || iDetail.unit, 
               userId: tData[i][7], 
               unitID: iDetail.unitID, 
               group: unitGroupMap[iDetail.unitID] || 'ไม่ระบุ', 
               image: iDetail.image, 
               transportTemp: tData[i][8], 
               transportSpeed: tData[i][9] 
            });
        }
    }
    return { success: true, logs: result };
  } catch(e) { return { success: false, message: e.message }; }
}

function apiRegisterNewItem(payload, userId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); 
    const config = getDbConfig(); 
    const ss = SpreadsheetApp.openById(config.MAIN); 
    const sheet = ss.getSheetByName("Items");
    
    const existingData = sheet.getRange("A:A").getValues().flat(); 
    if(existingData.includes(payload.itemID)) throw new Error(`รหัสน้ำยา ${payload.itemID} มีอยู่ในระบบแล้ว`);
    
    sheet.appendRow([ payload.itemID, payload.itemName, payload.minLevel, payload.unit, payload.unitID, payload.reagType, payload.analyzer, payload.storageTemp, payload.storageLocation, 'Active', payload.image || '', payload.company || '', payload.price || 0 ]);
    SpreadsheetApp.flush(); 
    
    logSystem("Register Item", `Registered new item: ${payload.itemID}`, userId);
    return { success: true, message: 'ลงทะเบียนน้ำยาใหม่เรียบร้อยแล้ว' };
  } catch(e) { return { success: false, message: e.message }; } finally { lock.releaseLock(); }
}

function apiUpdateItem(payload, userId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000); 
    const config = getDbConfig(); 
    const ss = SpreadsheetApp.openById(config.MAIN); 
    const sheet = ss.getSheetByName("Items");
    const data = sheet.getDataRange().getValues(); 
    let targetRow = -1;
    
    for(let i=1; i<data.length; i++) { 
       if(String(data[i][0]).trim() === String(payload.itemID).trim()) { 
          targetRow = i + 1; 
          break; 
       } 
    }
    
    if(targetRow === -1) throw new Error("ไม่พบรายการที่ต้องการแก้ไข");
    
    // Performance: Use setValues array instead of 12 separate API calls
    let updateValues = [[
      payload.itemName, 
      payload.minLevel, 
      payload.unit, 
      payload.unitID,
      payload.reagType, 
      payload.analyzer, 
      payload.storageTemp, 
      payload.storageLocation,
      payload.status, 
      payload.image !== undefined ? payload.image : data[targetRow-1][10],
      payload.company || '', 
      payload.price || 0
    ]];
    
    sheet.getRange(targetRow, 2, 1, 12).setValues(updateValues);
    
    SpreadsheetApp.flush(); 
    logSystem("Update Item", `Updated details for item: ${payload.itemID} | Status: ${payload.status}`, userId);
    return { success: true, message: 'อัปเดตข้อมูลน้ำยาเรียบร้อยแล้ว' };
  } catch(e) { return { success: false, message: e.message }; } finally { lock.releaseLock(); }
}

// -------------------------------------------------------------------------
// OPTIMIZED BATCH TRANSACTION PROCESSING (Fix Leading Zero Issue & Fast Load)
// -------------------------------------------------------------------------
function processTransaction(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000); 
    const config = getDbConfig();
    const { type, yearSheetId, userId, items, transportSpeed, deliveryNoteUrl } = payload;
    const dbSS = SpreadsheetApp.openById(config.MAIN);
    
    let stockSheet = dbSS.getSheetByName('Stock_Balance');
    if (!stockSheet) {
      stockSheet = dbSS.insertSheet('Stock_Balance');
      stockSheet.appendRow(['ItemID', 'ItemName', 'Lot', 'EXP', 'Qty', 'Unit', 'LastUpdate']);
      stockSheet.getRange("A1:G1").setFontWeight("bold").setBackground("#f8fafc");
      stockSheet.setFrozenRows(1);
    }
    let stockData = stockSheet.getDataRange().getValues();
    
    const itemSheet = dbSS.getSheetByName('Items');
    const itemDataArr = itemSheet.getDataRange().getValues();
    let itemMap = {};
    for(let i=1; i<itemDataArr.length; i++) { 
      itemMap[String(itemDataArr[i][0]).trim()] = { 
         unitID: String(itemDataArr[i][4]).trim(), 
         image: String(itemDataArr[i][10] || '').trim() 
      }; 
    }

    if(!config.CONFIG || config.CONFIG.includes('ใส่_ID_ไฟล์')) throw new Error("Missing Config DB ID");
    const configSS = SpreadsheetApp.openById(config.CONFIG);
    let yearSheet = configSS.getSheetByName('Year_Config');
    
    let transFileId = "";
    let yData = yearSheet.getDataRange().getValues();
    for (let i = 1; i < yData.length; i++) {
      if (String(yData[i][0]) === String(yearSheetId)) { 
        if(yData[i][2] === 'Disconnected') throw new Error("ไฟล์ถูกระงับการเชื่อมต่อ");
        transFileId = yData[i][1]; 
        break; 
      }
    }
    if (!transFileId) throw new Error("ไม่พบไฟล์ Transactions");
    
    const transSS = SpreadsheetApp.openById(transFileId);
    let logSheet = transSS.getSheetByName(String(yearSheetId));
    if (!logSheet) {
      logSheet = transSS.insertSheet(String(yearSheetId));
      logSheet.appendRow(['transactionID', 'timestamp', 'type', 'itemID', 'lot', 'expiry_Date', 'quantity', 'actionBy_UserID', 'Transport_Temp', 'Transport_Speed', 'Delivery_Note_URL']);
      logSheet.getRange("A1:K1").setFontWeight("bold").setBackground("#f8fafc");
    }

    const timestamp = new Date();
    let timeStr = Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss");

    let txSummaryForTelegram = {}; 
    let logRowsToAppend = [];
    
    // --- 🚀 AI CORE: BATCH OPTIMIZATION ---
    let stockUpdates = []; 
    let stockAppends = [];

    for (let i = 0; i < items.length; i++) {
      let item = items[i];
      let reqItemId = String(item.itemID).trim();
      let reqLot = String(item.lot).trim().toUpperCase(); 
      let reqQty = Number(item.qty);
      
      let sheetLotToSave = "'" + reqLot; // บังคับให้เป็น Text เสมอ เพื่อรักษาเลข 0 ข้างหน้า
      
      let itemDetails = itemMap[reqItemId] || { unitID: 'Unknown', image: '' };
      let targetUnit = itemDetails.unitID;

      let rowToUpdate = -1; 
      let currentQty = 0;
      for (let r = 1; r < stockData.length; r++) {
        let sheetItemId = String(stockData[r][0]).trim();
        let cleanSheetLot = String(stockData[r][2]).trim().startsWith("'") ? String(stockData[r][2]).trim().substring(1) : String(stockData[r][2]).trim();
        
        if (sheetItemId === reqItemId && cleanSheetLot.toUpperCase() === reqLot) { 
          rowToUpdate = r + 1; 
          currentQty = Number(stockData[r][4]) || 0; 
          if (type === 'DISPENSE') { 
             item.exp = stockData[r][3]; 
             item.unit = stockData[r][5]; 
          }
          break; 
        }
      }

      if (!txSummaryForTelegram[targetUnit]) txSummaryForTelegram[targetUnit] = [];
      
      let displayItemName = `<b>${item.itemName}</b>`;
      txSummaryForTelegram[targetUnit].push(`• ${displayItemName} (Lot: ${reqLot}) x ${reqQty} ${item.unit || ''}`);
      
      let newQty = currentQty;
      if (type === 'RECEIVE') {
        newQty = currentQty + reqQty;
        if (rowToUpdate === -1) { 
           stockAppends.push([item.itemID, item.itemName, sheetLotToSave, item.exp, newQty, item.unit, timeStr]);
           stockData.push([item.itemID, item.itemName, sheetLotToSave, item.exp, newQty, item.unit, timeStr]);
        } 
        else { 
           stockUpdates.push({ row: rowToUpdate, values: [[newQty, item.unit, timeStr]] });
           stockData[rowToUpdate - 1][4] = newQty;
           stockData[rowToUpdate - 1][5] = item.unit;
           stockData[rowToUpdate - 1][6] = timeStr;
        }
      } else if (type === 'DISPENSE') {
        if (rowToUpdate === -1) throw new Error(`ไม่พบ Lot: ${reqLot} ในคลัง`);
        if (currentQty < reqQty) throw new Error(`ยอดของ ${reqItemId} (Lot: ${reqLot}) ไม่พอ (มี ${currentQty} ขอเบิก ${reqQty})`);
        newQty = currentQty - reqQty;
        
        stockUpdates.push({ row: rowToUpdate, values: [[newQty, item.unit, timeStr]] });
        stockData[rowToUpdate - 1][4] = newQty;
        stockData[rowToUpdate - 1][5] = item.unit;
        stockData[rowToUpdate - 1][6] = timeStr;
      }

      let randCode = String(Math.floor(100 + Math.random() * 900));
      let transId = "TX-" + Utilities.formatDate(timestamp, Session.getScriptTimeZone(), "yyMMddHHmmss") + randCode + i;
      logRowsToAppend.push([ transId, timeStr, type, item.itemID, sheetLotToSave, item.exp || "-", reqQty, userId, item.transportTemp || "", transportSpeed || "", deliveryNoteUrl || "" ]);
    }
    
    // --- 🚀 เขียนลง Sheet แบบกลุ่ม (Batch) ---
    if (stockAppends.length > 0) {
       stockSheet.getRange(stockSheet.getLastRow() + 1, 1, stockAppends.length, stockAppends[0].length).setValues(stockAppends);
    }
    for (let i = 0; i < stockUpdates.length; i++) {
       stockSheet.getRange(stockUpdates[i].row, 5, 1, 3).setValues(stockUpdates[i].values);
    }

    if (logRowsToAppend.length > 0) {
       logSheet.getRange(logSheet.getLastRow() + 1, 1, logRowsToAppend.length, logRowsToAppend[0].length).setValues(logRowsToAppend);
    }
    SpreadsheetApp.flush(); 

    // ส่งแจ้งเตือน Telegram
    Object.keys(txSummaryForTelegram).forEach(unitName => {
        let actionIcon = type === 'RECEIVE' ? '📥 รับเข้า' : '📤 เบิกใช้';
        let msg = `<b>📢 แจ้งเตือนการทำรายการ</b>\n───────────────\n<b>ประเภท:</b> ${actionIcon}\n<b>ผู้ทำรายการ:</b> ${userId}\n<b>เวลา:</b> ${timeStr}\n<b>หน่วยงาน:</b> ${unitName}\n───────────────\n<b>📦 รายการน้ำยา:</b>\n${txSummaryForTelegram[unitName].join('\n')}`;

        let safeUnit = String(unitName).substring(0, 45); 
        let replyMarkup = {
          inline_keyboard: [
            [
              { text: "📦 ยอดคงเหลือ: รายงาน", callback_data: `rep_bal_${safeUnit}` },
              { text: "CSV", callback_data: `csv_bal_${safeUnit}` }
            ],
            [
              { text: "📊 ต่ำกว่าเกณฑ์: รายงาน", callback_data: `rep_low_${safeUnit}` },
              { text: "CSV", callback_data: `csv_low_${safeUnit}` }
            ],
            [
              { text: "⏳ หมดอายุ: รายงาน", callback_data: `rep_exp_${safeUnit}` },
              { text: "CSV", callback_data: `csv_exp_${safeUnit}` }
            ]
          ]
        };

        sendTelegramNotification(unitName, msg, replyMarkup);
    });
    
    logSystem("Transaction Success", `Processed ${type} (${items.length} items)`, userId);
    return { success: true, message: `บันทึกรายการ ${type === 'RECEIVE' ? 'รับเข้า' : 'เบิกใช้'} จำนวน ${items.length} สำเร็จ` };
  } catch (e) {
    logSystem("Transaction Failed", e.message, payload.userId || "Unknown");
    return { success: false, message: e.message };
  } finally { lock.releaseLock(); }
}

// === API: สำหรับแก้ไข Transaction แบบ In-place Update ===
function apiEditTransaction(payload, userId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const config = getDbConfig();
    const { yearSheetId, transId, newItemId, newLot, newQty, newExp, newTransportTemp, newTransportSpeed } = payload;
    
    // 1. หาไฟล์ Log และ บรรทัดของ Transaction เดิม
    let transFileId = "";
    const yData = SpreadsheetApp.openById(config.CONFIG).getSheetByName('Year_Config').getDataRange().getValues();
    for (let i = 1; i < yData.length; i++) {
       if (String(yData[i][0]) === String(yearSheetId)) { transFileId = yData[i][1]; break; }
    }
    if (!transFileId) throw new Error("ไม่พบไฟล์ประวัติปี " + yearSheetId);
    
    const logSheet = SpreadsheetApp.openById(transFileId).getSheetByName(String(yearSheetId));
    const logData = logSheet.getDataRange().getValues();
    let targetLogRow = -1; let oldType = "", oldItemId = "", oldLot = "", oldQty = 0;
    
    for(let r = 1; r < logData.length; r++) {
      if (String(logData[r][0]).trim() === String(transId).trim()) {
        targetLogRow = r + 1; oldType = String(logData[r][2]).trim(); oldItemId = String(logData[r][3]).trim();
        let rawLot = String(logData[r][4]).trim(); oldLot = rawLot.startsWith("'") ? rawLot.substring(1) : rawLot;
        oldQty = Number(logData[r][6]) || 0; break;
      }
    }
    if (targetLogRow === -1) throw new Error("ไม่พบรายการที่ต้องการแก้ไข");
    if (oldType === 'CANCELLED') throw new Error("รายการนี้ถูกยกเลิกไปแล้ว ไม่สามารถแก้ไขได้");
    
    // 2. จัดการข้อมูลใน Stock_Balance (In-place update)
    const dbSS = SpreadsheetApp.openById(config.MAIN);
    const stockSheet = dbSS.getSheetByName('Stock_Balance');
    const stockData = stockSheet.getDataRange().getValues();
    
    let oldStockRow = -1; let currentOldStockQty = 0;
    for (let r = 1; r < stockData.length; r++) {
      let sItem = String(stockData[r][0]).trim(); 
      let cLot = String(stockData[r][2]).trim().startsWith("'") ? String(stockData[r][2]).trim().substring(1) : String(stockData[r][2]).trim();
      if (sItem === oldItemId && cLot.toUpperCase() === oldLot.toUpperCase()) { 
         oldStockRow = r + 1; 
         currentOldStockQty = Number(stockData[r][4]) || 0; 
         break; 
      }
    }
    
    if (oldStockRow === -1 && oldType === 'DISPENSE') throw new Error("ไม่พบ Item/Lot ต้นทางในคลัง (อาจถูกลบไปแล้ว)");
    
    let finalNewLot = String(newLot).trim().toUpperCase();
    
    let newItemName = ""; let newUnit = "";
    if (newItemId !== oldItemId) {
       const itemData = dbSS.getSheetByName("Items").getDataRange().getValues();
       for(let i=1; i<itemData.length; i++) {
          if(String(itemData[i][0]).trim() === newItemId) { 
             newItemName = itemData[i][1]; 
             newUnit = itemData[i][3]; 
             break; 
          }
       }
       if(!newItemName) throw new Error("ไม่พบข้อมูลรหัสน้ำยาใหม่ในระบบ");
    }

    if (oldStockRow !== -1) {
        // Performance Update in Stock_Balance: Use setValues Array
        let updatedStockRowValues = [[
           newItemId !== oldItemId ? newItemId : stockData[oldStockRow-1][0],
           newItemId !== oldItemId ? newItemName : stockData[oldStockRow-1][1],
           finalNewLot !== oldLot.toUpperCase() ? ("'" + finalNewLot) : stockData[oldStockRow-1][2],
           newExp || stockData[oldStockRow-1][3],
           0, // placeholder for finalStockQty
           newItemId !== oldItemId ? newUnit : stockData[oldStockRow-1][5],
           Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss")
        ]];

        let finalStockQty = currentOldStockQty;
        let diffQty = Number(newQty) - oldQty;
        
        if (oldType === 'RECEIVE') finalStockQty += diffQty;
        else if (oldType === 'DISPENSE') finalStockQty -= diffQty;
        
        if (finalStockQty < 0) throw new Error("ไม่สามารถแก้ไขจำนวนได้ เนื่องจากยอดสต๊อกคงเหลือจะติดลบ");
        updatedStockRowValues[0][4] = finalStockQty;
        
        stockSheet.getRange(oldStockRow, 1, 1, 7).setValues(updatedStockRowValues);

    } else if (oldType === 'RECEIVE' && oldStockRow === -1) {
        if(!newItemName) {
           const itemData = dbSS.getSheetByName("Items").getDataRange().getValues();
           for(let i=1; i<itemData.length; i++) {
              if(String(itemData[i][0]).trim() === newItemId) { 
                 newItemName = itemData[i][1]; 
                 newUnit = itemData[i][3]; 
                 break; 
              }
           }
        }
        stockSheet.appendRow([newItemId, newItemName, "'" + finalNewLot, newExp, Number(newQty), newUnit, Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy HH:mm:ss")]);
    }

    // 4. บันทึกข้อมูลทับ Log เดิม (Performance: Use setValues instead of 7 setValues)
    let logUpdateValues = [[
      newItemId,
      "'" + finalNewLot,
      newExp || "-",
      Number(newQty),
      userId,
      newTransportTemp || "",
      newTransportSpeed || ""
    ]];
    logSheet.getRange(targetLogRow, 4, 1, 7).setValues(logUpdateValues);
    
    SpreadsheetApp.flush();
    logSystem("Edit Transaction", `Edited TransID: ${transId} to Item: ${newItemId} | Lot: ${finalNewLot} | Qty: ${newQty}`, userId);
    return { success: true, message: `แก้ไขรายการ ${transId} และอัปเดตข้อมูลคลังสำเร็จ` };
  } catch (e) { return { success: false, message: e.message }; } finally { lock.releaseLock(); }
}

// === API: สำหรับยกเลิก/ลบ Transaction ===
function apiDeleteTransaction(payload, userId) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(15000);
    const config = getDbConfig();
    const { yearSheetId, transId } = payload;
    
    let transFileId = "";
    const yData = SpreadsheetApp.openById(config.CONFIG).getSheetByName('Year_Config').getDataRange().getValues();
    for (let i = 1; i < yData.length; i++) {
       if (String(yData[i][0]) === String(yearSheetId)) { transFileId = yData[i][1]; break; }
    }
    if (!transFileId) throw new Error("ไม่พบไฟล์ประวัติปี " + yearSheetId);
    
    const logSheet = SpreadsheetApp.openById(transFileId).getSheetByName(String(yearSheetId));
    const logData = logSheet.getDataRange().getValues();
    let targetLogRow = -1; let oldType = "", oldItemId = "", oldLot = "", oldQty = 0;
    
    for(let r = 1; r < logData.length; r++) {
      if (String(logData[r][0]).trim() === String(transId).trim()) {
        targetLogRow = r + 1; oldType = String(logData[r][2]).trim(); oldItemId = String(logData[r][3]).trim();
        let rawLot = String(logData[r][4]).trim(); oldLot = rawLot.startsWith("'") ? rawLot.substring(1) : rawLot;
        oldQty = Number(logData[r][6]) || 0; break;
      }
    }
    if (targetLogRow === -1) throw new Error("ไม่พบรายการที่ต้องการยกเลิก");
    if (oldType === 'CANCELLED') throw new Error("รายการนี้ถูกยกเลิกไปแล้ว");
    
    const stockSheet = SpreadsheetApp.openById(config.MAIN).getSheetByName('Stock_Balance');
    const stockData = stockSheet.getDataRange().getValues();
    
    let oldStockRow = -1; let currentOldStockQty = 0;
    for (let r = 1; r < stockData.length; r++) {
      let sItem = String(stockData[r][0]).trim(); 
      let cLot = String(stockData[r][2]).trim().startsWith("'") ? String(stockData[r][2]).trim().substring(1) : String(stockData[r][2]).trim();
      if (sItem === oldItemId && cLot.toUpperCase() === oldLot.toUpperCase()) { 
         oldStockRow = r + 1; 
         currentOldStockQty = Number(stockData[r][4]) || 0; 
         break; 
      }
    }
    
    if (oldStockRow !== -1) {
      if (oldType === 'RECEIVE') {
        let fQty = currentOldStockQty - oldQty;
        if (fQty <= 0) {
            stockSheet.deleteRow(oldStockRow);
        } else {
            stockSheet.getRange(oldStockRow, 5).setValue(fQty);
        }
      } else if (oldType === 'DISPENSE') {
        stockSheet.getRange(oldStockRow, 5).setValue(currentOldStockQty + oldQty);
      }
    } else if (oldType === 'DISPENSE') {
       throw new Error("ไม่พบรายการในคลังให้คืนยอด");
    }

    logSheet.getRange(targetLogRow, 3).setValue("CANCELLED");
    
    SpreadsheetApp.flush();
    logSystem("Cancel Transaction", `Cancelled TransID: ${transId} | Item: ${oldItemId} | Lot: ${oldLot} (Restored/Deducted ${oldQty})`, userId);
    return { success: true, message: `ยกเลิกรายการและคืนยอดเรียบร้อย` };
  } catch (e) { return { success: false, message: e.message }; } finally { lock.releaseLock(); }
}

// -------------------------------------------------------------------------
// 10. AUTOMATED ALERTS (CRON JOBS / TRIGGERS)
// -------------------------------------------------------------------------

/**
 * รันฟังก์ชันนี้ครั้งเดียวเพื่อติดตั้งระบบตั้งเวลาอัตโนมัติ 
 */
function setupAutomatedAlerts() {
  const triggers = ScriptApp.getProjectTriggers();
  triggers.forEach(t => ScriptApp.deleteTrigger(t)); // ล้างของเก่า

  // 1. แจ้งเตือน Low Stock ตอน 16:00 ทุกวัน
  ScriptApp.newTrigger('dailyLowStockAlert').timeBased().everyDays(1).atHour(16).create();

  // 2. แจ้งเตือนน้ำยาใกล้หมดอายุ/หมดอายุ ทุกวันอาทิตย์ ตอนเช้า (08:00)
  ScriptApp.newTrigger('weeklyExpiryAlert').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(8).create();
    
  console.log("ติดตั้งระบบแจ้งเตือนอัตโนมัติเรียบร้อยแล้ว");
}

function dailyLowStockAlert() {
  try {
    const config = getDbConfig();
    if (!config.MAIN || config.MAIN.includes('ใส่_ID_ไฟล์')) return;
    const dbSS = SpreadsheetApp.openById(config.MAIN);
    
    const itemData = dbSS.getSheetByName("Items").getDataRange().getValues();
    let stockSheet = dbSS.getSheetByName("Stock_Balance");
    if (!stockSheet) return;
    const stockData = stockSheet.getDataRange().getValues();

    let balanceMap = {};
    for (let r = 1; r < stockData.length; r++) {
      let itemId = String(stockData[r][0]).trim();
      let qty = Number(stockData[r][4]) || 0;
      if (!balanceMap[itemId]) balanceMap[itemId] = 0;
      balanceMap[itemId] += qty;
    }

    let lowStockAlerts = {}; 

    for (let i = 1; i < itemData.length; i++) {
      let itemId = String(itemData[i][0]).trim();
      if (!itemId || String(itemData[i][9]).trim() !== 'Active') continue;

      let itemName = String(itemData[i][1]).trim();
      let minLevel = Number(itemData[i][2]) || 0;
      let unit = String(itemData[i][3]).trim();
      let unitID = String(itemData[i][4]).trim();

      let currentBalance = balanceMap[itemId] || 0;

      if (currentBalance < minLevel) {
        if (!lowStockAlerts[unitID]) lowStockAlerts[unitID] = [];
        
        let displayItemName = `<b>${itemName}</b>`; 
        lowStockAlerts[unitID].push(`• ${displayItemName} \n   (เหลือ ${currentBalance} ${unit} | เกณฑ์: ${minLevel})`);
      }
    }

    Object.keys(lowStockAlerts).forEach(unitName => {
      let msg = `<b>⚠️ แจ้งเตือนน้ำยาเหลือต่ำกว่าเกณฑ์</b>\n───────────────\n<b>หน่วยงาน:</b> ${unitName}\n───────────────\nกรุณาพิจารณาสั่งซื้อเพิ่มเติมเพื่อไม่ให้กระทบต่องานบริการ:\n\n`;
      msg += lowStockAlerts[unitName].join('\n');

      let safeUnit = String(unitName).substring(0, 45);
      let replyMarkup = {
        inline_keyboard: [
          [
            { text: "📊 ต่ำกว่าเกณฑ์: รายงาน", callback_data: `rep_low_${safeUnit}` },
            { text: "CSV", callback_data: `csv_low_${safeUnit}` }
          ]
        ]
      };
      sendTelegramNotification(unitName, msg, replyMarkup);
    });

  } catch(e) { console.error("Low Stock Alert Error: ", e); }
}

function weeklyExpiryAlert() {
  try {
    const config = getDbConfig();
    if (!config.MAIN || config.MAIN.includes('ใส่_ID_ไฟล์')) return;
    const dbSS = SpreadsheetApp.openById(config.MAIN);
    
    let itemMap = {};
    const itemData = dbSS.getSheetByName("Items").getDataRange().getValues();
    for (let i = 1; i < itemData.length; i++) {
      itemMap[String(itemData[i][0]).trim()] = {
        name: String(itemData[i][1]).trim(),
        unitID: String(itemData[i][4]).trim(),
        unit: String(itemData[i][3]).trim()
      };
    }

    let stockSheet = dbSS.getSheetByName("Stock_Balance");
    if (!stockSheet) return;
    const stockData = stockSheet.getDataRange().getValues();

    const today = new Date();
    today.setHours(0,0,0,0);
    const todayMs = today.getTime();

    let expiryAlerts = {};

    for (let r = 1; r < stockData.length; r++) {
      let itemId = String(stockData[r][0]).trim();
      let rawLot = String(stockData[r][2]).trim();
      let lot = rawLot.startsWith("'") ? rawLot.substring(1) : rawLot; 
      
      let expStr = stockData[r][3];
      let qty = Number(stockData[r][4]) || 0;

      if (qty > 0 && expStr && expStr !== '-') {
        let expDate = new Date(expStr).getTime();
        if (!isNaN(expDate)) {
          let diffDays = Math.ceil((expDate - todayMs) / (1000 * 60 * 60 * 24));
          let itemDetails = itemMap[itemId];
          if (!itemDetails) continue;

          let targetUnit = itemDetails.unitID;
          if (!expiryAlerts[targetUnit]) expiryAlerts[targetUnit] = { near: [], expired: [] };

          let displayItemName = `<b>${itemDetails.name}</b>`; 
          let entry = `• ${displayItemName} (Lot: ${lot})\n   (คงเหลือ ${qty} ${itemDetails.unit} | หมดอายุ: ${Utilities.formatDate(new Date(expStr), Session.getScriptTimeZone(), "dd/MM/yyyy")})`;

          if (diffDays < 0) {
            expiryAlerts[targetUnit].expired.push(entry);
          } else if (diffDays <= 60) {
            expiryAlerts[targetUnit].near.push(entry + ` <i>(อีก ${diffDays} วัน)</i>`);
          }
        }
      }
    }

    Object.keys(expiryAlerts).forEach(unitName => {
      let hasNear = expiryAlerts[unitName].near.length > 0;
      let hasExpired = expiryAlerts[unitName].expired.length > 0;

      if (!hasNear && !hasExpired) return;

      let msg = `<b>⏳ แจ้งเตือนวันหมดอายุน้ำยา (ประจำสัปดาห์)</b>\n───────────────\n<b>หน่วยงาน:</b> ${unitName}\n───────────────\n`;

      if (hasExpired) {
        msg += `<b>❌ น้ำยาหมดอายุแล้ว (ห้ามใช้):</b>\n`;
        msg += expiryAlerts[unitName].expired.join('\n') + `\n\n`;
      }
      
      if (hasNear) {
        msg += `<b>⚠️ น้ำยาใกล้หมดอายุ (< 60 วัน):</b>\n`;
        msg += expiryAlerts[unitName].near.join('\n');
      }

      let safeUnit = String(unitName).substring(0, 45);
      let replyMarkup = {
        inline_keyboard: [
          [
            { text: "⏳ หมดอายุ: รายงาน", callback_data: `rep_exp_${safeUnit}` },
            { text: "CSV", callback_data: `csv_exp_${safeUnit}` }
          ]
        ]
      };
      sendTelegramNotification(unitName, msg, replyMarkup);
    });

  } catch(e) { console.error("Expiry Alert Error: ", e); }
}
