from http.server import BaseHTTPRequestHandler
import json
import urllib.request
import urllib.parse

BOT_TOKEN="8948901627:AAGejhr0inMz8dbvRPTWLdc883-F0wNx8Zw"
APP_URL="https://tennis-club-o84m.vercel.app"

def send_tg(method, data):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/{method}"
    body = urllib.parse.urlencode(data).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    try:
        urllib.request.urlopen(req, timeout=10)
    except:
        pass

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            update = json.loads(body)
        except:
            self._ok()
            return

        if "message" in update:
            msg = update["message"]
            chat_id = msg["chat"]["id"]
            text = msg.get("text", "")

            if text == "/start":
                markup = json.dumps({
                    "inline_keyboard": [[
                        {"text": "🎾 Открыть расписание", "web_app": {"url": f"{APP_URL}/index.html"}}
                    ]]
                })
                send_tg("sendMessage", {
                    "chat_id": chat_id,
                    "text": "🎾 Теннисный Клуб\n\nЗдесь ты можешь:\n📅 Посмотреть расписание\n✅ Забронировать слот\n🔄 Продать время другим игрокам\n\nНажми кнопку ниже:",
                    "reply_markup": markup
                })

        self._ok()

    def do_GET(self):
        self._ok()

    def _ok(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write(b"OK")
