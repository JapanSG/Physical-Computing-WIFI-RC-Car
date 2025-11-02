/*
  ESP32 Web-Car Controller (updated for ESP32 Arduino core 3.x+ LEDC API)
  - AP SSID: "ESP32_Car" (no password)
  - Controls: w = forward, s = backward, a = left, d = right
  - Motor wiring:
      EN (speed PWM) -> GPIO 14
      IN1 (dir)      -> GPIO 26
      IN2 (dir)      -> GPIO 27
  - Servo signal -> GPIO 13
*/

#include <Arduino.h>

#ifndef ARDUINO_ARCH_ESP32
  #error "This sketch requires an ESP32 board. Select an ESP32 board in Tools->Board (install 'esp32' from Boards Manager if needed), then restart the IDE."
#endif

#ifdef ARDUINO_ARCH_ESP32
  #include "driver/ledc.h"
  #include <WiFi.h>
  #include <WebServer.h>
#endif

// ======= Pin configuration =======
const int PIN_MOTOR_EN  = 14;   // PWM enable pin
const int PIN_MOTOR_IN1 = 26;   // Motor direction IN1
const int PIN_MOTOR_IN2 = 27;   // Motor direction IN2
const int PIN_SERVO     = 13;   // Servo PWM signal

// ======= PWM configuration (new API uses pin-based attach) =======
// Motor PWM (use analog-style 8-bit range for convenience)
const uint32_t MOTOR_FREQ = 2000;    // 2 kHz for motors (adjust if needed)
const uint8_t  MOTOR_RES  = 8;       // 8-bit resolution (0..255)

// Servo: 50Hz
const uint32_t SERVO_FREQ = 50;      // 50 Hz for hobby servo
const uint8_t  SERVO_RES  = 16;      // bits of resolution for servo duty (1..20 allowed)

// Motor speed (0..maxMotor)
const uint8_t maxMotor = 200;       // change if you want slower/faster ( <= 255 for RES=8 )

// Servo pulse widths (microseconds)
const int SERVO_US_MIN = 0;  // full left (adjust if needed)
const int SERVO_US_CENTER = 600;
const int SERVO_US_MAX = 2000;  // full right (adjust if needed)
const int SERVO_LEFT_US   = 350; 
const int SERVO_RIGHT_US  = 850;
const int SERVO_CENTER_US = SERVO_US_CENTER;

// ======= WiFi / Web server =======
WebServer server(80);
const char *AP_SSID = "ESP32_Car";
const char *AP_PSWD = ""; // open AP

// ======= Helper: convert microsecond pulse to duty for ledcWrite(pin, duty) =======
uint32_t servoDutyFromMicroseconds(int us) {
  // period in microseconds:
  const double period_us = 1e6 / (double)SERVO_FREQ; // ~20000 us for 50Hz
  const uint32_t maxDuty = (1UL << SERVO_RES) - 1;
  double fraction = (double)us / period_us;
  if (fraction < 0) fraction = 0;
  if (fraction > 1) fraction = 1;
  uint32_t duty = (uint32_t)(fraction * (double)maxDuty + 0.5);
  if (duty > maxDuty) duty = maxDuty;
  return duty;
}

// ======= Motor control helpers (direction pins + enable PWM on PIN_MOTOR_EN) =======
void motorStop() {
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, LOW);
  // set PWM duty to 0
  ledcWrite(PIN_MOTOR_EN, 0);
}

void motorForward(uint8_t speed) {
  digitalWrite(PIN_MOTOR_IN1, HIGH);
  digitalWrite(PIN_MOTOR_IN2, LOW);
  if (speed > maxMotor) speed = maxMotor;
  ledcWrite(PIN_MOTOR_EN, speed); // ledcWrite(pin, duty) expects duty in 0..(2^resolution -1)
}

void motorBackward(uint8_t speed) {
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, HIGH);
  if (speed > maxMotor) speed = maxMotor;
  ledcWrite(PIN_MOTOR_EN, speed);
}

// ======= Servo helpers =======
void servoWritePulse(int us) {
  uint32_t duty = servoDutyFromMicroseconds(us);
  ledcWrite(PIN_SERVO, duty);
}

void servoCenter() { servoWritePulse(SERVO_CENTER_US); }
void servoLeft()   { servoWritePulse(SERVO_LEFT_US); }
void servoRight()  { servoWritePulse(SERVO_RIGHT_US); }

// ======= Web page =======
const char indexHtml[] PROGMEM = R"rawliteral(
<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <title>ESP32 Car Control</title>
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    body { font-family: Arial, Helvetica, sans-serif; text-align:center; margin: 20px; }
    .kbd { font-size: 18px; padding: 6px 12px; border:1px solid #999; display:inline-block; margin:4px; }
    #status { margin-top:12px; color:#333; }
    button { padding:10px 14px; margin:6px; }
  </style>
</head>
<body>
  <h2>ESP32 Car - Keyboard Control</h2>
  <p>Use keys: 
    <span class="kbd">W</span> forward, 
    <span class="kbd">S</span> backward, 
    <span class="kbd">A</span> left, 
    <span class="kbd">D</span> right.
    <br>
  Release key -> stops (keyup sends stop).</p>

  <div>
    <button onclick="sendCmd('forward')">Forward (w)</button>
    <button onclick="sendCmd('backward')">Backward (s)</button>
    <button onclick="sendCmd('left')">Left (a)</button>
    <button onclick="sendCmd('right')">Right (d)</button>
    <button onclick="sendCmd('stop')">Stop</button>
  </div>

  <p id="status">Status: ready</p>

<script>
  let lastKey = null;
  const statusEl = document.getElementById('status');

  function sendCmd(cmd) {
    fetch('/cmd?c='+encodeURIComponent(cmd)).catch((e)=>{ /* ignore */ });
    statusEl.textContent = 'Status: sent ' + cmd;
  }

  window.addEventListener('keydown', function(e) {
    const k = e.key.toLowerCase();
    if (lastKey === k) return; // ignore auto-repeat
    lastKey = k;
    if (k === 'w') sendCmd('forward');
    else if (k === 's') sendCmd('backward');
    else if (k === 'a') sendCmd('left');
    else if (k === 'd') sendCmd('right');
  });

  window.addEventListener('keyup', function(e) {
    const k = e.key.toLowerCase();
    if (k === 'w' || k === 's') {
      sendCmd('stop');
    }
    else if (k === 'a' || k === 'd') {
      sendCmd('stopserv');
    }
    lastKey = null;
  });

  window.addEventListener('blur', function() {
    sendCmd('stop');
    lastKey = null;
  });

  // Touch support: touchstart -> press, touchend -> stop
  document.querySelectorAll('button').forEach(btn=>{
    btn.addEventListener('touchstart', (ev)=> {
      const txt = btn.textContent.toLowerCase();
      if (txt.indexOf('forward') >= 0) sendCmd('forward');
      else if (txt.indexOf('backward') >= 0) sendCmd('backward');
      else if (txt.indexOf('left') >= 0) sendCmd('left');
      else if (txt.indexOf('right') >= 0) sendCmd('right');
      ev.preventDefault();
    });
    btn.addEventListener('touchend', (ev)=> {
      sendCmd('stop');
      ev.preventDefault();
    });
  });
</script>
</body>
</html>
)rawliteral";

// ======= Web handlers =======
void handleRoot() {
  server.send_P(200, "text/html", indexHtml);
}

void handleCmd() {
  String cmd = server.arg("c");
  cmd.trim();
  if (cmd == "forward") {
    motorForward(maxMotor);
  } else if (cmd == "backward") {
    motorBackward(maxMotor);
  } else if (cmd == "stop") {
    motorStop();
  } else if (cmd == "stopserv"){
    servoCenter();
  } else if (cmd == "left") {
    servoLeft();
  } else if (cmd == "right") {
    servoRight();
  } else {
    motorStop();
  }
  server.send(200, "text/plain", "OK");
}

// ======= Setup / Loop =======
void setup() {
  Serial.begin(115200);
  delay(200);

  // Direction pins
  pinMode(PIN_MOTOR_IN1, OUTPUT);
  pinMode(PIN_MOTOR_IN2, OUTPUT);
  digitalWrite(PIN_MOTOR_IN1, LOW);
  digitalWrite(PIN_MOTOR_IN2, LOW);

  // Attach LEDC to the motor enable pin (new API)
  // returns true on success; if it fails you will see it in Serial
  if (!ledcAttach(PIN_MOTOR_EN, MOTOR_FREQ, MOTOR_RES)) {
    Serial.println("Failed to attach LEDC to motor EN pin!");
  }

  // Attach LEDC to the servo pin (50Hz)
  if (!ledcAttach(PIN_SERVO, SERVO_FREQ, SERVO_RES)) {
    Serial.println("Failed to attach LEDC to servo pin!");
  }

  // Ensure motors stopped and servo centered at start
  motorStop();
  servoCenter();

  // Start WiFi AP
  WiFi.softAP(AP_SSID, AP_PSWD);
  IPAddress myIP = WiFi.softAPIP();
  Serial.printf("AP started: %s\n", AP_SSID);
  Serial.print("IP address: ");
  Serial.println(myIP);

  // Setup web routes
  server.on("/", handleRoot);
  server.on("/cmd", handleCmd);
  server.begin();
  Serial.println("HTTP server started");
}

void loop() {
  server.handleClient();
}
