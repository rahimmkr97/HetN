<?php
// H&N Packaging - quote form -> e-mail (for hosting with PHP).
// To use it, open app.js and set:  var QUOTE_ENDPOINT = 'send.php';
$TO   = 'commercial@hn-packaging.com';
$FROM = 'site@hn-packaging.com';           // an address of your own domain (better deliverability)

header('Content-Type: application/json; charset=utf-8');
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { http_response_code(405); echo json_encode(['success' => false]); exit; }

$raw = file_get_contents('php://input');
$in = json_decode($raw, true);
if (!is_array($in)) { $in = $_POST; }
if (!empty($in['_honey'])) { echo json_encode(['success' => true]); exit; }   // robot: pretend it worked

$clean = function ($v) { return trim(str_replace(["\r", "\n"], ' ', strip_tags((string)$v))); };
$subject = $clean($in['_subject'] ?? 'Nouvelle demande de devis (site web)');
$reply = filter_var($in['_replyto'] ?? '', FILTER_VALIDATE_EMAIL);

$lines = [];
foreach ($in as $k => $v) {
    if (strpos((string)$k, '_') === 0) continue;
    $lines[] = $clean($k) . ' : ' . trim(strip_tags((string)$v));
}
if (!$lines || strlen($raw) > 20000) { http_response_code(400); echo json_encode(['success' => false]); exit; }
$body = implode("\n", $lines) . "\n\n-- \nEnvoyé depuis le site H&N Packaging";

$headers = "From: H&N Packaging <$FROM>\r\n" . ($reply ? "Reply-To: $reply\r\n" : '') .
           "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n";
$ok = mail($TO, '=?UTF-8?B?' . base64_encode($subject) . '?=', $body, $headers);
http_response_code($ok ? 200 : 500);
echo json_encode(['success' => (bool)$ok]);
