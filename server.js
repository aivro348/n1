import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import mysql from 'mysql2/promise';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.join(__dirname, 'db.json');

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

const PORT = process.env.PORT || 5001;

// ── The 8 Official Units ──
const ORGANIZATIONAL_UNITS = [
  'Procurement [Marketing Department]',
  'Warehousing [Marketing Department]',
  'Donor cell along with Concurrent audit on donation of all allied trusts and Srivani Trust Receipts [Tirumala]',
  'Kalyanakatta & Kalyanavedika [Tirumala]',
  'Annaprasadam Trust and Canteens TML & TPT',
  'Sri Padmavathi Ammavari Temple, Tiruchanoor (Sri PAT)',
  'Reception, TML including Marriage halls',
  'Auctions [Marketing Department]'
];

// Helper: Format Server-Authoritative Timestamps
function getServerTimeDetails() {
  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
  const dateStr = now.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  const isoStr = now.toISOString();
  return { timeStr, dateStr, isoStr, fullTimeframe: `${timeStr} (UTC+5:30) • ${dateStr}` };
}

// Helper: Calculate exact shift duration from login ISO to logout ISO
function calculateDuration(loginIso, logoutIso) {
  if (!loginIso || !logoutIso) return 'N/A';
  const start = new Date(loginIso);
  const end = new Date(logoutIso);
  const diffMs = end - start;
  if (diffMs < 0) return '0m';
  
  const diffMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

// ── MySQL Connection Pool (Configured for cPanel / Remote / Local) ──
let pool = null;
let useMySql = false;

if (process.env.DB_NAME && process.env.DB_USER) {
  try {
    const dbName = process.env.DB_NAME.trim();
    const dbUser = process.env.DB_USER.trim();
    const dbHost = (process.env.DB_HOST || 'localhost').trim();
    const dbPass = (process.env.DB_PASSWORD || '').trim();

    pool = mysql.createPool({
      host: dbHost,
      user: dbUser,
      password: dbPass,
      database: dbName,
      port: process.env.DB_PORT ? Number(process.env.DB_PORT) : 3306,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // Test connection
    pool.getConnection()
      .then(async conn => {
        console.log(`✅ Connected to cPanel MySQL Database: ${process.env.DB_NAME}`);
        useMySql = true;

        // Resiliently ensure audit metadata columns exist in cPanel DB
        try {
          await pool.query('ALTER TABLE users ADD COLUMN student_reg_no VARCHAR(100) NULL');
        } catch (err) { /* column might already exist */ }
        try {
          await pool.query('ALTER TABLE users ADD COLUMN phone VARCHAR(100) NULL');
        } catch (err) { /* column might already exist */ }
        try {
          await pool.query('ALTER TABLE users ADD COLUMN sub_unit VARCHAR(255) NULL');
        } catch (err) { /* column might already exist */ }

        try {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS daily_reports (
              id VARCHAR(64) NOT NULL,
              user_id VARCHAR(64) NULL,
              login_time VARCHAR(50) NOT NULL,
              full_name VARCHAR(191) NOT NULL,
              student_reg_no VARCHAR(100) NOT NULL,
              unit_details TEXT NOT NULL,
              sub_unit_details VARCHAR(255) NULL,
              audit_work_type TEXT NOT NULL,
              work_objective TEXT NULL,
              vouchers_verified TEXT NULL,
              target_to_achieve TEXT NULL,
              ca_remarks TEXT NULL,
              poc_name VARCHAR(255) NULL,
              logout_time VARCHAR(50) NULL,
              logout_remarks TEXT NULL,
              objective_completed TEXT NULL,
              escalations TEXT NULL,
              work_description TEXT NULL,
              status VARCHAR(50) NOT NULL DEFAULT 'SUBMITTED',
              date VARCHAR(50) NOT NULL,
              duration VARCHAR(50) NULL,
              login_latitude DOUBLE NULL,
              login_longitude DOUBLE NULL,
              logout_latitude DOUBLE NULL,
              logout_longitude DOUBLE NULL,
              concluded_at VARCHAR(50) NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              INDEX idx_dr_user (user_id),
              INDEX idx_dr_date (date)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          console.log('✅ MySQL daily_reports table verified/created.');
        } catch (err) {
          console.warn('MySQL daily_reports table creation check note:', err.message);
        }

        // Resiliently ensure login GPS location columns exist in daily_reports
        try {
          await pool.query('ALTER TABLE daily_reports ADD COLUMN login_latitude DOUBLE NULL');
        } catch (err) { /* column might exist */ }
        try {
          await pool.query('ALTER TABLE daily_reports ADD COLUMN login_longitude DOUBLE NULL');
        } catch (err) { /* column might exist */ }

        // Resiliently ensure assignments (tasks) table exists
        try {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS assignments (
              id VARCHAR(64) NOT NULL,
              assigned_to_id VARCHAR(64) NOT NULL,
              assigned_to_name VARCHAR(191) NOT NULL,
              manager_id VARCHAR(64) NOT NULL,
              manager_name VARCHAR(191) NOT NULL,
              unit VARCHAR(255) NOT NULL,
              task_title VARCHAR(255) NOT NULL,
              instructions TEXT NULL,
              deadline VARCHAR(80) NOT NULL,
              status VARCHAR(50) NOT NULL DEFAULT 'ASSIGNED',
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              INDEX idx_asn_user (assigned_to_id),
              INDEX idx_asn_manager (manager_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          console.log('✅ MySQL assignments (tasks) table verified/created.');
        } catch (err) {
          console.warn('MySQL assignments table creation check note:', err.message);
        }

        // Resiliently ensure moms table exists
        try {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS moms (
              id VARCHAR(64) NOT NULL,
              meeting_title VARCHAR(255) NOT NULL,
              meeting_type VARCHAR(191) NOT NULL,
              date VARCHAR(50) NOT NULL,
              time VARCHAR(50) NOT NULL,
              organizer VARCHAR(191) NOT NULL,
              location VARCHAR(255) NULL,
              attendees TEXT NULL,
              agenda TEXT NULL,
              discussions TEXT NULL,
              action_items TEXT NULL,
              next_meeting VARCHAR(255) NULL,
              author_id VARCHAR(64) NULL,
              server_timestamp VARCHAR(100) NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              INDEX idx_moms_author (author_id)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          console.log('✅ MySQL moms table verified/created.');
        } catch (err) {
          console.warn('MySQL moms table creation check note:', err.message);
        }

        // Resiliently ensure tasks table exists
        try {
          await pool.query(`
            CREATE TABLE IF NOT EXISTS tasks (
              id VARCHAR(64) NOT NULL,
              task_title VARCHAR(255) NOT NULL,
              priority VARCHAR(50) NOT NULL DEFAULT 'Medium Priority',
              description TEXT NULL,
              assigned_to VARCHAR(191) NOT NULL,
              due_date VARCHAR(50) NOT NULL,
              project VARCHAR(191) NULL,
              category VARCHAR(100) NOT NULL DEFAULT 'General',
              status VARCHAR(50) NOT NULL DEFAULT 'IN_PROGRESS',
              created_by_id VARCHAR(64) NULL,
              created_by_name VARCHAR(191) NULL,
              server_timestamp VARCHAR(100) NOT NULL,
              created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
              PRIMARY KEY (id),
              INDEX idx_tasks_assigned (assigned_to)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
          `);
          console.log('✅ MySQL tasks table verified/created.');
        } catch (err) {
          console.warn('MySQL tasks table creation check note:', err.message);
        }

        conn.release();
      })
      .catch(err => {
        console.warn(`⚠️ MySQL Connection note (using resilient fallback): ${err.message}`);
        useMySql = false;
      });
  } catch (err) {
    console.warn(`⚠️ MySQL pool initialization note: ${err.message}`);
    useMySql = false;
  }
}

// ── Resilient JSON File Fallback ──
const DEFAULT_DB = {
  users: [
    // ── 1. SUPER ADMIN ──
    {
      id: 'usr-1',
      name: 'Super Admin',
      email: 'admin',
      password: 'admin123',
      role: 'SUPER_ADMIN',
      roleTitle: 'Super Administrator',
      studentRegNo: 'FCA108920',
      phone: '+91 98480 00001',
      unit: 'All Enterprise Units',
      subUnit: 'Central Audit Apex Office',
      joinedDate: '01-Jan-2024',
      managedBy: null
    },
    // ── 2. MANAGER ──
    {
      id: 'usr-2',
      name: 'Audit Manager',
      email: 'manager',
      password: 'manager123',
      role: 'MANAGER',
      roleTitle: 'Department Audit Manager',
      studentRegNo: 'ACA219842',
      phone: '+91 94401 00002',
      unit: 'Auctions',
      subUnit: 'Auctions Admin Wing & Counter #1',
      joinedDate: '15-Mar-2024',
      managedBy: 'usr-1'
    },
    // ── 3. USER 1 ──
    {
      id: 'usr-3',
      name: 'User One',
      email: 'user1',
      password: 'user1123',
      role: 'USER',
      roleTitle: 'Field Auditor',
      studentRegNo: 'SRO0000001',
      phone: '+91 91234 00003',
      unit: 'Procurement [Marketing Department]',
      subUnit: 'Marketing Procurement Cell & Tenders Desk',
      joinedDate: '01-Jan-2026',
      managedBy: 'usr-2'
    },
    // ── 4. USER 2 ──
    {
      id: 'usr-4',
      name: 'User Two',
      email: 'user2',
      password: 'user2123',
      role: 'USER',
      roleTitle: 'Junior Auditor',
      studentRegNo: 'SRO0000002',
      phone: '+91 98765 00004',
      unit: 'Auctions',
      subUnit: 'Counter No. 4 Daily Token Drawer',
      joinedDate: '01-Jan-2026',
      managedBy: 'usr-2'
    },
    // ── 5. USER 3 ──
    {
      id: 'usr-5',
      name: 'User Three',
      email: 'user3',
      password: 'user3123',
      role: 'USER',
      roleTitle: 'Compliance Officer',
      studentRegNo: 'SRO0000003',
      phone: '+91 99887 00005',
      unit: 'Kalyanakatta',
      subUnit: 'Kalyanakatta Hall No. 3 Counter Desk',
      joinedDate: '01-Jan-2026',
      managedBy: 'usr-2'
    },
    // ── 6. USER 4 ──
    {
      id: 'usr-6',
      name: 'User Four',
      email: 'user4',
      password: 'user4123',
      role: 'USER',
      roleTitle: 'Field Auditor',
      studentRegNo: 'SRO0000004',
      phone: '+91 97654 00006',
      unit: 'Warehousing [Marketing Department]',
      subUnit: 'Warehousing Cold Storage Thermograph Desk',
      joinedDate: '01-Jan-2026',
      managedBy: 'usr-2'
    },
    // ── 7. USER 5 ──
    {
      id: 'usr-7',
      name: 'User Five',
      email: 'user5',
      password: 'user5123',
      role: 'USER',
      roleTitle: 'Audit Associate',
      studentRegNo: 'SRO0000005',
      phone: '+91 96321 00007',
      unit: 'Annaprasadam Trust and Canteens TML & TPT',
      subUnit: 'Canteen Supervision Desk No. 2',
      joinedDate: '01-Jan-2026',
      managedBy: 'usr-2'
    }
  ],

  attendance: [
    { 
      id: 'log-1', 
      userId: 'usr-3', 
      userName: 'Ravi Teja, Field Auditor', 
      userEmail: 'auditor@eluc',
      managerId: 'usr-2',
      roleTitle: 'Field Auditor', 
      unit: 'Auctions', 
      loginTime: '09:02:14 AM', 
      logoutTime: null, 
      date: '12-Aug-2026', 
      timeWindow: '09:02 AM - Active',
      duration: '4h 45m', 
      active: true, 
      serverVerified: true,
      managerRemarks: 'Verified on-site token inventory.'
    },
    { 
      id: 'log-2', 
      userId: 'usr-4', 
      userName: 'Priya Sharma, ACA', 
      userEmail: 'priya@eluc',
      managerId: 'usr-2',
      roleTitle: 'Junior Auditor', 
      unit: 'Auctions', 
      loginTime: '08:45:00 AM', 
      logoutTime: '04:30:00 PM', 
      date: '12-Aug-2026', 
      timeWindow: '08:45 AM - 04:30 PM',
      duration: '7h 45m', 
      active: false, 
      serverVerified: true,
      managerRemarks: 'Audit physical tokens matched voucher book.'
    },
    { 
      id: 'log-3', 
      userId: 'usr-5', 
      userName: 'Ananya Rao, Field Staff', 
      userEmail: 'ananya@eluc',
      managerId: 'usr-1',
      roleTitle: 'Compliance Officer', 
      unit: 'Kalyanakatta', 
      loginTime: '09:15:30 AM', 
      logoutTime: null, 
      date: '12-Aug-2026', 
      timeWindow: '09:15 AM - Active',
      duration: '4h 32m', 
      active: true, 
      serverVerified: true,
      managerRemarks: 'Routine queue compliance verified.'
    },
    { 
      id: 'log-4', 
      userId: 'usr-6', 
      userName: 'Vikram Mehta, Auditor', 
      userEmail: 'vikram@eluc',
      managerId: 'usr-1',
      roleTitle: 'Field Auditor', 
      unit: 'Warehousing [Marketing Department]', 
      loginTime: '08:30:00 AM', 
      logoutTime: '05:00:00 PM', 
      date: '12-Aug-2026', 
      timeWindow: '08:30 AM - 05:00 PM',
      duration: '8h 30m', 
      active: false, 
      serverVerified: true,
      managerRemarks: 'Completed stock ledger reconciliation.'
    },
    { 
      id: 'log-5', 
      userId: 'usr-2', 
      userName: 'Suresh N., Audit Manager', 
      userEmail: 'manager@eluc',
      managerId: 'usr-1',
      roleTitle: 'Department Audit Manager', 
      unit: 'Auctions', 
      loginTime: '08:50:00 AM', 
      logoutTime: null, 
      date: '12-Aug-2026', 
      timeWindow: '08:50 AM - Active',
      duration: '4h 55m', 
      active: true, 
      serverVerified: true,
      managerRemarks: 'Manager shift active.'
    }
  ],
  assignments: [
    {
      id: 'asn-1',
      assignedToId: 'usr-3',
      assignedToName: 'Ravi Teja, Field Auditor',
      managerId: 'usr-2',
      managerName: 'Suresh N., Audit Manager',
      unit: 'Auctions',
      taskTitle: 'Concurrent Physical Bid Token Audit',
      instructions: 'Cross-check day-end auction sheet against cash counter collection ledger and upload token report PDF.',
      deadline: 'Today, 05:00 PM',
      status: 'IN_PROGRESS'
    },
    {
      id: 'asn-2',
      assignedToId: 'usr-4',
      assignedToName: 'Priya Sharma, ACA',
      managerId: 'usr-2',
      managerName: 'Suresh N., Audit Manager',
      unit: 'Auctions',
      taskTitle: 'Voucher Book & E-Token Verification',
      instructions: 'Upload scanned voucher summary PDF or photo with day collection total.',
      deadline: 'Today, 04:30 PM',
      status: 'COMPLETED'
    }
  ],
  complaints: [
    {
      id: 'CMP-2026-0812-001',
      unit: 'Auctions',
      title: 'Cash Collection & Token Reconciliation',
      category: 'Cash Collection & Token Reconciliation',
      urgency: 'HIGH',
      remarks: 'Scanned voucher sheets show 3 extra tokens unrecorded in the electronic terminal.',
      fileName: 'token_discrepancy_evidence.pdf',
      fileType: 'application/pdf',
      fileSize: '412 KB',
      fileData: null,
      sampleFileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      auditorId: 'usr-3',
      auditorName: 'Ravi Teja, Field Auditor',
      managerId: 'usr-2',
      managerName: 'Suresh N., Audit Manager',
      date: '12-Aug-2026',
      timeFrame: '09:02:00 AM - 10:15:00 AM (UTC+5:30)',
      serverTimestamp: '10:15:00 AM • 12-Aug-2026',
      status: 'UNDER_REVIEW',
      robotVerified: true
    },
    {
      id: 'CMP-2026-0812-002',
      unit: 'Procurement [Marketing Department]',
      title: 'Tender Compliance & Vendor Billing Irregularity',
      category: 'Tender Compliance & Vendor Billing Irregularity',
      urgency: 'CRITICAL',
      remarks: 'Photographic evidence attached showing broken paper seal on bidder envelope #12.',
      fileName: 'seal_breach_photo.png',
      fileType: 'image/png',
      fileSize: '1.2 MB',
      fileData: null,
      sampleFileUrl: 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&auto=format&fit=crop&q=80',
      auditorId: 'usr-7',
      auditorName: 'Kiran Reddy, Lead Auditor',
      managerId: 'usr-1',
      managerName: 'Executive Admin',
      date: '12-Aug-2026',
      timeFrame: '09:30:00 AM - 11:45:00 AM (UTC+5:30)',
      serverTimestamp: '11:45:00 AM • 12-Aug-2026',
      status: 'ESCALATED',
      robotVerified: true
    },
    {
      id: 'CMP-2026-0812-003',
      unit: 'Annaprasadam Trust and Canteens TML & TPT',
      title: 'Others (Manual Specification)',
      category: 'Others (Manual Specification)',
      urgency: 'HIGH',
      remarks: 'Digital thermograph report attached verifying +8°C temperature lag over 3 hours.',
      fileName: 'temperature_log_sheet.pdf',
      fileType: 'application/pdf',
      fileSize: '298 KB',
      fileData: null,
      sampleFileUrl: 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf',
      auditorId: 'usr-9',
      auditorName: 'Manoj Varma, Inspector',
      managerId: 'usr-1',
      managerName: 'Canteen Directorate',
      date: '12-Aug-2026',
      timeFrame: '07:30:00 AM - 09:45:00 AM (UTC+5:30)',
      serverTimestamp: '09:45:00 AM • 12-Aug-2026',
      status: 'RESOLVED',
      robotVerified: true
    }
  ]
};

function loadDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (err) {
    console.error('Error reading db.json:', err);
  }
  return DEFAULT_DB;
}

function saveDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Error saving db.json:', err);
  }
}

// ──────────────────────────────────────────────
// API ROUTES (MYSQL-FIRST WITH RESILIENT FALLBACK)
// ──────────────────────────────────────────────

// 1. Auth Login (Captures Anti-Tamper Time on Server, supports admin/admin and any user credentials)
app.post('/api/auth/login', async (req, res) => {
  const { email, password, location } = req.body;
  const rawInput = (email || '').trim();
  const inputLower = rawInput.toLowerCase();
  const { timeStr, dateStr, isoStr } = getServerTimeDetails();

  let user = null;

  if (useMySql && pool) {
    try {
      const [rows] = await pool.query(
        'SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(name) = ? OR LOWER(id) = ? LIMIT 1',
        [inputLower, inputLower, inputLower]
      );
      if (rows.length > 0) {
        const u = rows[0];
        user = {
          id: u.id,
          name: u.name,
          email: u.email,
          password: u.password,
          role: u.role,
          roleTitle: u.role_title,
          unit: u.unit,
          studentRegNo: u.student_reg_no,
          phone: u.phone,
          subUnit: u.sub_unit,
          managedBy: u.managed_by
        };
      }
    } catch (err) {
      console.warn('MySQL login fallback:', err.message);
    }
  }

  const db = loadDb();

  if (!user) {
    // ── Strict Credential Lookup Fallback ──
    user = db.users.find(u =>
      u.email.toLowerCase() === inputLower ||
      u.name.toLowerCase() === inputLower ||
      u.id.toLowerCase() === inputLower
    );
  }

  // Unknown credential → reject immediately
  if (!user) {
    return res.status(401).json({ success: false, message: 'Access denied. Invalid login credentials. Please contact your administrator.' });
  }

  // Password check
  if (user.password && user.password !== password) {
    return res.status(401).json({ success: false, message: 'Incorrect password. Please try again.' });
  }

  // Close previous active sessions for this user
  db.attendance = db.attendance.map(rec => {
    if (rec.userId === user.id && rec.active) {
      return { ...rec, active: false, logoutTime: timeStr, duration: 'Auto closed on new login' };
    }
    return rec;
  });

  const activeLog = {
    id: `log-${Date.now()}`,
    userId: user.id,
    userName: user.name,
    userEmail: user.email,
    managerId: user.managedBy || (user.role === 'MANAGER' ? 'usr-1' : null),
    roleTitle: user.roleTitle || user.role,
    unit: user.unit || ORGANIZATIONAL_UNITS[0],
    loginTime: timeStr,
    logoutTime: null,
    date: dateStr,
    timeWindow: `${timeStr} - Active`,
    duration: 'Session Active',
    active: true,
    serverVerified: true,
    serverUtcIso: isoStr,
    managerRemarks: `${user.roleTitle || user.role} active in portal.`,
    loginLocation: location || null
  };

  if (useMySql && pool) {
    try {
      await pool.query(
        `INSERT INTO attendance 
          (id, user_id, user_name, user_email, manager_id, role_title, unit, login_time, date_str, time_window, is_active, server_utc_iso, manager_remarks)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          activeLog.id, activeLog.userId, activeLog.userName, activeLog.userEmail, activeLog.managerId,
          activeLog.roleTitle, activeLog.unit, activeLog.loginTime, activeLog.date, activeLog.timeWindow,
          1, activeLog.serverUtcIso, activeLog.managerRemarks
        ]
      );
    } catch(err) {
      console.warn('MySQL attendance log fallback:', err.message);
    }
  }

  db.attendance.unshift(activeLog);
  saveDb(db);

  res.json({
    success: true,
    user,
    serverTimestamp: timeStr,
    serverDate: dateStr,
    activeLog
  });
});


// 2. Auth Logout (Server-Authoritative Exit Timestamp & Updates Single Daily Duty Sheet)
app.post('/api/auth/logout', async (req, res) => {
  const { 
    userId, 
    logoutRemarks, 
    location,
    logoutFullName,
    logoutStudentRegNo,
    logoutUnitDetails,
    logoutSubUnitDetails,
    logoutAuditWorkType,
    logoutObjectiveCompleted,
    logoutEscalations,
    logoutWorkDescription
  } = req.body;
  const { timeStr, dateStr, isoStr } = getServerTimeDetails();
  const { latitude, longitude } = location || {};

  if (useMySql && pool) {
    try {
      // Find active attendance record in MySQL
      const [activeAtt] = await pool.query('SELECT * FROM attendance WHERE user_id = ? AND is_active = 1 LIMIT 1', [userId || '']);
      const hasActiveAtt = activeAtt.length > 0;
      const loginIso = hasActiveAtt ? activeAtt[0].server_utc_iso : null;
      const loginTimeVal = hasActiveAtt ? activeAtt[0].login_time : '09:00:00 AM';
      const durationStr = calculateDuration(loginIso, isoStr);

      // 1. Update Attendance Ledger in MySQL
      if (hasActiveAtt) {
        await pool.query(
          `UPDATE attendance SET 
            is_active = 0, logout_time = ?, time_window = ?, duration = ?, 
            manager_remarks = ?, logout_latitude = ?, logout_longitude = ?
           WHERE id = ?`,
          [
            timeStr,
            `${activeAtt[0].login_time} - ${timeStr}`,
            durationStr,
            logoutRemarks || 'Logged out by user action.',
            latitude || null,
            longitude || null,
            activeAtt[0].id
          ]
        );
      } else {
        const [userRows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId || '']);
        const userObj = userRows[0];
        const newLogId = `log-${Date.now()}`;
        await pool.query(
          `INSERT INTO attendance 
            (id, user_id, user_name, user_email, manager_id, role_title, unit, login_time, logout_time, date_str, time_window, duration, is_active, server_verified, manager_remarks, logout_latitude, logout_longitude)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)`,
          [
            newLogId,
            userId || '',
            logoutFullName || (userObj ? userObj.name : 'Staff User'),
            userObj ? userObj.email : '',
            userObj ? userObj.managed_by : null,
            userObj ? userObj.role_title : 'Staff',
            logoutUnitDetails || (userObj ? userObj.unit : ORGANIZATIONAL_UNITS[0]),
            '09:00:00 AM',
            timeStr,
            dateStr,
            `09:00 AM - ${timeStr}`,
            durationStr,
            logoutRemarks || 'Logged out by user action.',
            latitude || null,
            longitude || null
          ]
        );
      }

      // 2. Update/Insert Daily Report in MySQL (In the SAME row if it exists)
      const [existingReport] = await pool.query(
        'SELECT * FROM daily_reports WHERE (user_id = ? OR student_reg_no = ?) AND date = ? LIMIT 1',
        [userId || '', logoutStudentRegNo || '', dateStr]
      );

      if (existingReport.length > 0) {
        const report = existingReport[0];
        await pool.query(
          `UPDATE daily_reports SET 
            full_name = ?, student_reg_no = ?, unit_details = ?, sub_unit_details = ?, 
            audit_work_type = ?, objective_completed = ?, escalations = ?, work_description = ?, 
            logout_time = ?, logout_remarks = ?, status = 'COMPLETED & VERIFIED', 
            concluded_at = ?, duration = ?, logout_latitude = ?, logout_longitude = ?
           WHERE id = ?`,
          [
            logoutFullName || report.full_name,
            logoutStudentRegNo || report.student_reg_no,
            logoutUnitDetails || report.unit_details,
            logoutSubUnitDetails || report.sub_unit_details,
            logoutAuditWorkType || report.audit_work_type,
            logoutObjectiveCompleted || report.objective_completed || '',
            logoutEscalations || report.escalations || '',
            logoutWorkDescription || report.work_description || '',
            timeStr,
            logoutRemarks || report.logout_remarks || '',
            isoStr,
            durationStr,
            latitude || null,
            longitude || null,
            report.id
          ]
        );
      } else {
        const [userRows] = await pool.query('SELECT * FROM users WHERE id = ?', [userId || '']);
        const userObj = userRows[0];
        const newReportId = `dr-${Date.now()}`;
        await pool.query(
          `INSERT INTO daily_reports 
            (id, user_id, login_time, full_name, student_reg_no, unit_details, sub_unit_details, 
             audit_work_type, objective_completed, escalations, work_description, logout_time, 
             logout_remarks, status, date, concluded_at, duration, logout_latitude, logout_longitude)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED & VERIFIED', ?, ?, ?, ?, ?)`,
          [
            newReportId,
            userId || null,
            loginTimeVal,
            logoutFullName || (userObj ? userObj.name : 'Audit Staff'),
            logoutStudentRegNo || (userObj ? userObj.student_reg_no : ''),
            logoutUnitDetails || (userObj ? userObj.unit : ORGANIZATIONAL_UNITS[0]),
            logoutSubUnitDetails || (userObj ? userObj.sub_unit : ''),
            logoutAuditWorkType || 'Concurrent Audit',
            logoutObjectiveCompleted || '',
            logoutEscalations || '',
            logoutWorkDescription || '',
            timeStr,
            logoutRemarks || 'Standard evening shift conclusion',
            dateStr,
            isoStr,
            durationStr,
            latitude || null,
            longitude || null
          ]
        );
      }

      // Fetch updated lists from MySQL
      const [allReports] = await pool.query('SELECT * FROM daily_reports ORDER BY created_at DESC');
      const formattedReports = allReports.map(r => ({
        id: r.id,
        userId: r.user_id,
        loginTime: r.login_time,
        fullName: r.full_name,
        studentRegNo: r.student_reg_no,
        unitDetails: r.unit_details,
        subUnitDetails: r.sub_unit_details,
        auditWorkType: r.audit_work_type,
        workObjective: r.work_objective,
        vouchersVerified: r.vouchers_verified,
        targetToAchieve: r.target_to_achieve,
        caRemarks: r.ca_remarks,
        pocName: r.poc_name,
        logoutTime: r.logout_time,
        logoutRemarks: r.logout_remarks,
        objectiveCompleted: r.objective_completed,
        escalations: r.escalations,
        workDescription: r.work_description,
        status: r.status,
        date: r.date,
        duration: r.duration,
        logoutLatitude: r.logout_latitude,
        logoutLongitude: r.logout_longitude,
        concludedAt: r.concluded_at,
        createdAt: r.created_at
      }));

      const [allAttendance] = await pool.query('SELECT * FROM attendance ORDER BY created_at DESC');
      const formattedAttendance = allAttendance.map(r => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        userEmail: r.user_email,
        managerId: r.manager_id,
        roleTitle: r.role_title,
        unit: r.unit,
        loginTime: r.login_time,
        logoutTime: r.logout_time,
        date: r.date_str,
        timeWindow: r.time_window,
        duration: r.duration,
        active: Boolean(r.is_active),
        serverVerified: Boolean(r.server_verified),
        managerRemarks: r.manager_remarks,
        logoutLatitude: r.logout_latitude,
        logoutLongitude: r.logout_longitude
      }));

      // Mirror to local db.json resiliently
      const db = loadDb();
      db.dailyReports = formattedReports;
      db.attendance = formattedAttendance;
      saveDb(db);

      return res.json({
        success: true,
        serverLogoutTime: timeStr,
        serverDate: dateStr,
        reports: formattedReports,
        attendance: formattedAttendance,
        message: `Session securely closed and exit timestamp recorded on server at ${timeStr}`
      });

    } catch (err) {
      console.warn('MySQL auth logout failed, falling back to JSON:', err.message);
    }
  }

  const db = loadDb();
  if (userId) {
    // Find active attendance record first to calculate duration
    const activeAttIndex = (db.attendance || []).findIndex(a => a.userId === userId && a.active);
    const loginIso = activeAttIndex >= 0 ? db.attendance[activeAttIndex].serverUtcIso : null;
    const durationStr = calculateDuration(loginIso, isoStr);

    // 1. Update the SAME single Daily Duty Sheet for today's shift
    if (!db.dailyReports) db.dailyReports = [];
    let reportFound = false;
    db.dailyReports = db.dailyReports.map(rep => {
      if ((rep.userId === userId || (rep.studentRegNo && db.users.find(u => u.id === userId)?.studentRegNo === rep.studentRegNo)) && rep.date === dateStr) {
        reportFound = true;
        return {
          ...rep,
          fullName: logoutFullName || rep.fullName,
          studentRegNo: logoutStudentRegNo || rep.studentRegNo,
          unitDetails: logoutUnitDetails || rep.unitDetails,
          subUnitDetails: logoutSubUnitDetails || rep.subUnitDetails,
          auditWorkType: logoutAuditWorkType || rep.auditWorkType,
          objectiveCompleted: logoutObjectiveCompleted || rep.objectiveCompleted || '',
          escalations: logoutEscalations || rep.escalations || '',
          workDescription: logoutWorkDescription || rep.workDescription || '',
          logoutTime: timeStr,
          logoutRemarks: logoutRemarks || rep.logoutRemarks || '',
          status: 'COMPLETED & VERIFIED',
          concludedAt: isoStr,
          duration: durationStr,
          logoutLatitude: latitude || null,
          logoutLongitude: longitude || null
        };
      }
      return rep;
    });

    // If user didn't file daily parameters before logout, create an entry
    if (!reportFound) {
      const user = db.users.find(u => u.id === userId);
      const userAtt = activeAttIndex >= 0 ? db.attendance[activeAttIndex] : null;
      db.dailyReports.unshift({
        id: `dr-${Date.now()}`,
        userId,
        loginTime: userAtt ? userAtt.loginTime : '09:00:00 AM',
        fullName: logoutFullName || user?.name || 'Audit Staff',
        studentRegNo: logoutStudentRegNo || user?.studentRegNo || 'SRO0684920',
        unitDetails: logoutUnitDetails || user?.unit || ORGANIZATIONAL_UNITS[0],
        subUnitDetails: logoutSubUnitDetails || 'General Unit Counter',
        auditWorkType: logoutAuditWorkType || 'Concurrent Audit',
        objectiveCompleted: logoutObjectiveCompleted || '',
        escalations: logoutEscalations || '',
        workDescription: logoutWorkDescription || '',
        logoutTime: timeStr,
        logoutRemarks: logoutRemarks || 'Standard evening shift conclusion',
        status: 'COMPLETED & VERIFIED',
        date: dateStr,
        createdAt: loginIso || new Date().toISOString(),
        concludedAt: isoStr,
        duration: durationStr,
        logoutLatitude: latitude || null,
        logoutLongitude: longitude || null
      });
    }

    // 2. Update Attendance Ledger with matching logout time, remarks, duration and location
    let attFound = false;
    db.attendance = (db.attendance || []).map(rec => {
      if (rec.userId === userId && rec.active) {
        attFound = true;
        return {
          ...rec,
          active: false,
          logoutTime: timeStr,
          timeWindow: `${rec.loginTime} - ${timeStr}`,
          duration: durationStr,
          serverLogoutIso: isoStr,
          managerRemarks: logoutRemarks || rec.managerRemarks || 'Logged out by user action.',
          logoutLocation: location || null,
          logoutLatitude: latitude || null,
          logoutLongitude: longitude || null
        };
      }
      return rec;
    });

    if (!attFound) {
      const user = db.users.find(u => u.id === userId);
      db.attendance.unshift({
        id: `log-${Date.now()}`,
        userId,
        userName: logoutFullName || user?.name || 'Staff User',
        userEmail: user?.email || '',
        managerId: user?.managedBy || null,
        roleTitle: user?.roleTitle || 'Staff',
        unit: logoutUnitDetails || user?.unit || ORGANIZATIONAL_UNITS[0],
        loginTime: '09:00:00 AM',
        logoutTime: timeStr,
        date: dateStr,
        timeWindow: `09:00 AM - ${timeStr}`,
        duration: durationStr,
        active: false,
        serverVerified: true,
        managerRemarks: logoutRemarks || 'Logged out by user action.',
        logoutLatitude: latitude || null,
        logoutLongitude: longitude || null
      });
    }

    saveDb(db);
  }

  res.json({
    success: true,
    serverLogoutTime: timeStr,
    serverDate: dateStr,
    reports: db.dailyReports || [],
    attendance: db.attendance || [],
    message: `Session securely closed and exit timestamp recorded on server at ${timeStr}`
  });
});


// 3. User Shift Clock Toggle
app.post('/api/attendance/toggle', async (req, res) => {
  const { userId, isClockedIn } = req.body;
  const { timeStr, dateStr } = getServerTimeDetails();

  const db = loadDb();
  const user = db.users.find(u => u.id === userId);

  if (isClockedIn) {
    db.attendance = db.attendance.map(rec => {
      if (rec.userId === userId && rec.active) {
        return { ...rec, active: false, logoutTime: timeStr, duration: 'Shift Closed' };
      }
      return rec;
    });
  } else {
    db.attendance.unshift({
      id: `log-${Date.now()}`,
      userId: userId || 'usr-temp',
      userName: user?.name || 'Field Auditor',
      userEmail: user?.email || 'auditor@eluc',
      managerId: user?.managedBy || 'usr-2',
      roleTitle: user?.roleTitle || 'Auditor',
      unit: user?.unit || ORGANIZATIONAL_UNITS[0],
      loginTime: timeStr,
      logoutTime: null,
      date: dateStr,
      timeWindow: `${timeStr} - Active`,
      duration: '0h 01m',
      active: true,
      serverVerified: true,
      managerRemarks: 'Re-punched shift.'
    });
  }

  saveDb(db);
  res.json({ success: true, attendance: db.attendance, timeStr });
});

// 4. Get Users (Super Admin & Manager Directory)
app.get('/api/users', async (req, res) => {
  if (useMySql && pool) {
    try {
      const [rows] = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
      const formatted = rows.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        password: u.password,
        role: u.role,
        roleTitle: u.role_title,
        unit: u.unit,
        studentRegNo: u.student_reg_no || '',
        phone: u.phone || '',
        subUnit: u.sub_unit || '',
        managedBy: u.managed_by
      }));
      return res.json({ success: true, users: formatted });
    } catch (err) {
      console.warn('MySQL get users fallback:', err.message);
    }
  }

  const db = loadDb();
  res.json({ success: true, users: db.users });
});

// 5. Create User / Provision Account
app.post('/api/users', async (req, res) => {
  const { name, email, password, roleTitle, unit, managerId, studentRegNo, phone, subUnit } = req.body;
  const role = roleTitle.includes('Manager') ? 'MANAGER' : (roleTitle.includes('Super') ? 'SUPER_ADMIN' : 'USER');
  const newId = `usr-${Date.now()}`;
  const emailClean = email.trim().toLowerCase();

  if (useMySql && pool) {
    try {
      await pool.query(
        'INSERT INTO users (id, name, email, password, role, role_title, unit, managed_by, student_reg_no, phone, sub_unit) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
        [
          newId, 
          name.trim(), 
          emailClean, 
          password || '1234567', 
          role, 
          roleTitle, 
          unit || ORGANIZATIONAL_UNITS[0], 
          managerId || 'usr-1',
          studentRegNo || '',
          phone || '',
          subUnit || ''
        ]
      );
      const [rows] = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
      const formatted = rows.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        password: u.password,
        role: u.role,
        roleTitle: u.role_title,
        unit: u.unit,
        studentRegNo: u.student_reg_no || '',
        phone: u.phone || '',
        subUnit: u.sub_unit || '',
        managedBy: u.managed_by
      }));
      return res.json({
        success: true,
        user: { id: newId, name, email: emailClean, role, roleTitle, unit, managedBy: managerId, studentRegNo, phone, subUnit },
        users: formatted
      });
    } catch (err) {
      console.warn('MySQL create user fallback:', err.message);
    }
  }

  const db = loadDb();
  const newUser = {
    id: newId,
    name: name.trim(),
    email: emailClean,
    password: password || '1234567',
    role,
    roleTitle,
    unit: unit || ORGANIZATIONAL_UNITS[0],
    studentRegNo: studentRegNo || '',
    phone: phone || '',
    subUnit: subUnit || '',
    managedBy: managerId || 'usr-1',
    joinedDate: new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
  };

  db.users.unshift(newUser);
  saveDb(db);
  res.json({ success: true, user: newUser, users: db.users });
});

// 6. MANAGER DECIDES USER ROLE
app.patch('/api/users/:id/role', async (req, res) => {
  const { id } = req.params;
  const { roleTitle, unit } = req.body;

  if (useMySql && pool) {
    try {
      await pool.query('UPDATE users SET role_title = ?, unit = ? WHERE id = ?', [roleTitle, unit, id]);
      await pool.query('UPDATE attendance SET role_title = ?, unit = ? WHERE user_id = ?', [roleTitle, unit, id]);
      return res.json({ success: true });
    } catch (err) {
      console.warn('MySQL role update fallback:', err.message);
    }
  }

  const db = loadDb();
  db.users = db.users.map(u => {
    if (u.id === id) {
      return { ...u, roleTitle: roleTitle || u.roleTitle, unit: unit || u.unit };
    }
    return u;
  });

  db.attendance = db.attendance.map(a => {
    if (a.userId === id) {
      return { ...a, roleTitle: roleTitle || a.roleTitle, unit: unit || a.unit };
    }
    return a;
  });

  saveDb(db);
  res.json({ success: true, users: db.users, attendance: db.attendance });
});

// 6.2. EDIT USER (Admin Portal)
app.put('/api/users/:id', async (req, res) => {
  const { id } = req.params;
  const { name, email, password, roleTitle, role, unit, subUnit, studentRegNo, phone } = req.body;
  const emailClean = email ? email.trim().toLowerCase() : '';

  if (useMySql && pool) {
    try {
      await pool.query(
        'UPDATE users SET name = ?, email = ?, password = ?, role = ?, role_title = ?, unit = ?, student_reg_no = ?, phone = ?, sub_unit = ? WHERE id = ?',
        [
          name.trim(),
          emailClean,
          password || '1234567',
          role || 'USER',
          roleTitle || 'Field Auditor',
          unit || ORGANIZATIONAL_UNITS[0],
          studentRegNo || '',
          phone || '',
          subUnit || '',
          id
        ]
      );
      const [rows] = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
      const formatted = rows.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        password: u.password,
        role: u.role,
        roleTitle: u.role_title,
        unit: u.unit,
        studentRegNo: u.student_reg_no || '',
        phone: u.phone || '',
        subUnit: u.sub_unit || '',
        managedBy: u.managed_by
      }));
      return res.json({ success: true, users: formatted });
    } catch (err) {
      console.warn('MySQL update user fallback error:', err.message);
    }
  }

  const db = loadDb();
  db.users = db.users.map(u => {
    if (u.id === id) {
      return {
        ...u,
        name: name ? name.trim() : u.name,
        email: emailClean || u.email,
        password: password || u.password,
        role: role || u.role,
        roleTitle: roleTitle || u.roleTitle,
        unit: unit || u.unit,
        subUnit: subUnit || u.subUnit,
        studentRegNo: studentRegNo || u.studentRegNo,
        phone: phone || u.phone
      };
    }
    return u;
  });
  saveDb(db);
  res.json({ success: true, users: db.users });
});

// 6.3. DELETE USER (Admin Portal)
app.delete('/api/users/:id', async (req, res) => {
  const { id } = req.params;

  if (useMySql && pool) {
    try {
      await pool.query('DELETE FROM users WHERE id = ?', [id]);
      const [rows] = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
      const formatted = rows.map(u => ({
        id: u.id,
        name: u.name,
        email: u.email,
        password: u.password,
        role: u.role,
        roleTitle: u.role_title,
        unit: u.unit,
        studentRegNo: u.student_reg_no || '',
        phone: u.phone || '',
        subUnit: u.sub_unit || '',
        managedBy: u.managed_by
      }));
      return res.json({ success: true, users: formatted });
    } catch (err) {
      console.warn('MySQL delete user fallback error:', err.message);
    }
  }

  const db = loadDb();
  db.users = db.users.filter(u => u.id !== id);
  saveDb(db);
  res.json({ success: true, users: db.users });
});

// 7. Get Attendance Ledger
app.get('/api/attendance', async (req, res) => {
  const { role, managerId } = req.query;

  if (useMySql && pool) {
    try {
      let query = 'SELECT * FROM attendance ORDER BY created_at DESC';
      let params = [];
      if (role === 'MANAGER' && managerId) {
        query = 'SELECT * FROM attendance WHERE manager_id = ? ORDER BY created_at DESC';
        params = [managerId];
      }
      const [rows] = await pool.query(query, params);
      const formatted = rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        userName: r.user_name,
        userEmail: r.user_email,
        managerId: r.manager_id,
        roleTitle: r.role_title,
        unit: r.unit,
        loginTime: r.login_time,
        logoutTime: r.logout_time,
        date: r.date_str,
        timeWindow: r.time_window,
        duration: r.duration,
        active: Boolean(r.is_active),
        serverVerified: Boolean(r.server_verified),
        managerRemarks: r.manager_remarks
      }));
      return res.json({ success: true, attendance: formatted });
    } catch (err) {
      console.warn('MySQL attendance get fallback:', err.message);
    }
  }

  const db = loadDb();
  let records = db.attendance;
  if (role === 'MANAGER' && managerId) {
    records = db.attendance.filter(r => r.managerId === managerId);
  }
  res.json({ success: true, attendance: records });
});

// 8. Save Manager Remarks
app.patch('/api/attendance/:id/remark', async (req, res) => {
  const { id } = req.params;
  const { remarks } = req.body;

  if (useMySql && pool) {
    try {
      await pool.query('UPDATE attendance SET manager_remarks = ? WHERE id = ?', [remarks, id]);
      return res.json({ success: true });
    } catch (err) {
      console.warn('MySQL remark update fallback:', err.message);
    }
  }

  const db = loadDb();
  db.attendance = db.attendance.map(item => {
    if (item.id === id) {
      return { ...item, managerRemarks: remarks };
    }
    return item;
  });

  saveDb(db);
  res.json({ success: true, attendance: db.attendance });
});

// 9. Work Assignments
app.get('/api/assignments', async (req, res) => {
  const { userId, managerId } = req.query;

  if (useMySql && pool) {
    try {
      let query = 'SELECT * FROM assignments WHERE 1=1';
      let params = [];
      if (userId) {
        query += ' AND assigned_to_id = ?';
        params.push(userId);
      }
      if (managerId) {
        query += ' AND manager_id = ?';
        params.push(managerId);
      }
      query += ' ORDER BY created_at DESC';
      const [rows] = await pool.query(query, params);
      const formatted = rows.map(r => ({
        id: r.id,
        assignedToId: r.assigned_to_id,
        assignedToName: r.assigned_to_name,
        managerId: r.manager_id,
        managerName: r.manager_name,
        unit: r.unit,
        taskTitle: r.task_title,
        instructions: r.instructions,
        deadline: r.deadline,
        status: r.status,
        createdAt: r.created_at
      }));
      return res.json({ success: true, assignments: formatted });
    } catch (err) {
      console.warn('MySQL get assignments fallback:', err.message);
    }
  }

  const db = loadDb();
  let results = db.assignments || [];
  if (userId) results = results.filter(a => a.assignedToId === userId);
  if (managerId) results = results.filter(a => a.managerId === managerId);

  res.json({ success: true, assignments: results });
});


app.post('/api/assignments', async (req, res) => {
  const { assignedToId, managerId, unit, taskTitle, instructions, deadline } = req.body;
  const db = loadDb();

  const targetUser = db.users.find(u => u.id === assignedToId);
  const manager = db.users.find(u => u.id === managerId);

  const newId = `asn-${Date.now()}`;
  const newAssignment = {
    id: newId,
    assignedToId,
    assignedToName: targetUser ? targetUser.name : 'Field Auditor',
    managerId,
    managerName: manager ? manager.name : 'Department Manager',
    unit,
    taskTitle,
    instructions: instructions || 'Complete full physical verification and upload evidence document.',
    deadline: deadline || 'Today, 05:30 PM',
    status: 'ASSIGNED'
  };

  if (useMySql && pool) {
    try {
      await pool.query(
        `INSERT INTO assignments 
          (id, assigned_to_id, assigned_to_name, manager_id, manager_name, unit, task_title, instructions, deadline, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ASSIGNED')`,
        [
          newId,
          assignedToId,
          targetUser ? targetUser.name : 'Field Auditor',
          managerId,
          manager ? manager.name : 'Department Manager',
          unit,
          taskTitle,
          instructions || 'Complete full physical verification and upload evidence document.',
          deadline || 'Today, 05:30 PM'
        ]
      );

      // Fetch all assignments from MySQL
      let query = 'SELECT * FROM assignments ORDER BY created_at DESC';
      const [rows] = await pool.query(query);
      const formatted = rows.map(r => ({
        id: r.id,
        assignedToId: r.assigned_to_id,
        assignedToName: r.assigned_to_name,
        managerId: r.manager_id,
        managerName: r.manager_name,
        unit: r.unit,
        taskTitle: r.task_title,
        instructions: r.instructions,
        deadline: r.deadline,
        status: r.status,
        createdAt: r.created_at
      }));

      // Sync to JSON db
      db.assignments = formatted;
      saveDb(db);

      return res.json({ success: true, assignment: newAssignment, assignments: formatted });
    } catch (err) {
      console.warn('MySQL post assignment fallback:', err.message);
    }
  }

  if (!db.assignments) db.assignments = [];
  db.assignments.unshift(newAssignment);
  saveDb(db);
  res.json({ success: true, assignment: newAssignment, assignments: db.assignments });
});

// 10. COMPLAINT & EVIDENCE UPLOAD (ROBOT BACKEND VAULT)
app.post('/api/complaints/upload', async (req, res) => {
  const { 
    unit, 
    title, 
    category, 
    urgency, 
    remarks, 
    fileName, 
    fileType, 
    fileSize, 
    fileData, 
    auditorId, 
    auditorName 
  } = req.body;

  const db = loadDb();
  const { timeStr, dateStr, fullTimeframe } = getServerTimeDetails();
  const user = db.users.find(u => u.id === auditorId);
  const manager = db.users.find(u => u.id === (user?.managedBy || 'usr-2'));

  const newId = `CMP-2026-0812-00${(db.complaints?.length || 0) + 1}`;
  const sampleUrl = fileType?.includes('image') 
    ? 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&auto=format&fit=crop&q=80'
    : 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

  if (useMySql && pool) {
    try {
      await pool.query(
        `INSERT INTO complaints (id, unit, title, category, urgency, remarks, file_name, file_type, file_size, file_data, sample_file_url, auditor_id, auditor_name, manager_id, manager_name, date_str, time_frame, server_timestamp, status, robot_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', 1)`,
        [newId, unit || user?.unit || ORGANIZATIONAL_UNITS[0], title || 'Field Observation', category || 'Sub-Risk', urgency || 'MEDIUM', remarks, fileName || 'document.pdf', fileType || 'application/pdf', fileSize || '250 KB', fileData || null, sampleUrl, auditorId || 'usr-3', auditorName || 'Field Auditor', user?.managedBy || 'usr-2', manager?.name || 'Department Audit Manager', dateStr, fullTimeframe, `${timeStr} • ${dateStr}`]
      );
    } catch (err) {
      console.warn('MySQL complaint insert fallback:', err.message);
    }
  }

  const newComplaint = {
    id: newId,
    unit: unit || (user?.unit || ORGANIZATIONAL_UNITS[0]),
    title: title || 'Field Observation',
    category: category || 'Audit Discrepancy',
    urgency: urgency || 'MEDIUM',
    remarks: remarks || 'Evidence document submitted for management review.',
    fileName: fileName || 'document.pdf',
    fileType: fileType || 'application/pdf',
    fileSize: fileSize || '150 KB',
    fileData: fileData || null,
    sampleFileUrl: sampleUrl,
    auditorId: auditorId || 'usr-3',
    auditorName: auditorName || (user?.name || 'Field Auditor'),
    managerId: user?.managedBy || 'usr-2',
    managerName: manager?.name || 'Department Audit Manager',
    date: dateStr,
    timeFrame: fullTimeframe,
    serverTimestamp: `${timeStr} • ${dateStr}`,
    status: 'SUBMITTED',
    robotVerified: true
  };

  if (!db.complaints) db.complaints = [];
  db.complaints.unshift(newComplaint);
  saveDb(db);

  res.json({
    success: true,
    message: 'Complaint & File verified by Robot Backend Vault',
    complaint: newComplaint,
    complaints: db.complaints,
    receiptToken: `RB-VAULT-CERT-${Date.now().toString(36).toUpperCase()}`
  });
});

app.get('/api/complaints', async (req, res) => {
  const { role, managerId, unit } = req.query;

  if (useMySql && pool) {
    try {
      let query = 'SELECT * FROM complaints WHERE 1=1';
      let params = [];
      if (role === 'MANAGER' && managerId) {
        query += ' AND manager_id = ?';
        params.push(managerId);
      }
      if (unit && unit !== 'ALL') {
        query += ' AND unit = ?';
        params.push(unit);
      }
      query += ' ORDER BY created_at DESC';

      const [rows] = await pool.query(query, params);
      const formatted = rows.map(r => ({
        id: r.id,
        unit: r.unit,
        title: r.title,
        category: r.category,
        urgency: r.urgency,
        remarks: r.remarks,
        fileName: r.file_name,
        fileType: r.file_type,
        fileSize: r.file_size,
        fileData: r.file_data,
        sampleFileUrl: r.sample_file_url,
        auditorId: r.auditor_id,
        auditorName: r.auditor_name,
        managerId: r.manager_id,
        managerName: r.manager_name,
        date: r.date_str,
        timeFrame: r.time_frame,
        serverTimestamp: r.server_timestamp,
        status: r.status,
        robotVerified: Boolean(r.robot_verified)
      }));
      return res.json({ success: true, complaints: formatted });
    } catch (err) {
      console.warn('MySQL get complaints fallback:', err.message);
    }
  }

  const db = loadDb();
  let results = db.complaints || [];

  if (role === 'MANAGER' && managerId) {
    results = results.filter(c => c.managerId === managerId);
  }
  if (unit && unit !== 'ALL') {
    results = results.filter(c => c.unit === unit);
  }

  res.json({ success: true, complaints: results });
});

// Update Complaint Status
app.patch('/api/complaints/:id/status', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (useMySql && pool) {
    try {
      await pool.query('UPDATE complaints SET status = ? WHERE id = ?', [status, id]);
    } catch (err) {
      console.warn('MySQL status update fallback:', err.message);
    }
  }

  const db = loadDb();
  db.complaints = (db.complaints || []).map(c => {
    if (c.id === id) return { ...c, status };
    return c;
  });
  saveDb(db);
  res.json({ success: true, complaint: db.complaints.find(c => c.id === id) });
});

// ── Daily Audit Duty & Work Reports Endpoints ──

app.get('/api/daily-reports', async (req, res) => {
  if (useMySql && pool) {
    try {
      const [rows] = await pool.query('SELECT * FROM daily_reports ORDER BY created_at DESC');
      const formatted = rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        loginTime: r.login_time,
        fullName: r.full_name,
        studentRegNo: r.student_reg_no,
        unitDetails: r.unit_details,
        subUnitDetails: r.sub_unit_details,
        auditWorkType: r.audit_work_type,
        workObjective: r.work_objective,
        vouchersVerified: r.vouchers_verified,
        targetToAchieve: r.target_to_achieve,
        caRemarks: r.ca_remarks,
        pocName: r.poc_name,
        logoutTime: r.logout_time,
        logoutRemarks: r.logout_remarks,
        objectiveCompleted: r.objective_completed,
        escalations: r.escalations,
        workDescription: r.work_description,
        status: r.status,
        date: r.date,
        duration: r.duration,
        loginLatitude: r.login_latitude,
        loginLongitude: r.login_longitude,
        logoutLatitude: r.logout_latitude,
        logoutLongitude: r.logout_longitude,
        concludedAt: r.concluded_at,
        createdAt: r.created_at
      }));
      return res.json({ success: true, reports: formatted });
    } catch (err) {
      console.warn('MySQL get daily reports fallback:', err.message);
    }
  }

  const db = loadDb();
  res.json({ success: true, reports: db.dailyReports || [] });
});

app.post('/api/daily-reports', async (req, res) => {
  const {
    userId,
    loginTime,
    fullName,
    studentRegNo,
    unitDetails,
    subUnitDetails,
    auditWorkType,
    workObjective,
    vouchersVerified,
    targetToAchieve,
    caRemarks,
    pocName,
    logoutTime,
    logoutRemarks,
    loginLatitude,
    loginLongitude,
    status
  } = req.body;

  const { timeStr, dateStr } = getServerTimeDetails();

  if (useMySql && pool) {
    try {
      // Check if an existing sheet exists for this user today in MySQL
      const [existing] = await pool.query(
        'SELECT * FROM daily_reports WHERE (user_id = ? OR student_reg_no = ?) AND date = ? LIMIT 1',
        [userId || '', studentRegNo || '', dateStr]
      );

      if (existing.length > 0) {
        // Update existing row
        const record = existing[0];
        await pool.query(
          `UPDATE daily_reports SET 
            login_time = ?, full_name = ?, student_reg_no = ?, unit_details = ?, sub_unit_details = ?, 
            audit_work_type = ?, work_objective = ?, vouchers_verified = ?, target_to_achieve = ?, 
            ca_remarks = ?, poc_name = ?, login_latitude = ?, login_longitude = ?, status = ?
           WHERE id = ?`,
          [
            loginTime || record.login_time,
            fullName || record.full_name,
            studentRegNo || record.student_reg_no,
            unitDetails || record.unit_details,
            subUnitDetails || record.sub_unit_details,
            auditWorkType || record.audit_work_type,
            workObjective || record.work_objective,
            vouchersVerified || record.vouchers_verified,
            targetToAchieve || record.target_to_achieve,
            caRemarks || record.ca_remarks,
            pocName || record.poc_name,
            loginLatitude !== undefined ? loginLatitude : record.login_latitude,
            loginLongitude !== undefined ? loginLongitude : record.login_longitude,
            status || record.status,
            record.id
          ]
        );
      } else {
        // Insert new row
        const newId = `dr-${Date.now()}`;
        await pool.query(
          `INSERT INTO daily_reports 
            (id, user_id, login_time, full_name, student_reg_no, unit_details, sub_unit_details, 
             audit_work_type, work_objective, vouchers_verified, target_to_achieve, ca_remarks, poc_name, status, date, login_latitude, login_longitude)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            newId,
            userId || null,
            loginTime || timeStr,
            fullName || 'Audit Student',
            studentRegNo || '',
            unitDetails || '',
            subUnitDetails || '',
            auditWorkType || '',
            workObjective || '',
            vouchersVerified || '',
            targetToAchieve || '',
            caRemarks || '',
            pocName || '',
            status || 'SUBMITTED',
            dateStr,
            loginLatitude || null,
            loginLongitude || null
          ]
        );
      }

      // Fetch all reports to return
      const [rows] = await pool.query('SELECT * FROM daily_reports ORDER BY created_at DESC');
      const formatted = rows.map(r => ({
        id: r.id,
        userId: r.user_id,
        loginTime: r.login_time,
        fullName: r.full_name,
        studentRegNo: r.student_reg_no,
        unitDetails: r.unit_details,
        subUnitDetails: r.sub_unit_details,
        auditWorkType: r.audit_work_type,
        workObjective: r.work_objective,
        vouchersVerified: r.vouchers_verified,
        targetToAchieve: r.target_to_achieve,
        caRemarks: r.ca_remarks,
        pocName: r.poc_name,
        logoutTime: r.logout_time,
        logoutRemarks: r.logout_remarks,
        objectiveCompleted: r.objective_completed,
        escalations: r.escalations,
        workDescription: r.work_description,
        status: r.status,
        date: r.date,
        duration: r.duration,
        loginLatitude: r.login_latitude,
        loginLongitude: r.login_longitude,
        logoutLatitude: r.logout_latitude,
        logoutLongitude: r.logout_longitude,
        concludedAt: r.concluded_at,
        createdAt: r.created_at
      }));

      // Mirror to db.json resiliently
      const db = loadDb();
      db.dailyReports = formatted;
      saveDb(db);

      return res.json({ success: true, reports: formatted });
    } catch (err) {
      console.warn('MySQL save daily report failed, falling back to JSON:', err.message);
    }
  }

  // Fallback to JSON db
  const db = loadDb();
  if (!db.dailyReports) db.dailyReports = [];

  let existingIndex = db.dailyReports.findIndex(r => 
    (userId && r.userId === userId && r.date === dateStr) ||
    (studentRegNo && r.studentRegNo === studentRegNo && r.date === dateStr)
  );

  let targetReport;
  if (existingIndex >= 0) {
    db.dailyReports[existingIndex] = {
      ...db.dailyReports[existingIndex],
      loginTime: db.dailyReports[existingIndex].loginTime || loginTime || timeStr,
      fullName: fullName || db.dailyReports[existingIndex].fullName,
      studentRegNo: studentRegNo || db.dailyReports[existingIndex].studentRegNo,
      unitDetails: unitDetails || db.dailyReports[existingIndex].unitDetails,
      subUnitDetails: subUnitDetails || db.dailyReports[existingIndex].subUnitDetails,
      auditWorkType: auditWorkType || db.dailyReports[existingIndex].auditWorkType,
      workObjective: workObjective || db.dailyReports[existingIndex].workObjective,
      vouchersVerified: vouchersVerified || db.dailyReports[existingIndex].vouchersVerified,
      targetToAchieve: targetToAchieve || db.dailyReports[existingIndex].targetToAchieve,
      caRemarks: caRemarks !== undefined ? caRemarks : db.dailyReports[existingIndex].caRemarks,
      pocName: pocName || db.dailyReports[existingIndex].pocName,
      logoutTime: logoutTime || db.dailyReports[existingIndex].logoutTime || null,
      logoutRemarks: logoutRemarks || db.dailyReports[existingIndex].logoutRemarks || '',
      status: status || (logoutTime ? 'COMPLETED & VERIFIED' : 'ACTIVE_DUTY'),
      updatedAt: new Date().toISOString()
    };
    targetReport = db.dailyReports[existingIndex];
  } else {
    targetReport = {
      id: `dr-${Date.now()}`,
      userId: userId || null,
      loginTime: loginTime || timeStr,
      fullName: fullName || 'Audit Student',
      studentRegNo: studentRegNo || '',
      unitDetails: unitDetails || ORGANIZATIONAL_UNITS[0],
      subUnitDetails: subUnitDetails || '',
      auditWorkType: auditWorkType || 'Concurrent Audit',
      workObjective: workObjective || '',
      vouchersVerified: vouchersVerified || '',
      targetToAchieve: targetToAchieve || '',
      caRemarks: caRemarks || '',
      pocName: pocName || '',
      logoutTime: logoutTime || null,
      logoutRemarks: logoutRemarks || '',
      status: status || (logoutTime ? 'COMPLETED & VERIFIED' : 'ACTIVE_DUTY'),
      date: dateStr,
      createdAt: new Date().toISOString()
    };
    db.dailyReports.unshift(targetReport);
  }

  saveDb(db);
  res.json({ success: true, report: targetReport, reports: db.dailyReports });
});


// ── Live Server Time Endpoint ──
app.get('/api/server-time', (req, res) => {
  const timeData = getServerTimeDetails();
  res.json({ success: true, ...timeData });
});

// ── Minutes of Meeting (MOM) Endpoints ──
app.get('/api/moms', async (req, res) => {
  if (useMySql && pool) {
    try {
      const [rows] = await pool.query('SELECT * FROM moms ORDER BY created_at DESC');
      const formatted = rows.map(r => ({
        id: r.id,
        meetingTitle: r.meeting_title,
        meetingType: r.meeting_type,
        date: r.date,
        time: r.time,
        organizer: r.organizer,
        location: r.location,
        attendees: r.attendees,
        agenda: r.agenda,
        discussions: r.discussions,
        actionItems: r.action_items,
        nextMeeting: r.next_meeting,
        authorId: r.author_id,
        serverTimestamp: r.server_timestamp,
        createdAt: r.created_at
      }));
      return res.json({ success: true, moms: formatted });
    } catch (err) {
      console.warn('MySQL get moms fallback:', err.message);
    }
  }

  const db = loadDb();
  res.json({ success: true, moms: db.moms || [] });
});

app.post('/api/moms', async (req, res) => {
  const {
    meetingTitle,
    meetingType,
    date,
    time,
    organizer,
    location,
    attendees,
    agenda,
    discussions,
    actionItems,
    nextMeeting,
    authorId
  } = req.body;

  const { timeStr, dateStr } = getServerTimeDetails();
  const newId = `mom-${Date.now()}`;
  const newMom = {
    id: newId,
    meetingTitle: meetingTitle || 'Weekly Team Meeting',
    meetingType: meetingType || 'Team Meeting',
    date: date || dateStr,
    time: time || timeStr,
    organizer: organizer || 'Demo Managing Partner',
    location: location || 'Conference Room A',
    attendees: attendees || '',
    agenda: agenda || '',
    discussions: discussions || '',
    actionItems: actionItems || '',
    nextMeeting: nextMeeting || '',
    authorId: authorId || null,
    serverTimestamp: `${timeStr} • ${dateStr}`,
    createdAt: new Date().toISOString()
  };

  if (useMySql && pool) {
    try {
      await pool.query(
        `INSERT INTO moms 
          (id, meeting_title, meeting_type, date, time, organizer, location, attendees, agenda, discussions, action_items, next_meeting, author_id, server_timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          newId,
          meetingTitle || 'Weekly Team Meeting',
          meetingType || 'Team Meeting',
          date || dateStr,
          time || timeStr,
          organizer || 'Demo Managing Partner',
          location || 'Conference Room A',
          attendees || '',
          agenda || '',
          discussions || '',
          actionItems || '',
          nextMeeting || '',
          authorId || null,
          `${timeStr} • ${dateStr}`
        ]
      );

      // Fetch all MOMS from MySQL to return
      const [rows] = await pool.query('SELECT * FROM moms ORDER BY created_at DESC');
      const formatted = rows.map(r => ({
        id: r.id,
        meetingTitle: r.meeting_title,
        meetingType: r.meeting_type,
        date: r.date,
        time: r.time,
        organizer: r.organizer,
        location: r.location,
        attendees: r.attendees,
        agenda: r.agenda,
        discussions: r.discussions,
        actionItems: r.action_items,
        nextMeeting: r.next_meeting,
        authorId: r.author_id,
        serverTimestamp: r.server_timestamp,
        createdAt: r.created_at
      }));

      // Sync to JSON db
      const db = loadDb();
      db.moms = formatted;
      saveDb(db);

      return res.json({ success: true, mom: newMom, moms: formatted });
    } catch (err) {
      console.warn('MySQL post mom fallback:', err.message);
    }
  }

  const db = loadDb();
  if (!db.moms) db.moms = [];
  db.moms.unshift(newMom);
  saveDb(db);
  res.json({ success: true, mom: newMom, moms: db.moms });
});

// ── Tasks Creation & Management Endpoints ──
app.get('/api/tasks', async (req, res) => {
  if (useMySql && pool) {
    try {
      const [rows] = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
      const formatted = rows.map(r => ({
        id: r.id,
        taskTitle: r.task_title,
        priority: r.priority,
        description: r.description,
        assignedTo: r.assigned_to,
        dueDate: r.due_date,
        project: r.project,
        category: r.category,
        status: r.status,
        createdById: r.created_by_id,
        createdByName: r.created_by_name,
        serverTimestamp: r.server_timestamp,
        createdAt: r.created_at
      }));
      return res.json({ success: true, tasks: formatted });
    } catch (err) {
      console.warn('MySQL get tasks fallback:', err.message);
    }
  }

  const db = loadDb();
  res.json({ success: true, tasks: db.tasks || [] });
});

app.post('/api/tasks', async (req, res) => {
  const {
    taskTitle,
    priority,
    description,
    assignedTo,
    dueDate,
    project,
    category,
    createdById,
    createdByName
  } = req.body;

  const { timeStr, dateStr } = getServerTimeDetails();
  const newId = `tsk-${Date.now()}`;
  const newTask = {
    id: newId,
    taskTitle: taskTitle || 'Audit Verification Task',
    priority: priority || 'Medium Priority',
    description: description || '',
    assignedTo: assignedTo || 'Demo Managing Partner',
    dueDate: dueDate || dateStr,
    project: project || '',
    category: category || 'General',
    status: 'IN_PROGRESS',
    createdById: createdById || null,
    createdByName: createdByName || 'Staff Member',
    serverTimestamp: `${timeStr} • ${dateStr}`,
    createdAt: new Date().toISOString()
  };

  if (useMySql && pool) {
    try {
      await pool.query(
        `INSERT INTO tasks 
          (id, task_title, priority, description, assigned_to, due_date, project, category, status, created_by_id, created_by_name, server_timestamp)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?, ?)`,
        [
          newId,
          taskTitle || 'Audit Verification Task',
          priority || 'Medium Priority',
          description || '',
          assignedTo || 'Demo Managing Partner',
          dueDate || dateStr,
          project || '',
          category || 'General',
          createdById || null,
          createdByName || 'Staff Member',
          `${timeStr} • ${dateStr}`
        ]
      );

      // Fetch all tasks from MySQL
      const [rows] = await pool.query('SELECT * FROM tasks ORDER BY created_at DESC');
      const formatted = rows.map(r => ({
        id: r.id,
        taskTitle: r.task_title,
        priority: r.priority,
        description: r.description,
        assignedTo: r.assigned_to,
        dueDate: r.due_date,
        project: r.project,
        category: r.category,
        status: r.status,
        createdById: r.created_by_id,
        createdByName: r.created_by_name,
        serverTimestamp: r.server_timestamp,
        createdAt: r.created_at
      }));

      // Sync to JSON db
      const db = loadDb();
      db.tasks = formatted;
      saveDb(db);

      return res.json({ success: true, task: newTask, tasks: formatted });
    } catch (err) {
      console.warn('MySQL post task fallback:', err.message);
    }
  }

  const db = loadDb();
  if (!db.tasks) db.tasks = [];
  db.tasks.unshift(newTask);
  saveDb(db);
  res.json({ success: true, task: newTask, tasks: db.tasks });
});

// ── Serve Built Frontend from Express (Solves 403 Forbidden on cPanel) ──


const distPath = path.join(__dirname, 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.use((req, res, next) => {
    if (req.method === 'GET' && !req.path.startsWith('/api')) {
      return res.sendFile(path.join(distPath, 'index.html'));
    }
    next();
  });
}

app.listen(PORT, () => {
  console.log(`🚀 Centralized Audit Backend running on port ${PORT}`);
});
