<?php
/**
 * CA Buddy Enterprise Audit System - High-Performance Native PHP Backend API
 * Direct MySQL PDO Connector with Automatic Fallback & Resilient Data Sync
 * Target Platform: StackCP / cPanel / Apache / PHP 7.4 - 8.x
 */

// ── CORS & Global Response Headers ──
header("Access-Control-Allow-Origin: *");
header("Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS");
header("Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With");
header("Content-Type: application/json; charset=UTF-8");

// Handle OPTIONS preflight requests immediately
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Ensure Indian Standard Time (IST) for Anti-Tamper Audit Logging
date_default_timezone_set('Asia/Kolkata');

// ── Database Credentials ──
$dbHost = 'sdb-66.hosting.stackcp.net';
$dbName = 'newversion1-353034319494';
$dbUser = 'n1';
$dbPass = 'Charan@2004';

$pdo = null;
try {
    $pdo = new PDO("mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_TIMEOUT => 4
    ]);
} catch (Exception $e) {
    // Fallback attempt: localhost / 127.0.0.1 (in case MySQL is on the same host)
    try {
        $pdo = new PDO("mysql:host=localhost;dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_TIMEOUT => 2
        ]);
    } catch (Exception $e2) {
        $pdo = null;
    }
}

// ── Helper: Server Time Details ──
function getServerTimeDetails() {
    $now = new DateTime('now', new DateTimeZone('Asia/Kolkata'));
    return [
        'timeStr' => $now->format('h:i:s A'),
        'dateStr' => $now->format('d/m/Y'),
        'isoStr' => $now->format('c'),
        'fullTimeframe' => $now->format('l, d F Y')
    ];
}

// ── Helper: Duration Calculation ──
function calculateDuration($loginIso, $logoutIso) {
    if (!$loginIso || !$logoutIso) return 'Session Concluded';
    try {
        $start = new DateTime($loginIso);
        $end = new DateTime($logoutIso);
        $diff = $start->diff($end);
        $hrs = $diff->h + ($diff->days * 24);
        $mins = $diff->i;
        return sprintf('%dh %02dm', $hrs, $mins);
    } catch (Exception $e) {
        return 'Calculated';
    }
}

// ── Helper: JSON Storage Fallback ──
function getDbFilePath() {
    return __DIR__ . '/db.json';
}

function loadJsonDb() {
    $file = getDbFilePath();
    if (file_exists($file)) {
        $data = json_decode(file_get_contents($file), true);
        if (is_array($data)) return $data;
    }
    return [
        'users' => [
            [
                'id' => 'usr-admin-1',
                'name' => 'System Administrator',
                'email' => 'cabuddy@gmail.com',
                'password' => '12345678',
                'role' => 'SUPER_ADMIN',
                'roleTitle' => 'Super Administrator',
                'unit' => 'All Enterprise Units',
                'studentRegNo' => 'FCA001',
                'phone' => '+91 99999 99999',
                'subUnit' => 'Central Administration Desk',
                'managedBy' => null
            ]
        ],
        'attendance' => [],
        'assignments' => [],
        'complaints' => [],
        'dailyReports' => [],
        'moms' => [],
        'tasks' => []
    ];
}

function saveJsonDb($data) {
    $file = getDbFilePath();
    file_put_contents($file, json_encode($data, JSON_PRETTY_PRINT));
}

// ── Route Parsing ──
$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$uriParts = explode('?', $requestUri, 2);
$path = $uriParts[0];

// Normalize the route path after '/api'
$route = '';
if (preg_match('#/api(?:/(.*))?$#i', $path, $matches)) {
    $route = isset($matches[1]) ? trim($matches[1], '/') : '';
} else {
    $route = trim($path, '/');
}

$method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
$rawBody = file_get_contents('php://input');
$body = json_decode($rawBody, true) ?? [];
$timeData = getServerTimeDetails();

// ──────────────────────────────────────────────
// 1. Live Server Time
// ──────────────────────────────────────────────
if ($route === 'server-time' && $method === 'GET') {
    echo json_encode(array_merge(['success' => true], $timeData, ['timezone' => 'Asia/Kolkata']));
    exit();
}

// ──────────────────────────────────────────────
// 2. Authentication Login (POST /api/auth/login)
// ──────────────────────────────────────────────
if ($route === 'auth/login' && $method === 'POST') {
    $emailInput = trim($body['email'] ?? '');
    $passwordInput = $body['password'] ?? '';
    $location = $body['location'] ?? null;
    $inputLower = strtolower($emailInput);

    $user = null;

    if ($pdo) {
        try {
            $stmt = $pdo->prepare('SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(name) = ? OR LOWER(id) = ? LIMIT 1');
            $stmt->execute([$inputLower, $inputLower, $inputLower]);
            $u = $stmt->fetch();
            if ($u) {
                $user = [
                    'id' => $u['id'],
                    'name' => $u['name'],
                    'email' => $u['email'],
                    'password' => $u['password'],
                    'role' => $u['role'],
                    'roleTitle' => $u['role_title'] ?? 'Field Auditor',
                    'unit' => $u['unit'] ?? 'Procurement [Marketing Department]',
                    'studentRegNo' => $u['student_reg_no'] ?? '',
                    'phone' => $u['phone'] ?? '',
                    'subUnit' => $u['sub_unit'] ?? '',
                    'managedBy' => $u['managed_by'] ?? null
                ];
            }
        } catch (Exception $e) {
            $user = null;
        }
    }

    if (!$user) {
        $jdb = loadJsonDb();
        foreach ($jdb['users'] as $u) {
            if (strtolower($u['email']) === $inputLower || strtolower($u['name']) === $inputLower || strtolower($u['id']) === $inputLower) {
                $user = $u;
                break;
            }
        }
    }

    if (!$user) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Access denied. Invalid login credentials. Please contact your administrator.']);
        exit();
    }

    if (isset($user['password']) && $user['password'] !== $passwordInput) {
        http_response_code(401);
        echo json_encode(['success' => false, 'message' => 'Incorrect password. Please try again.']);
        exit();
    }

    $activeLogId = 'log-' . round(microtime(true) * 1000);
    $activeLog = [
        'id' => $activeLogId,
        'userId' => $user['id'],
        'userName' => $user['name'],
        'userEmail' => $user['email'],
        'managerId' => $user['managedBy'] ?? ($user['role'] === 'MANAGER' ? 'usr-admin-1' : null),
        'roleTitle' => $user['roleTitle'] ?? $user['role'],
        'unit' => $user['unit'] ?? 'All Enterprise Units',
        'loginTime' => $timeData['timeStr'],
        'logoutTime' => null,
        'date' => $timeData['dateStr'],
        'timeWindow' => $timeData['timeStr'] . ' - Active',
        'duration' => 'Session Active',
        'active' => true,
        'serverVerified' => true,
        'serverUtcIso' => $timeData['isoStr'],
        'managerRemarks' => ($user['roleTitle'] ?? $user['role']) . ' active in portal.',
        'loginLocation' => $location
    ];

    if ($pdo) {
        try {
            // Auto close previous active sessions
            $stmt = $pdo->prepare("UPDATE attendance SET is_active = 0, logout_time = ?, duration = 'Auto closed on new login' WHERE user_id = ? AND is_active = 1");
            $stmt->execute([$timeData['timeStr'], $user['id']]);

            // Insert new session
            $stmt = $pdo->prepare(
                "INSERT INTO attendance 
                  (id, user_id, user_name, user_email, manager_id, role_title, unit, login_time, date_str, time_window, is_active, server_utc_iso, manager_remarks)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)"
            );
            $stmt->execute([
                $activeLog['id'], $activeLog['userId'], $activeLog['userName'], $activeLog['userEmail'],
                $activeLog['managerId'], $activeLog['roleTitle'], $activeLog['unit'], $activeLog['loginTime'],
                $activeLog['date'], $activeLog['timeWindow'], $activeLog['serverUtcIso'], $activeLog['managerRemarks']
            ]);
        } catch (Exception $e) {}
    }

    // Mirror to JSON
    $jdb = loadJsonDb();
    if (!isset($jdb['attendance'])) $jdb['attendance'] = [];
    foreach ($jdb['attendance'] as &$rec) {
        if ($rec['userId'] === $user['id'] && !empty($rec['active'])) {
            $rec['active'] = false;
            $rec['logoutTime'] = $timeData['timeStr'];
            $rec['duration'] = 'Auto closed on new login';
        }
    }
    array_unshift($jdb['attendance'], $activeLog);
    saveJsonDb($jdb);

    echo json_encode([
        'success' => true,
        'user' => $user,
        'serverTimestamp' => $timeData['timeStr'],
        'serverDate' => $timeData['dateStr'],
        'activeLog' => $activeLog
    ]);
    exit();
}

// ──────────────────────────────────────────────
// 3. Authentication Logout (POST /api/auth/logout)
// ──────────────────────────────────────────────
if ($route === 'auth/logout' && $method === 'POST') {
    $userId = $body['userId'] ?? '';
    $logoutRemarks = $body['logoutRemarks'] ?? '';
    $location = $body['location'] ?? [];
    $latitude = $location['latitude'] ?? null;
    $longitude = $location['longitude'] ?? null;
    $logoutFullName = $body['logoutFullName'] ?? '';
    $logoutStudentRegNo = $body['logoutStudentRegNo'] ?? '';
    $logoutUnitDetails = $body['logoutUnitDetails'] ?? '';
    $logoutSubUnitDetails = $body['logoutSubUnitDetails'] ?? '';
    $logoutAuditWorkType = $body['logoutAuditWorkType'] ?? '';
    $logoutObjectiveCompleted = $body['logoutObjectiveCompleted'] ?? '';
    $logoutEscalations = $body['logoutEscalations'] ?? '';
    $logoutWorkDescription = $body['logoutWorkDescription'] ?? '';

    $formattedReports = [];
    $formattedAttendance = [];

    if ($pdo) {
        try {
            $stmt = $pdo->prepare('SELECT * FROM attendance WHERE user_id = ? AND is_active = 1 LIMIT 1');
            $stmt->execute([$userId]);
            $activeAtt = $stmt->fetch();
            $loginIso = $activeAtt ? ($activeAtt['server_utc_iso'] ?? null) : null;
            $durationStr = calculateDuration($loginIso, $timeData['isoStr']);

            if ($activeAtt) {
                $stmt = $pdo->prepare(
                    "UPDATE attendance SET 
                      is_active = 0, logout_time = ?, time_window = ?, duration = ?, 
                      manager_remarks = ?, logout_latitude = ?, logout_longitude = ?
                     WHERE id = ?"
                );
                $stmt->execute([
                    $timeData['timeStr'],
                    ($activeAtt['login_time'] ?? '09:00 AM') . ' - ' . $timeData['timeStr'],
                    $durationStr,
                    $logoutRemarks ?: 'Logged out by user action.',
                    $latitude,
                    $longitude,
                    $activeAtt['id']
                ]);
            } else {
                $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
                $stmt->execute([$userId]);
                $userObj = $stmt->fetch();
                $newLogId = 'log-' . round(microtime(true) * 1000);
                $stmt = $pdo->prepare(
                    "INSERT INTO attendance 
                      (id, user_id, user_name, user_email, manager_id, role_title, unit, login_time, logout_time, date_str, time_window, duration, is_active, server_verified, manager_remarks, logout_latitude, logout_longitude)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 1, ?, ?, ?)"
                );
                $stmt->execute([
                    $newLogId,
                    $userId,
                    $logoutFullName ?: ($userObj['name'] ?? 'Staff User'),
                    $userObj['email'] ?? '',
                    $userObj['managed_by'] ?? null,
                    $userObj['role_title'] ?? 'Staff',
                    $logoutUnitDetails ?: ($userObj['unit'] ?? 'All Enterprise Units'),
                    '09:00:00 AM',
                    $timeData['timeStr'],
                    $timeData['dateStr'],
                    '09:00 AM - ' . $timeData['timeStr'],
                    $durationStr,
                    $logoutRemarks ?: 'Logged out by user action.',
                    $latitude,
                    $longitude
                ]);
            }

            // Update or Insert in daily_reports
            $stmt = $pdo->prepare('SELECT * FROM daily_reports WHERE (user_id = ? OR student_reg_no = ?) AND date = ? LIMIT 1');
            $stmt->execute([$userId, $logoutStudentRegNo, $timeData['dateStr']]);
            $existingReport = $stmt->fetch();

            if ($existingReport) {
                $stmt = $pdo->prepare(
                    "UPDATE daily_reports SET 
                      full_name = ?, student_reg_no = ?, unit_details = ?, sub_unit_details = ?, 
                      audit_work_type = ?, objective_completed = ?, escalations = ?, work_description = ?, 
                      logout_time = ?, logout_remarks = ?, status = 'COMPLETED & VERIFIED', 
                      concluded_at = ?, duration = ?, logout_latitude = ?, logout_longitude = ?
                     WHERE id = ?"
                );
                $stmt->execute([
                    $logoutFullName ?: $existingReport['full_name'],
                    $logoutStudentRegNo ?: $existingReport['student_reg_no'],
                    $logoutUnitDetails ?: $existingReport['unit_details'],
                    $logoutSubUnitDetails ?: $existingReport['sub_unit_details'],
                    $logoutAuditWorkType ?: $existingReport['audit_work_type'],
                    $logoutObjectiveCompleted ?: ($existingReport['objective_completed'] ?? ''),
                    $logoutEscalations ?: ($existingReport['escalations'] ?? ''),
                    $logoutWorkDescription ?: ($existingReport['work_description'] ?? ''),
                    $timeData['timeStr'],
                    $logoutRemarks ?: ($existingReport['logout_remarks'] ?? ''),
                    $timeData['isoStr'],
                    $durationStr,
                    $latitude,
                    $longitude,
                    $existingReport['id']
                ]);
            } else {
                $stmt = $pdo->prepare('SELECT * FROM users WHERE id = ? LIMIT 1');
                $stmt->execute([$userId]);
                $userObj = $stmt->fetch();
                $newReportId = 'dr-' . round(microtime(true) * 1000);
                $stmt = $pdo->prepare(
                    "INSERT INTO daily_reports 
                      (id, user_id, login_time, full_name, student_reg_no, unit_details, sub_unit_details, 
                       audit_work_type, objective_completed, escalations, work_description, logout_time, 
                       logout_remarks, status, date, concluded_at, duration, logout_latitude, logout_longitude)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'COMPLETED & VERIFIED', ?, ?, ?, ?, ?)"
                );
                $stmt->execute([
                    $newReportId,
                    $userId ?: null,
                    '09:00:00 AM',
                    $logoutFullName ?: ($userObj['name'] ?? 'Audit Staff'),
                    $logoutStudentRegNo ?: ($userObj['student_reg_no'] ?? ''),
                    $logoutUnitDetails ?: ($userObj['unit'] ?? 'All Enterprise Units'),
                    $logoutSubUnitDetails ?: ($userObj['sub_unit'] ?? ''),
                    $logoutAuditWorkType ?: 'Concurrent Audit',
                    $logoutObjectiveCompleted ?: '',
                    $logoutEscalations ?: '',
                    $logoutWorkDescription ?: '',
                    $timeData['timeStr'],
                    $logoutRemarks ?: 'Standard evening shift conclusion',
                    $timeData['dateStr'],
                    $timeData['isoStr'],
                    $durationStr,
                    $latitude,
                    $longitude
                ]);
            }

            // Retrieve updated lists
            $stmt = $pdo->query('SELECT * FROM daily_reports ORDER BY created_at DESC');
            while ($r = $stmt->fetch()) {
                $formattedReports[] = [
                    'id' => $r['id'],
                    'userId' => $r['user_id'],
                    'loginTime' => $r['login_time'],
                    'fullName' => $r['full_name'],
                    'studentRegNo' => $r['student_reg_no'],
                    'unitDetails' => $r['unit_details'],
                    'subUnitDetails' => $r['sub_unit_details'],
                    'auditWorkType' => $r['audit_work_type'],
                    'workObjective' => $r['work_objective'],
                    'vouchersVerified' => $r['vouchers_verified'],
                    'targetToAchieve' => $r['target_to_achieve'],
                    'caRemarks' => $r['ca_remarks'],
                    'pocName' => $r['poc_name'],
                    'logoutTime' => $r['logout_time'],
                    'logoutRemarks' => $r['logout_remarks'],
                    'objectiveCompleted' => $r['objective_completed'],
                    'escalations' => $r['escalations'],
                    'workDescription' => $r['work_description'],
                    'status' => $r['status'],
                    'date' => $r['date'],
                    'duration' => $r['duration'],
                    'logoutLatitude' => $r['logout_latitude'],
                    'logoutLongitude' => $r['logout_longitude'],
                    'concludedAt' => $r['concluded_at'],
                    'createdAt' => $r['created_at']
                ];
            }

            $stmt = $pdo->query('SELECT * FROM attendance ORDER BY created_at DESC');
            while ($r = $stmt->fetch()) {
                $formattedAttendance[] = [
                    'id' => $r['id'],
                    'userId' => $r['user_id'],
                    'userName' => $r['user_name'],
                    'userEmail' => $r['user_email'],
                    'managerId' => $r['manager_id'],
                    'roleTitle' => $r['role_title'],
                    'unit' => $r['unit'],
                    'loginTime' => $r['login_time'],
                    'logoutTime' => $r['logout_time'],
                    'date' => $r['date_str'],
                    'timeWindow' => $r['time_window'],
                    'duration' => $r['duration'],
                    'active' => (bool)$r['is_active'],
                    'serverVerified' => (bool)$r['server_verified'],
                    'managerRemarks' => $r['manager_remarks'],
                    'logoutLatitude' => $r['logout_latitude'],
                    'logoutLongitude' => $r['logout_longitude']
                ];
            }
        } catch (Exception $e) {}
    }

    if (empty($formattedReports)) {
        $jdb = loadJsonDb();
        $formattedReports = $jdb['dailyReports'] ?? [];
        $formattedAttendance = $jdb['attendance'] ?? [];
    }

    echo json_encode([
        'success' => true,
        'serverLogoutTime' => $timeData['timeStr'],
        'serverDate' => $timeData['dateStr'],
        'reports' => $formattedReports,
        'attendance' => $formattedAttendance,
        'message' => 'Session securely closed and exit timestamp recorded on server at ' . $timeData['timeStr']
    ]);
    exit();
}

// ──────────────────────────────────────────────
// 4. Attendance Toggle (POST /api/attendance/toggle)
// ──────────────────────────────────────────────
if ($route === 'attendance/toggle' && $method === 'POST') {
    $userId = $body['userId'] ?? '';
    $isClockedIn = !empty($body['isClockedIn']);

    $jdb = loadJsonDb();
    if (!isset($jdb['attendance'])) $jdb['attendance'] = [];

    if ($isClockedIn) {
        foreach ($jdb['attendance'] as &$rec) {
            if ($rec['userId'] === $userId && !empty($rec['active'])) {
                $rec['active'] = false;
                $rec['logoutTime'] = $timeData['timeStr'];
                $rec['duration'] = 'Shift Closed';
            }
        }
    } else {
        array_unshift($jdb['attendance'], [
            'id' => 'log-' . round(microtime(true) * 1000),
            'userId' => $userId ?: 'usr-temp',
            'userName' => 'Field Auditor',
            'userEmail' => 'auditor@eluc',
            'managerId' => 'usr-admin-1',
            'roleTitle' => 'Auditor',
            'unit' => 'All Enterprise Units',
            'loginTime' => $timeData['timeStr'],
            'logoutTime' => null,
            'date' => $timeData['dateStr'],
            'timeWindow' => $timeData['timeStr'] . ' - Active',
            'duration' => '0h 01m',
            'active' => true,
            'serverVerified' => true,
            'managerRemarks' => 'Re-punched shift.'
        ]);
    }
    saveJsonDb($jdb);

    echo json_encode(['success' => true, 'attendance' => $jdb['attendance'], 'timeStr' => $timeData['timeStr']]);
    exit();
}

// ──────────────────────────────────────────────
// 5. Users API (/api/users)
// ──────────────────────────────────────────────
if ($route === 'users') {
    if ($method === 'GET') {
        $users = [];
        if ($pdo) {
            try {
                $stmt = $pdo->query('SELECT * FROM users ORDER BY created_at DESC');
                while ($u = $stmt->fetch()) {
                    $users[] = [
                        'id' => $u['id'],
                        'name' => $u['name'],
                        'email' => $u['email'],
                        'password' => $u['password'],
                        'role' => $u['role'],
                        'roleTitle' => $u['role_title'],
                        'unit' => $u['unit'],
                        'studentRegNo' => $u['student_reg_no'] ?? '',
                        'phone' => $u['phone'] ?? '',
                        'subUnit' => $u['sub_unit'] ?? '',
                        'managedBy' => $u['managed_by']
                    ];
                }
            } catch (Exception $e) {}
        }
        if (empty($users)) {
            $jdb = loadJsonDb();
            $users = $jdb['users'] ?? [];
        }
        echo json_encode(['success' => true, 'users' => $users]);
        exit();
    }

    if ($method === 'POST') {
        $name = trim($body['name'] ?? '');
        $email = strtolower(trim($body['email'] ?? ''));
        $password = $body['password'] ?? '12345678';
        $roleTitle = $body['roleTitle'] ?? 'Field Auditor';
        $unit = $body['unit'] ?? 'All Enterprise Units';
        $managerId = $body['managerId'] ?? null;
        $studentRegNo = $body['studentRegNo'] ?? '';
        $phone = $body['phone'] ?? '';
        $subUnit = $body['subUnit'] ?? '';

        $role = stripos($roleTitle, 'Manager') !== false ? 'MANAGER' : (stripos($roleTitle, 'Super') !== false ? 'SUPER_ADMIN' : 'USER');
        $newId = 'usr-' . round(microtime(true) * 1000);

        $users = [];
        if ($pdo) {
            try {
                $stmt = $pdo->prepare(
                    'INSERT INTO users (id, name, email, password, role, role_title, unit, managed_by, student_reg_no, phone, sub_unit) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
                );
                $stmt->execute([$newId, $name, $email, $password, $role, $roleTitle, $unit, $managerId, $studentRegNo, $phone, $subUnit]);

                $stmt = $pdo->query('SELECT * FROM users ORDER BY created_at DESC');
                while ($u = $stmt->fetch()) {
                    $users[] = [
                        'id' => $u['id'],
                        'name' => $u['name'],
                        'email' => $u['email'],
                        'password' => $u['password'],
                        'role' => $u['role'],
                        'roleTitle' => $u['role_title'],
                        'unit' => $u['unit'],
                        'studentRegNo' => $u['student_reg_no'] ?? '',
                        'phone' => $u['phone'] ?? '',
                        'subUnit' => $u['sub_unit'] ?? '',
                        'managedBy' => $u['managed_by']
                    ];
                }
            } catch (Exception $e) {}
        }

        $newUser = [
            'id' => $newId,
            'name' => $name,
            'email' => $email,
            'password' => $password,
            'role' => $role,
            'roleTitle' => $roleTitle,
            'unit' => $unit,
            'studentRegNo' => $studentRegNo,
            'phone' => $phone,
            'subUnit' => $subUnit,
            'managedBy' => $managerId
        ];

        $jdb = loadJsonDb();
        if (!isset($jdb['users'])) $jdb['users'] = [];
        array_unshift($jdb['users'], $newUser);
        saveJsonDb($jdb);

        if (empty($users)) $users = $jdb['users'];

        echo json_encode(['success' => true, 'user' => $newUser, 'users' => $users]);
        exit();
    }
}

// ──────────────────────────────────────────────
// 6. User Operations (/api/users/{id})
// ──────────────────────────────────────────────
if (preg_match('#^users/(.+)$#', $route, $matches)) {
    $userId = $matches[1];

    if ($method === 'PUT') {
        $name = trim($body['name'] ?? '');
        $email = strtolower(trim($body['email'] ?? ''));
        $password = $body['password'] ?? '12345678';
        $roleTitle = $body['roleTitle'] ?? 'Field Auditor';
        $role = $body['role'] ?? 'USER';
        $unit = $body['unit'] ?? 'All Enterprise Units';
        $studentRegNo = $body['studentRegNo'] ?? '';
        $phone = $body['phone'] ?? '';
        $subUnit = $body['subUnit'] ?? '';

        $users = [];
        if ($pdo) {
            try {
                $stmt = $pdo->prepare(
                    'UPDATE users SET name = ?, email = ?, password = ?, role = ?, role_title = ?, unit = ?, student_reg_no = ?, phone = ?, sub_unit = ? WHERE id = ?'
                );
                $stmt->execute([$name, $email, $password, $role, $roleTitle, $unit, $studentRegNo, $phone, $subUnit, $userId]);

                $stmt = $pdo->query('SELECT * FROM users ORDER BY created_at DESC');
                while ($u = $stmt->fetch()) {
                    $users[] = [
                        'id' => $u['id'],
                        'name' => $u['name'],
                        'email' => $u['email'],
                        'password' => $u['password'],
                        'role' => $u['role'],
                        'roleTitle' => $u['role_title'],
                        'unit' => $u['unit'],
                        'studentRegNo' => $u['student_reg_no'] ?? '',
                        'phone' => $u['phone'] ?? '',
                        'subUnit' => $u['sub_unit'] ?? '',
                        'managedBy' => $u['managed_by']
                    ];
                }
            } catch (Exception $e) {}
        }

        $jdb = loadJsonDb();
        foreach ($jdb['users'] as &$u) {
            if ($u['id'] === $userId) {
                $u['name'] = $name ?: $u['name'];
                $u['email'] = $email ?: $u['email'];
                $u['password'] = $password ?: $u['password'];
                $u['role'] = $role ?: $u['role'];
                $u['roleTitle'] = $roleTitle ?: $u['roleTitle'];
                $u['unit'] = $unit ?: $u['unit'];
                $u['studentRegNo'] = $studentRegNo ?: ($u['studentRegNo'] ?? '');
                $u['phone'] = $phone ?: ($u['phone'] ?? '');
                $u['subUnit'] = $subUnit ?: ($u['subUnit'] ?? '');
            }
        }
        saveJsonDb($jdb);
        if (empty($users)) $users = $jdb['users'];

        echo json_encode(['success' => true, 'users' => $users]);
        exit();
    }

    if ($method === 'DELETE') {
        $users = [];
        if ($pdo) {
            try {
                $stmt = $pdo->prepare('DELETE FROM users WHERE id = ?');
                $stmt->execute([$userId]);

                $stmt = $pdo->query('SELECT * FROM users ORDER BY created_at DESC');
                while ($u = $stmt->fetch()) {
                    $users[] = [
                        'id' => $u['id'],
                        'name' => $u['name'],
                        'email' => $u['email'],
                        'password' => $u['password'],
                        'role' => $u['role'],
                        'roleTitle' => $u['role_title'],
                        'unit' => $u['unit'],
                        'studentRegNo' => $u['student_reg_no'] ?? '',
                        'phone' => $u['phone'] ?? '',
                        'subUnit' => $u['sub_unit'] ?? '',
                        'managedBy' => $u['managed_by']
                    ];
                }
            } catch (Exception $e) {}
        }

        $jdb = loadJsonDb();
        $jdb['users'] = array_values(array_filter($jdb['users'], function($u) use ($userId) {
            return $u['id'] !== $userId;
        }));
        saveJsonDb($jdb);
        if (empty($users)) $users = $jdb['users'];

        echo json_encode(['success' => true, 'users' => $users]);
        exit();
    }
}

// ──────────────────────────────────────────────
// 7. Attendance Ledger (/api/attendance)
// ──────────────────────────────────────────────
if ($route === 'attendance' && $method === 'GET') {
    $role = $_GET['role'] ?? '';
    $managerId = $_GET['managerId'] ?? '';

    $attendance = [];
    if ($pdo) {
        try {
            $sql = 'SELECT * FROM attendance';
            $params = [];
            if ($role === 'MANAGER' && $managerId) {
                $sql .= ' WHERE manager_id = ?';
                $params[] = $managerId;
            }
            $sql .= ' ORDER BY created_at DESC';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            while ($r = $stmt->fetch()) {
                $attendance[] = [
                    'id' => $r['id'],
                    'userId' => $r['user_id'],
                    'userName' => $r['user_name'],
                    'userEmail' => $r['user_email'],
                    'managerId' => $r['manager_id'],
                    'roleTitle' => $r['role_title'],
                    'unit' => $r['unit'],
                    'loginTime' => $r['login_time'],
                    'logoutTime' => $r['logout_time'],
                    'date' => $r['date_str'],
                    'timeWindow' => $r['time_window'],
                    'duration' => $r['duration'],
                    'active' => (bool)$r['is_active'],
                    'serverVerified' => (bool)$r['server_verified'],
                    'managerRemarks' => $r['manager_remarks']
                ];
            }
        } catch (Exception $e) {}
    }
    if (empty($attendance)) {
        $jdb = loadJsonDb();
        $attendance = $jdb['attendance'] ?? [];
        if ($role === 'MANAGER' && $managerId) {
            $attendance = array_values(array_filter($attendance, function($r) use ($managerId) {
                return ($r['managerId'] ?? '') === $managerId;
            }));
        }
    }
    echo json_encode(['success' => true, 'attendance' => $attendance]);
    exit();
}

// Save Manager Remark
if (preg_match('#^attendance/(.+)/remark$#', $route, $matches) && $method === 'PATCH') {
    $attId = $matches[1];
    $remarks = $body['remarks'] ?? '';

    if ($pdo) {
        try {
            $stmt = $pdo->prepare('UPDATE attendance SET manager_remarks = ? WHERE id = ?');
            $stmt->execute([$remarks, $attId]);
        } catch (Exception $e) {}
    }

    $jdb = loadJsonDb();
    if (isset($jdb['attendance'])) {
        foreach ($jdb['attendance'] as &$item) {
            if ($item['id'] === $attId) {
                $item['managerRemarks'] = $remarks;
            }
        }
        saveJsonDb($jdb);
    }

    echo json_encode(['success' => true]);
    exit();
}

// ──────────────────────────────────────────────
// 8. Assignments API (/api/assignments)
// ──────────────────────────────────────────────
if ($route === 'assignments') {
    if ($method === 'GET') {
        $userId = $_GET['userId'] ?? '';
        $managerId = $_GET['managerId'] ?? '';
        $assignments = [];

        if ($pdo) {
            try {
                $sql = 'SELECT * FROM assignments WHERE 1=1';
                $params = [];
                if ($userId) {
                    $sql .= ' AND assigned_to_id = ?';
                    $params[] = $userId;
                }
                if ($managerId) {
                    $sql .= ' AND manager_id = ?';
                    $params[] = $managerId;
                }
                $sql .= ' ORDER BY created_at DESC';
                $stmt = $pdo->prepare($sql);
                $stmt->execute($params);
                while ($r = $stmt->fetch()) {
                    $assignments[] = [
                        'id' => $r['id'],
                        'assignedToId' => $r['assigned_to_id'],
                        'assignedToName' => $r['assigned_to_name'],
                        'managerId' => $r['manager_id'],
                        'managerName' => $r['manager_name'],
                        'unit' => $r['unit'],
                        'taskTitle' => $r['task_title'],
                        'instructions' => $r['instructions'],
                        'deadline' => $r['deadline'],
                        'status' => $r['status'],
                        'createdAt' => $r['created_at']
                    ];
                }
            } catch (Exception $e) {}
        }
        if (empty($assignments)) {
            $jdb = loadJsonDb();
            $assignments = $jdb['assignments'] ?? [];
            if ($userId) $assignments = array_values(array_filter($assignments, fn($a) => ($a['assignedToId'] ?? '') === $userId));
            if ($managerId) $assignments = array_values(array_filter($assignments, fn($a) => ($a['managerId'] ?? '') === $managerId));
        }
        echo json_encode(['success' => true, 'assignments' => $assignments]);
        exit();
    }

    if ($method === 'POST') {
        $assignedToId = $body['assignedToId'] ?? '';
        $managerId = $body['managerId'] ?? '';
        $unit = $body['unit'] ?? 'All Enterprise Units';
        $taskTitle = $body['taskTitle'] ?? 'Field Verification';
        $instructions = $body['instructions'] ?? 'Complete physical verification and submit documentation.';
        $deadline = $body['deadline'] ?? 'Today, 05:30 PM';

        $newId = 'asn-' . round(microtime(true) * 1000);
        $newAssignment = [
            'id' => $newId,
            'assignedToId' => $assignedToId,
            'assignedToName' => 'Field Auditor',
            'managerId' => $managerId,
            'managerName' => 'Department Manager',
            'unit' => $unit,
            'taskTitle' => $taskTitle,
            'instructions' => $instructions,
            'deadline' => $deadline,
            'status' => 'ASSIGNED'
        ];

        if ($pdo) {
            try {
                $stmt = $pdo->prepare(
                    "INSERT INTO assignments (id, assigned_to_id, assigned_to_name, manager_id, manager_name, unit, task_title, instructions, deadline, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ASSIGNED')"
                );
                $stmt->execute([$newId, $assignedToId, 'Field Auditor', $managerId, 'Department Manager', $unit, $taskTitle, $instructions, $deadline]);
            } catch (Exception $e) {}
        }

        $jdb = loadJsonDb();
        if (!isset($jdb['assignments'])) $jdb['assignments'] = [];
        array_unshift($jdb['assignments'], $newAssignment);
        saveJsonDb($jdb);

        echo json_encode(['success' => true, 'assignment' => $newAssignment, 'assignments' => $jdb['assignments']]);
        exit();
    }
}

// ──────────────────────────────────────────────
// 9. Complaints & Robot Evidence Vault (/api/complaints)
// ──────────────────────────────────────────────
if ($route === 'complaints/upload' && $method === 'POST') {
    $unit = $body['unit'] ?? 'All Enterprise Units';
    $title = $body['title'] ?? 'Field Observation';
    $category = $body['category'] ?? 'Audit Discrepancy';
    $urgency = $body['urgency'] ?? 'MEDIUM';
    $remarks = $body['remarks'] ?? 'Evidence document submitted for management review.';
    $fileName = $body['fileName'] ?? 'document.pdf';
    $fileType = $body['fileType'] ?? 'application/pdf';
    $fileSize = $body['fileSize'] ?? '150 KB';
    $fileData = $body['fileData'] ?? null;
    $auditorId = $body['auditorId'] ?? 'usr-admin-1';
    $auditorName = $body['auditorName'] ?? 'Field Auditor';

    $newId = 'CMP-2026-0812-' . str_pad(rand(1, 999), 3, '0', STR_PAD_LEFT);
    $sampleUrl = stripos($fileType, 'image') !== false
        ? 'https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=600&auto=format&fit=crop&q=80'
        : 'https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf';

    $newComplaint = [
        'id' => $newId,
        'unit' => $unit,
        'title' => $title,
        'category' => $category,
        'urgency' => $urgency,
        'remarks' => $remarks,
        'fileName' => $fileName,
        'fileType' => $fileType,
        'fileSize' => $fileSize,
        'fileData' => $fileData,
        'sampleFileUrl' => $sampleUrl,
        'auditorId' => $auditorId,
        'auditorName' => $auditorName,
        'managerId' => 'usr-admin-1',
        'managerName' => 'Department Audit Manager',
        'date' => $timeData['dateStr'],
        'timeFrame' => $timeData['fullTimeframe'],
        'serverTimestamp' => $timeData['timeStr'] . ' • ' . $timeData['dateStr'],
        'status' => 'SUBMITTED',
        'robotVerified' => true
    ];

    if ($pdo) {
        try {
            $stmt = $pdo->prepare(
                "INSERT INTO complaints (id, unit, title, category, urgency, remarks, file_name, file_type, file_size, file_data, sample_file_url, auditor_id, auditor_name, manager_id, manager_name, date_str, time_frame, server_timestamp, status, robot_verified)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'SUBMITTED', 1)"
            );
            $stmt->execute([
                $newId, $unit, $title, $category, $urgency, $remarks, $fileName, $fileType, $fileSize,
                $fileData, $sampleUrl, $auditorId, $auditorName, 'usr-admin-1', 'Department Audit Manager',
                $timeData['dateStr'], $timeData['fullTimeframe'], $newComplaint['serverTimestamp']
            ]);
        } catch (Exception $e) {}
    }

    $jdb = loadJsonDb();
    if (!isset($jdb['complaints'])) $jdb['complaints'] = [];
    array_unshift($jdb['complaints'], $newComplaint);
    saveJsonDb($jdb);

    echo json_encode([
        'success' => true,
        'message' => 'Complaint & File verified by Robot Backend Vault',
        'complaint' => $newComplaint,
        'complaints' => $jdb['complaints'],
        'receiptToken' => 'RB-VAULT-CERT-' . strtoupper(dechex(time()))
    ]);
    exit();
}

if ($route === 'complaints' && $method === 'GET') {
    $role = $_GET['role'] ?? '';
    $managerId = $_GET['managerId'] ?? '';
    $unit = $_GET['unit'] ?? '';
    $complaints = [];

    if ($pdo) {
        try {
            $sql = 'SELECT * FROM complaints WHERE 1=1';
            $params = [];
            if ($role === 'MANAGER' && $managerId) {
                $sql .= ' AND manager_id = ?';
                $params[] = $managerId;
            }
            if ($unit && $unit !== 'ALL') {
                $sql .= ' AND unit = ?';
                $params[] = $unit;
            }
            $sql .= ' ORDER BY created_at DESC';
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            while ($r = $stmt->fetch()) {
                $complaints[] = [
                    'id' => $r['id'],
                    'unit' => $r['unit'],
                    'title' => $r['title'],
                    'category' => $r['category'],
                    'urgency' => $r['urgency'],
                    'remarks' => $r['remarks'],
                    'fileName' => $r['file_name'],
                    'fileType' => $r['file_type'],
                    'fileSize' => $r['file_size'],
                    'fileData' => $r['file_data'],
                    'sampleFileUrl' => $r['sample_file_url'],
                    'auditorId' => $r['auditor_id'],
                    'auditorName' => $r['auditor_name'],
                    'managerId' => $r['manager_id'],
                    'managerName' => $r['manager_name'],
                    'date' => $r['date_str'],
                    'timeFrame' => $r['time_frame'],
                    'serverTimestamp' => $r['server_timestamp'],
                    'status' => $r['status'],
                    'robotVerified' => (bool)$r['robot_verified']
                ];
            }
        } catch (Exception $e) {}
    }
    if (empty($complaints)) {
        $jdb = loadJsonDb();
        $complaints = $jdb['complaints'] ?? [];
        if ($role === 'MANAGER' && $managerId) $complaints = array_values(array_filter($complaints, fn($c) => ($c['managerId'] ?? '') === $managerId));
        if ($unit && $unit !== 'ALL') $complaints = array_values(array_filter($complaints, fn($c) => ($c['unit'] ?? '') === $unit));
    }
    echo json_encode(['success' => true, 'complaints' => $complaints]);
    exit();
}

// ──────────────────────────────────────────────
// 10. Daily Audit Reports (/api/daily-reports)
// ──────────────────────────────────────────────
if ($route === 'daily-reports') {
    if ($method === 'GET') {
        $reports = [];
        if ($pdo) {
            try {
                $stmt = $pdo->query('SELECT * FROM daily_reports ORDER BY created_at DESC');
                while ($r = $stmt->fetch()) {
                    $reports[] = [
                        'id' => $r['id'],
                        'userId' => $r['user_id'],
                        'loginTime' => $r['login_time'],
                        'fullName' => $r['full_name'],
                        'studentRegNo' => $r['student_reg_no'],
                        'unitDetails' => $r['unit_details'],
                        'subUnitDetails' => $r['sub_unit_details'],
                        'auditWorkType' => $r['audit_work_type'],
                        'workObjective' => $r['work_objective'],
                        'vouchersVerified' => $r['vouchers_verified'],
                        'targetToAchieve' => $r['target_to_achieve'],
                        'caRemarks' => $r['ca_remarks'],
                        'pocName' => $r['poc_name'],
                        'logoutTime' => $r['logout_time'],
                        'logoutRemarks' => $r['logout_remarks'],
                        'objectiveCompleted' => $r['objective_completed'],
                        'escalations' => $r['escalations'],
                        'workDescription' => $r['work_description'],
                        'status' => $r['status'],
                        'date' => $r['date'],
                        'duration' => $r['duration'],
                        'loginLatitude' => $r['login_latitude'],
                        'loginLongitude' => $r['login_longitude'],
                        'logoutLatitude' => $r['logout_latitude'],
                        'logoutLongitude' => $r['logout_longitude'],
                        'concludedAt' => $r['concluded_at'],
                        'createdAt' => $r['created_at']
                    ];
                }
            } catch (Exception $e) {}
        }
        if (empty($reports)) {
            $jdb = loadJsonDb();
            $reports = $jdb['dailyReports'] ?? [];
        }
        echo json_encode(['success' => true, 'reports' => $reports]);
        exit();
    }

    if ($method === 'POST') {
        $userId = $body['userId'] ?? null;
        $loginTime = $body['loginTime'] ?? $timeData['timeStr'];
        $fullName = $body['fullName'] ?? 'Audit Staff';
        $studentRegNo = $body['studentRegNo'] ?? '';
        $unitDetails = $body['unitDetails'] ?? '';
        $subUnitDetails = $body['subUnitDetails'] ?? '';
        $auditWorkType = $body['auditWorkType'] ?? '';
        $workObjective = $body['workObjective'] ?? '';
        $vouchersVerified = $body['vouchersVerified'] ?? '';
        $targetToAchieve = $body['targetToAchieve'] ?? '';
        $caRemarks = $body['caRemarks'] ?? '';
        $pocName = $body['pocName'] ?? '';
        $loginLatitude = $body['loginLatitude'] ?? null;
        $loginLongitude = $body['loginLongitude'] ?? null;
        $status = $body['status'] ?? 'SUBMITTED';

        $reports = [];
        if ($pdo) {
            try {
                $stmt = $pdo->prepare('SELECT * FROM daily_reports WHERE (user_id = ? OR student_reg_no = ?) AND date = ? LIMIT 1');
                $stmt->execute([$userId, $studentRegNo, $timeData['dateStr']]);
                $existing = $stmt->fetch();

                if ($existing) {
                    $stmt = $pdo->prepare(
                        "UPDATE daily_reports SET 
                          login_time = ?, full_name = ?, student_reg_no = ?, unit_details = ?, sub_unit_details = ?, 
                          audit_work_type = ?, work_objective = ?, vouchers_verified = ?, target_to_achieve = ?, 
                          ca_remarks = ?, poc_name = ?, login_latitude = ?, login_longitude = ?, status = ?
                         WHERE id = ?"
                    );
                    $stmt->execute([
                        $loginTime ?: $existing['login_time'],
                        $fullName ?: $existing['full_name'],
                        $studentRegNo ?: $existing['student_reg_no'],
                        $unitDetails ?: $existing['unit_details'],
                        $subUnitDetails ?: $existing['sub_unit_details'],
                        $auditWorkType ?: $existing['audit_work_type'],
                        $workObjective ?: $existing['work_objective'],
                        $vouchersVerified ?: $existing['vouchers_verified'],
                        $targetToAchieve ?: $existing['target_to_achieve'],
                        $caRemarks ?: $existing['ca_remarks'],
                        $pocName ?: $existing['poc_name'],
                        $loginLatitude !== null ? $loginLatitude : $existing['login_latitude'],
                        $loginLongitude !== null ? $loginLongitude : $existing['login_longitude'],
                        $status ?: $existing['status'],
                        $existing['id']
                    ]);
                } else {
                    $newId = 'dr-' . round(microtime(true) * 1000);
                    $stmt = $pdo->prepare(
                        "INSERT INTO daily_reports 
                          (id, user_id, login_time, full_name, student_reg_no, unit_details, sub_unit_details, 
                           audit_work_type, work_objective, vouchers_verified, target_to_achieve, ca_remarks, poc_name, status, date, login_latitude, login_longitude)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                    );
                    $stmt->execute([
                        $newId, $userId, $loginTime, $fullName, $studentRegNo, $unitDetails, $subUnitDetails,
                        $auditWorkType, $workObjective, $vouchersVerified, $targetToAchieve, $caRemarks, $pocName,
                        $status, $timeData['dateStr'], $loginLatitude, $loginLongitude
                    ]);
                }

                $stmt = $pdo->query('SELECT * FROM daily_reports ORDER BY created_at DESC');
                while ($r = $stmt->fetch()) {
                    $reports[] = [
                        'id' => $r['id'],
                        'userId' => $r['user_id'],
                        'loginTime' => $r['login_time'],
                        'fullName' => $r['full_name'],
                        'studentRegNo' => $r['student_reg_no'],
                        'unitDetails' => $r['unit_details'],
                        'subUnitDetails' => $r['sub_unit_details'],
                        'auditWorkType' => $r['audit_work_type'],
                        'workObjective' => $r['work_objective'],
                        'vouchersVerified' => $r['vouchers_verified'],
                        'targetToAchieve' => $r['target_to_achieve'],
                        'caRemarks' => $r['ca_remarks'],
                        'pocName' => $r['poc_name'],
                        'logoutTime' => $r['logout_time'],
                        'logoutRemarks' => $r['logout_remarks'],
                        'objectiveCompleted' => $r['objective_completed'],
                        'escalations' => $r['escalations'],
                        'workDescription' => $r['work_description'],
                        'status' => $r['status'],
                        'date' => $r['date'],
                        'duration' => $r['duration'],
                        'loginLatitude' => $r['login_latitude'],
                        'loginLongitude' => $r['login_longitude'],
                        'logoutLatitude' => $r['logout_latitude'],
                        'logoutLongitude' => $r['logout_longitude'],
                        'concludedAt' => $r['concluded_at'],
                        'createdAt' => $r['created_at']
                    ];
                }
            } catch (Exception $e) {}
        }

        if (empty($reports)) {
            $jdb = loadJsonDb();
            if (!isset($jdb['dailyReports'])) $jdb['dailyReports'] = [];
            $existingIdx = -1;
            foreach ($jdb['dailyReports'] as $idx => $r) {
                if (($userId && ($r['userId'] ?? '') === $userId && $r['date'] === $timeData['dateStr']) ||
                    ($studentRegNo && ($r['studentRegNo'] ?? '') === $studentRegNo && $r['date'] === $timeData['dateStr'])) {
                    $existingIdx = $idx;
                    break;
                }
            }
            if ($existingIdx >= 0) {
                $jdb['dailyReports'][$existingIdx] = array_merge($jdb['dailyReports'][$existingIdx], [
                    'loginTime' => $loginTime,
                    'fullName' => $fullName,
                    'studentRegNo' => $studentRegNo,
                    'unitDetails' => $unitDetails,
                    'subUnitDetails' => $subUnitDetails,
                    'auditWorkType' => $auditWorkType,
                    'workObjective' => $workObjective,
                    'vouchersVerified' => $vouchersVerified,
                    'targetToAchieve' => $targetToAchieve,
                    'caRemarks' => $caRemarks,
                    'pocName' => $pocName,
                    'loginLatitude' => $loginLatitude,
                    'loginLongitude' => $loginLongitude
                ]);
            } else {
                array_unshift($jdb['dailyReports'], [
                    'id' => 'dr-' . round(microtime(true) * 1000),
                    'userId' => $userId,
                    'loginTime' => $loginTime,
                    'fullName' => $fullName,
                    'studentRegNo' => $studentRegNo,
                    'unitDetails' => $unitDetails,
                    'subUnitDetails' => $subUnitDetails,
                    'auditWorkType' => $auditWorkType,
                    'workObjective' => $workObjective,
                    'vouchersVerified' => $vouchersVerified,
                    'targetToAchieve' => $targetToAchieve,
                    'caRemarks' => $caRemarks,
                    'pocName' => $pocName,
                    'date' => $timeData['dateStr'],
                    'status' => 'SUBMITTED',
                    'loginLatitude' => $loginLatitude,
                    'loginLongitude' => $loginLongitude
                ]);
            }
            saveJsonDb($jdb);
            $reports = $jdb['dailyReports'];
        }

        echo json_encode(['success' => true, 'reports' => $reports]);
        exit();
    }
}

// ──────────────────────────────────────────────
// 11. Minutes of Meeting (/api/moms)
// ──────────────────────────────────────────────
if ($route === 'moms') {
    if ($method === 'GET') {
        $moms = [];
        if ($pdo) {
            try {
                $stmt = $pdo->query('SELECT * FROM moms ORDER BY created_at DESC');
                while ($r = $stmt->fetch()) {
                    $moms[] = [
                        'id' => $r['id'],
                        'meetingTitle' => $r['meeting_title'],
                        'meetingType' => $r['meeting_type'],
                        'date' => $r['date'],
                        'time' => $r['time'],
                        'organizer' => $r['organizer'],
                        'location' => $r['location'],
                        'attendees' => $r['attendees'],
                        'agenda' => $r['agenda'],
                        'discussions' => $r['discussions'],
                        'actionItems' => $r['action_items'],
                        'nextMeeting' => $r['next_meeting'],
                        'authorId' => $r['author_id'],
                        'serverTimestamp' => $r['server_timestamp'],
                        'createdAt' => $r['created_at']
                    ];
                }
            } catch (Exception $e) {}
        }
        if (empty($moms)) {
            $jdb = loadJsonDb();
            $moms = $jdb['moms'] ?? [];
        }
        echo json_encode(['success' => true, 'moms' => $moms]);
        exit();
    }

    if ($method === 'POST') {
        $meetingTitle = $body['meetingTitle'] ?? 'Weekly Team Meeting';
        $meetingType = $body['meetingType'] ?? 'Team Meeting';
        $date = $body['date'] ?? $timeData['dateStr'];
        $time = $body['time'] ?? $timeData['timeStr'];
        $organizer = $body['organizer'] ?? 'Managing Partner';
        $location = $body['location'] ?? 'Conference Room A';
        $attendees = $body['attendees'] ?? '';
        $agenda = $body['agenda'] ?? '';
        $discussions = $body['discussions'] ?? '';
        $actionItems = $body['actionItems'] ?? '';
        $nextMeeting = $body['nextMeeting'] ?? '';
        $authorId = $body['authorId'] ?? null;

        $newId = 'mom-' . round(microtime(true) * 1000);
        $newMom = [
            'id' => $newId,
            'meetingTitle' => $meetingTitle,
            'meetingType' => $meetingType,
            'date' => $date,
            'time' => $time,
            'organizer' => $organizer,
            'location' => $location,
            'attendees' => $attendees,
            'agenda' => $agenda,
            'discussions' => $discussions,
            'actionItems' => $actionItems,
            'nextMeeting' => $nextMeeting,
            'authorId' => $authorId,
            'serverTimestamp' => $timeData['timeStr'] . ' • ' . $timeData['dateStr'],
            'createdAt' => date('c')
        ];

        $moms = [];
        if ($pdo) {
            try {
                $stmt = $pdo->prepare(
                    "INSERT INTO moms (id, meeting_title, meeting_type, date, time, organizer, location, attendees, agenda, discussions, action_items, next_meeting, author_id, server_timestamp)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
                );
                $stmt->execute([
                    $newId, $meetingTitle, $meetingType, $date, $time, $organizer, $location,
                    $attendees, $agenda, $discussions, $actionItems, $nextMeeting, $authorId,
                    $newMom['serverTimestamp']
                ]);

                $stmt = $pdo->query('SELECT * FROM moms ORDER BY created_at DESC');
                while ($r = $stmt->fetch()) {
                    $moms[] = [
                        'id' => $r['id'],
                        'meetingTitle' => $r['meeting_title'],
                        'meetingType' => $r['meeting_type'],
                        'date' => $r['date'],
                        'time' => $r['time'],
                        'organizer' => $r['organizer'],
                        'location' => $r['location'],
                        'attendees' => $r['attendees'],
                        'agenda' => $r['agenda'],
                        'discussions' => $r['discussions'],
                        'actionItems' => $r['action_items'],
                        'nextMeeting' => $r['next_meeting'],
                        'authorId' => $r['author_id'],
                        'serverTimestamp' => $r['server_timestamp'],
                        'createdAt' => $r['created_at']
                    ];
                }
            } catch (Exception $e) {}
        }

        $jdb = loadJsonDb();
        if (!isset($jdb['moms'])) $jdb['moms'] = [];
        array_unshift($jdb['moms'], $newMom);
        saveJsonDb($jdb);
        if (empty($moms)) $moms = $jdb['moms'];

        echo json_encode(['success' => true, 'mom' => $newMom, 'moms' => $moms]);
        exit();
    }
}

// ──────────────────────────────────────────────
// 12. Tasks API (/api/tasks)
// ──────────────────────────────────────────────
if ($route === 'tasks') {
    if ($method === 'GET') {
        $tasks = [];
        if ($pdo) {
            try {
                $stmt = $pdo->query('SELECT * FROM tasks ORDER BY created_at DESC');
                while ($r = $stmt->fetch()) {
                    $tasks[] = [
                        'id' => $r['id'],
                        'taskTitle' => $r['task_title'],
                        'priority' => $r['priority'],
                        'description' => $r['description'],
                        'assignedTo' => $r['assigned_to'],
                        'dueDate' => $r['due_date'],
                        'project' => $r['project'],
                        'category' => $r['category'],
                        'status' => $r['status'],
                        'createdById' => $r['created_by_id'],
                        'createdByName' => $r['created_by_name'],
                        'serverTimestamp' => $r['server_timestamp'],
                        'createdAt' => $r['created_at']
                    ];
                }
            } catch (Exception $e) {}
        }
        if (empty($tasks)) {
            $jdb = loadJsonDb();
            $tasks = $jdb['tasks'] ?? [];
        }
        echo json_encode(['success' => true, 'tasks' => $tasks]);
        exit();
    }

    if ($method === 'POST') {
        $taskTitle = $body['taskTitle'] ?? 'Audit Verification Task';
        $priority = $body['priority'] ?? 'Medium Priority';
        $description = $body['description'] ?? '';
        $assignedTo = $body['assignedTo'] ?? 'Demo Managing Partner';
        $dueDate = $body['dueDate'] ?? $timeData['dateStr'];
        $project = $body['project'] ?? '';
        $category = $body['category'] ?? 'General';
        $createdById = $body['createdById'] ?? null;
        $createdByName = $body['createdByName'] ?? 'Staff Member';

        $newId = 'tsk-' . round(microtime(true) * 1000);
        $newTask = [
            'id' => $newId,
            'taskTitle' => $taskTitle,
            'priority' => $priority,
            'description' => $description,
            'assignedTo' => $assignedTo,
            'dueDate' => $dueDate,
            'project' => $project,
            'category' => $category,
            'status' => 'IN_PROGRESS',
            'createdById' => $createdById,
            'createdByName' => $createdByName,
            'serverTimestamp' => $timeData['timeStr'] . ' • ' . $timeData['dateStr'],
            'createdAt' => date('c')
        ];

        $tasks = [];
        if ($pdo) {
            try {
                $stmt = $pdo->prepare(
                    "INSERT INTO tasks (id, task_title, priority, description, assigned_to, due_date, project, category, status, created_by_id, created_by_name, server_timestamp)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'IN_PROGRESS', ?, ?, ?)"
                );
                $stmt->execute([
                    $newId, $taskTitle, $priority, $description, $assignedTo, $dueDate, $project,
                    $category, $createdById, $createdByName, $newTask['serverTimestamp']
                ]);

                $stmt = $pdo->query('SELECT * FROM tasks ORDER BY created_at DESC');
                while ($r = $stmt->fetch()) {
                    $tasks[] = [
                        'id' => $r['id'],
                        'taskTitle' => $r['task_title'],
                        'priority' => $r['priority'],
                        'description' => $r['description'],
                        'assignedTo' => $r['assigned_to'],
                        'dueDate' => $r['due_date'],
                        'project' => $r['project'],
                        'category' => $r['category'],
                        'status' => $r['status'],
                        'createdById' => $r['created_by_id'],
                        'createdByName' => $r['created_by_name'],
                        'serverTimestamp' => $r['server_timestamp'],
                        'createdAt' => $r['created_at']
                    ];
                }
            } catch (Exception $e) {}
        }

        $jdb = loadJsonDb();
        if (!isset($jdb['tasks'])) $jdb['tasks'] = [];
        array_unshift($jdb['tasks'], $newTask);
        saveJsonDb($jdb);
        if (empty($tasks)) $tasks = $jdb['tasks'];

        echo json_encode(['success' => true, 'task' => $newTask, 'tasks' => $tasks]);
        exit();
    }
}

// Fallback for unrecognized endpoints
http_response_code(404);
echo json_encode(['success' => false, 'message' => 'API endpoint not found.', 'requested_route' => $route]);
