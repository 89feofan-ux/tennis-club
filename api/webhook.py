# Vercel serverless API — webhook for Telegram bot
import json
from http.server import BaseHTTPRequestHandler

BOT_TOKEN = "8948901627:AAH8tbHmqZFRhdaETXSIDROvcvsyRrL_Goc"

def send_message(chat_id, text, reply_markup=None):
    import http.client
    import urllib.parse
    params = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        params["reply_markup"] = json.dumps(reply_markup)
    body = urllib.parse.urlencode(params).encode()
    conn = http.client.HTTPSConnection("api.telegram.org", timeout=5)
    conn.request("POST", f"/bot{BOT_TOKEN}/sendMessage", body,
                 {"Content-Type": "application/x-www-form-urlencoded"})
    conn.getresponse().read()
    conn.close()

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._json(200, {"status": "ok", "endpoint": "telegram webhook"})

    def do_OPTIONS(self):
        self._json(200, {})

    def do_POST(self):
        try:
            length = int(self.headers.get(\'Content-Length\', 0))
            body = json.loads(self.rfile.read(length).decode())

            msg = body.get("message", {})
            chat_id = msg.get("chat", {}).get("id")
            text = msg.get("text", "")

            if not chat_id:
                self._json(200, {"ok": False})
                return

            if text == "/start":
                mini_app_url = "https://tennis-swap.vercel.app"
                reply_markup = {
                    "inline_keyboard": [[
                        {"text": "🎾 Открыть TennisSwap", "web_app": {"url": mini_app_url}}
                    ]]
                }
                send_message(chat_id,
                    "🎾 <b>TennisSwap — бронирование кортов</b>\n\n"
                    "Нажми кнопку ниже, чтобы открыть приложение.\n"
                    "Выбери игрока из списка или войди как администратор.",
                    reply_markup
                )
            else:
                send_message(chat_id, "Используй /start чтобы открыть TennisSwap")

            self._json(200, {"ok": True})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def _json(self, code, obj):
        self.send_response(code)
        self.send_header(\'Content-type\', \'application/json\')
        self.send_header(\'Access-Control-Allow-Origin\', \'*\')
        self.end_headers()
        self.wfile.write(json.dumps(obj, ensure_ascii=False).encode())
