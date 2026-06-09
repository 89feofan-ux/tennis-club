from http.server import BaseHTTPRequestHandler
import json
import requests

BOT_TOKEN="8948..."
APP_URL = "https://tennis-club-o84m.vercel.app"

def send_message(chat_id, text, reply_markup=None):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        data["reply_markup"] = json.dumps(reply_markup)
    try:
        requests.post(url, data=data, timeout=10)
    except:
        pass

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = self.rfile.read(length)
            update = json.loads(body)
        except:
            self._respond(200, "OK")
            return

        if "message" in update:
            msg = update["message"]
            chat_id = msg["chat"]["id"]
            text = msg.get("text", "")

            if text == "/start":
                markup = {
                    "inline_keyboard": [[
                        {"text": "🎾 Открыть расписание", "web_app": {"url": f"{APP_URL}/index.html"}}
                    ]]
                }
                send_message(chat_id,
                    "🎾 <b>Теннисный Клуб</b>\n\n"
                    "Здесь ты можешь:\n"
                    "📅 Посмотреть свободное время на кортах\n"
                    "✅ Забронировать слот\n"
                    "🔄 Продать или купить время у других игроков\n\n"
                    "Нажми кнопку ниже, чтобы открыть расписание 👇",
                    markup)
            else:
                send_message(chat_id, "Привет! Нажми «🎾 Открыть расписание», чтобы начать.")

        self._respond(200, "OK")

    def do_GET(self):
        self._respond(200, "Bot webhook is running")

    def _respond(self, code, text):
        self.send_response(code)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write(text.encode())
