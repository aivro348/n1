<?php
/**
 * CA Buddy — Database Connection Test
 * Visit /api/test_db.php to verify MySQL connectivity
 */
require_once __DIR__ . '/config.php';

header("Content-Type: application/json");
header("Access-Control-Allow-Origin: *");

$result = [
    'status' => 'testing',
    'timestamp' => date('c'),
    'php_version' => PHP_VERSION,
    'host' => DB_HOST,
    'database' => DB_NAME,
    'user' => DB_USER
];

try {
    $pdo = new PDO("mysql:host=" . DB_HOST . ";dbname=" . DB_NAME . ";charset=utf8mb4", DB_USER, DB_PASS, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 4
    ]);
    $stmt = $pdo->query("SELECT COUNT(*) as user_count FROM users");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $result['status'] = 'SUCCESS';
    $result['message'] = 'Successfully connected to Hostinger MySQL database!';
    $result['users_in_db'] = (int)$row['user_count'];
} catch (Exception $e) {
    try {
        $pdo = new PDO("mysql:host=127.0.0.1;dbname=" . DB_NAME . ";charset=utf8mb4", DB_USER, DB_PASS, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 3
        ]);
        $stmt = $pdo->query("SELECT COUNT(*) as user_count FROM users");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $result['status'] = 'SUCCESS_127_0_0_1';
        $result['message'] = 'Connected via 127.0.0.1 fallback!';
        $result['users_in_db'] = (int)$row['user_count'];
    } catch (Exception $e2) {
        $result['status'] = 'ERROR';
        $result['error_primary'] = $e->getMessage();
        $result['error_fallback'] = $e2->getMessage();
    }
}

echo json_encode($result, JSON_PRETTY_PRINT);
