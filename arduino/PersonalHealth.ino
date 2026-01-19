#include <WiFiS3.h>

#define USE_SSL 1  // Render uses HTTPS

//////////////////////////////////////////////////////////
// WIFI CONFIG
//////////////////////////////////////////////////////////
char ssid[] = "AndroidHotspot";
char pass[] = "uezw6075";

//////////////////////////////////////////////////////////
// SERVER CONFIG (Flask backend)
//////////////////////////////////////////////////////////
char server[] = "your-service.onrender.com";  // Render backend domain
#if USE_SSL
const int port = 443;
WiFiSSLClient client;
#else
const int port = 3000;
WiFiClient client;
#endif

//////////////////////////////////////////////////////////
// DEVICE KEY (from /api/auth/register)
//////////////////////////////////////////////////////////
const char DEVICE_KEY[] = "NwINRyykhA_m58AFC1Rq7U9GjbtKO3vKs57Id0Qy7eA";

unsigned long lastSendMs = 0;
const unsigned long SEND_INTERVAL_MS = 5000;

//////////////////////////////////////////////////////////
// HTTP HELPERS
//////////////////////////////////////////////////////////
String readHttpResponseBody(WiFiClient &c, int &statusCode) {
  String resp = "";
  unsigned long t0 = millis();

  while (c.connected() && (millis() - t0 < 3000)) {
    while (c.available()) {
      resp += (char)c.read();
    }
    if (!c.available()) delay(10);
  }

  statusCode = 0;
  int lineEnd = resp.indexOf("\r\n");
  if (lineEnd > 0) {
    String statusLine = resp.substring(0, lineEnd);
    int firstSpace = statusLine.indexOf(' ');
    if (firstSpace >= 0) {
      int secondSpace = statusLine.indexOf(' ', firstSpace + 1);
      String codeStr = statusLine.substring(
        firstSpace + 1,
        secondSpace > 0 ? secondSpace : statusLine.length()
      );
      statusCode = codeStr.toInt();
    }
  }

  int idx = resp.indexOf("\r\n\r\n");
  if (idx >= 0) return resp.substring(idx + 4);
  return resp;
}

bool httpPostJson(
  const char *path,
  const String &headers,
  const String &body,
  String &outBody,
  int &statusCode
) {
  if (!client.connect(server, port)) {
    Serial.println("ERROR: connect failed");
    return false;
  }

  client.print("POST ");
  client.print(path);
  client.println(" HTTP/1.1");

  client.print("Host: ");
  client.println(server);

  client.println("Content-Type: application/json");
  client.println("Connection: close");

  if (headers.length() > 0) client.print(headers);

  client.print("Content-Length: ");
  client.println(body.length());
  client.println();
  client.println(body);

  outBody = readHttpResponseBody(client, statusCode);
  client.stop();
  return true;
}

//////////////////////////////////////////////////////////
// SEND MEASUREMENT (FAKE DATA)
//////////////////////////////////////////////////////////
bool sendMeasurement(float bpm, float temperature) {
  if (strlen(DEVICE_KEY) < 10) {
    Serial.println("ERROR: DEVICE_KEY ontbreekt");
    return false;
  }

  String body = "{";
  body += "\"bpm\":";
  body += String(bpm, 1);
  body += ",\"temperatuur_c\":";
  body += String(temperature, 1);
  body += "}";

  String headers = "X-DEVICE-KEY: ";
  headers += DEVICE_KEY;
  headers += "\r\n";

  Serial.print("-> POST /api/measurements ");
  Serial.println(body);

  String respBody;
  int statusCode = 0;
  if (!httpPostJson("/api/measurements", headers, body, respBody, statusCode)) return false;

  Serial.print("HTTP status: ");
  Serial.println(statusCode);
  Serial.print("Response: ");
  Serial.println(respBody);
  return true;
}

//////////////////////////////////////////////////////////
// SETUP
//////////////////////////////////////////////////////////
void setup() {
  Serial.begin(115200);
  delay(1000);

  randomSeed(analogRead(A0));

  Serial.println("=== Arduino R4 WiFi | Fake Health Sensor ===");

  Serial.print("WiFi verbinden: ");
  Serial.println(ssid);

  WiFi.begin(ssid, pass);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }

  Serial.println();
  Serial.print("OK: WiFi connected | IP: ");
  Serial.println(WiFi.localIP());

  if (strlen(DEVICE_KEY) < 10) {
    Serial.println("WARN: DEVICE_KEY ontbreekt of te kort");
  }

  lastSendMs = millis();
}

//////////////////////////////////////////////////////////
// LOOP
//////////////////////////////////////////////////////////
void loop() {
  unsigned long now = millis();

  if (now - lastSendMs >= SEND_INTERVAL_MS) {
    lastSendMs = now;

    if (WiFi.status() != WL_CONNECTED) {
      Serial.println("ERROR: WiFi weg");
      return;
    }

    float fakeBpm  = random(60, 101);
    float fakeTemp = random(360, 381) / 10.0;

    Serial.print("Fake data -> BPM: ");
    Serial.print(fakeBpm);
    Serial.print(" | Temp: ");
    Serial.println(fakeTemp);

    sendMeasurement(fakeBpm, fakeTemp);
  }
}
