<?php
header("Content-Type: application/json");

$dbHost = getenv('DB_HOST') ?: 'localhost';
$dbName = getenv('DB_NAME') ?: 'u110415653_cabuddy';
$dbUser = getenv('DB_USER') ?: 'u110415653_admin2';
$dbPass = getenv('DB_PASSWORD') ?: (getenv('DB_PASS') ?: 'Charan@18042004');

$result = [
    'status' => 'testing',
    'timestamp' => date('c'),
    'php_version' => PHP_VERSION,
    'host' => $dbHost,
    'database' => $dbName,
    'user' => $dbUser
];

try {
    $pdo = new PDO("mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass, [
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
        $pdo = new PDO("mysql:host=127.0.0.1;dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass, [
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
