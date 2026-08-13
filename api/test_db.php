<?php
header("Content-Type: application/json");
$dbHost = 'sdb-66.hosting.stackcp.net';
$dbName = 'newversion1-353034319494';
$dbUser = 'n1';
$dbPass = 'Charan@2004';

$result = [
    'status' => 'testing',
    'timestamp' => date('c'),
    'php_version' => PHP_VERSION,
    'host' => $dbHost,
    'database' => $dbName
];

try {
    $pdo = new PDO("mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_TIMEOUT => 4
    ]);
    $stmt = $pdo->query("SELECT COUNT(*) as user_count FROM users");
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    $result['status'] = 'SUCCESS';
    $result['message'] = 'Successfully connected to MySQL database via StackCP host!';
    $result['users_in_db'] = (int)$row['user_count'];
} catch (Exception $e) {
    // Try localhost fallback
    try {
        $pdo = new PDO("mysql:host=localhost;dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_TIMEOUT => 2
        ]);
        $stmt = $pdo->query("SELECT COUNT(*) as user_count FROM users");
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        $result['status'] = 'SUCCESS_LOCALHOST';
        $result['message'] = 'Connected via localhost fallback!';
        $result['users_in_db'] = (int)$row['user_count'];
    } catch (Exception $e2) {
        $result['status'] = 'ERROR';
        $result['error_remote'] = $e->getMessage();
        $result['error_local'] = $e2->getMessage();
    }
}

echo json_encode($result, JSON_PRETTY_PRINT);
