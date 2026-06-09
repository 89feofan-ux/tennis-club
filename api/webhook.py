# Vercel serverless function for Telegram bot
import json
import os
import requests
from http.server import BaseHTTPRequestHandler

BOT_TOKEN = "8948901627:AAGejhr0inMz8dbvRPTWLdc883-F0wNx8Zw"
# Mini App URL
APP_URL = "https://теннисный-клуб-восемь.vercel.app"

def send_message(chat_id, text, reply_markup=None):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        data["reply_markup"] = json.dumps(reply_markup)
    try:
        r = requests.post(url, data=data, timeout=10)
        return r.json()
    except Exception as e:
        print(f"send_message error: {e}")
        return None

class handler(BaseHTTPRequestHandler):
    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        body = self.rfile.read(content_length)
        update = json.loads(body)
        print(f"Update: {json.dumps(update, ensure_ascii=False)[:200]}")

        if "message" in update:
            msg = update["message"]
            chat_id = msg["chat"]["id"]
            text = msg.get("text", "")

            if text == "/start":
                reply_markup = {
                    "inline_keyboard": [[
                        {
                            "text": "🎾 Открыть расписание",
                            "web_app": {"url": f"{APP_URL}/index.html"}
                        }
                    ]]
                }
                send_message(
                    chat_id,
                    "🎾 <b>Теннисный Клуб</b>\n\n"
                    "Здесь ты можешь:\n"
                    "📅 Посмотреть свободное время на кортах\n"
                    "✅ Забронировать слот\n"
                    "🔄 Продать или купить время у других игроков\n\n"
                    "Нажми кнопку ниже, чтобы открыть расписание 👇",
                    reply_markup=reply_markup
                )
            else:
                send_message(chat_id, "Привет! Нажми «🎾 Открыть расписание», чтобы начать.")

        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write(b"OK")

    def do_GET(self):
        self.send_response(200)
        self.send_header('Content-type', 'text/plain')
        self.end_headers()
        self.wfile.write(b"Bot webhook is running")
