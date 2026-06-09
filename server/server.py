# server.py — Mini App сервер для Telegram бота
import json
import os
import logging
from flask import Flask, request, send_from_directory, jsonify
import requests

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = Flask(__name__, static_folder='..', static_url_path='')

BOT_TOKEN = "8948901627:AAGejhr0inMz8dbvRPTWLdc883-F0wNx8Zw"
# Временно localhost — потом заменим на реальный домен/ngrok
BASE_URL = "https://3a6b305217835f.lhr.life"

# ====== Telegram API helpers ======
def send_message(chat_id, text, reply_markup=None):
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/sendMessage"
    data = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        data["reply_markup"] = json.dumps(reply_markup)
    try:
        r = requests.post(url, data=data, timeout=10)
        logger.info(f"send_message: {r.status_code}")
        return r.json()
    except Exception as e:
        logger.error(f"send_message error: {e}")
        return None

# ====== Webhook handler ======
@app.route(f"/webhook/{BOT_TOKEN}", methods=["POST"])
def webhook():
    update = request.get_json()
    logger.info(f"Update: {json.dumps(update, ensure_ascii=False)[:200]}")

    if "message" in update:
        msg = update["message"]
        chat_id = msg["chat"]["id"]
        text = msg.get("text", "")

        if text == "/start":
            # Приветственное сообщение с кнопкой Mini App
            reply_markup = {
                "inline_keyboard": [[
                    {
                        "text": "🎾 Открыть расписание",
                        "web_app": {"url": f"{BASE_URL}/index.html"}
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
            send_message(chat_id, f"Привет! Нажми «🎾 Открыть расписание», чтобы начать.")

    return "OK"

# ====== Serve Mini App files ======
@app.route("/")
def serve_index():
    return send_from_directory('../', 'index.html')

@app.route("/<path:filename>")
def serve_file(filename):
    return send_from_directory('..', filename)

# ====== Webhook setup ======
@app.route("/setup", methods=["GET"])
def setup_webhook():
    webhook_url = f"{BASE_URL}/webhook/{BOT_TOKEN}"
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/setWebhook"
    r = requests.post(url, data={"url": webhook_url}, timeout=10)
    return jsonify(r.json())

@app.route("/info", methods=["GET"])
def bot_info():
    url = f"https://api.telegram.org/bot{BOT_TOKEN}/getWebhookInfo"
    r = requests.get(url, timeout=10)
    return jsonify(r.json())

if __name__ == "__main__":
    logger.info(f"Starting server on {BASE_URL}")
    app.run(host="0.0.0.0", port=5000, debug=True)
