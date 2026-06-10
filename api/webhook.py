# Vercel serverless API — webhook for Telegram bot + TennisSwap агент
import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen
from datetime import date, datetime

BOT_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN", "")
KV_URL = os.environ.get("KV_REST_API_URL", "https://holy-beagle-145944.upstash.io")
KV_TOKEN = os.environ.get("KV_REST_API_TOKEN", "")

def kv_get(key):
    url = f"{KV_URL}/get/{key}"
    req = Request(url, headers={"Authorization": f"Bearer {KV_TOKEN}"})
    try:
        resp = urlopen(req, timeout=5)
        data = json.loads(resp.read().decode())
        return json.loads(data["result"]) if data.get("result") else None
    except:
        return None

def kv_set(key, value):
    url = f"{KV_URL}/set/{key}"
    data = json.dumps(value, ensure_ascii=False).encode()
    req = Request(url, data=data, headers={
        "Authorization": f"Bearer {KV_TOKEN}",
        "Content-Type": "application/json",
    })
    try:
        urlopen(req, timeout=5)
        return True
    except:
        return False

def load_data():
    data = kv_get("ts_data")
    if data:
        return data
    return {"players": [], "courts": [], "slots": [], "weekStart": None}

def save_data(data):
    kv_set("ts_data", data)

def send_message(chat_id, text, reply_markup=None):
    params = {"chat_id": chat_id, "text": text, "parse_mode": "HTML"}
    if reply_markup:
        params["reply_markup"] = json.dumps(reply_markup)
    body = json.dumps(params).encode()
    import http.client
    conn = http.client.HTTPSConnection("api.telegram.org", timeout=5)
    conn.request("POST", f"/bot{BOT_TOKEN}/sendMessage", body,
                 {"Content-Type": "application/json"})
    resp = conn.getresponse()
    resp.read()
    conn.close()

def send_menu(chat_id):
    mini_app_url = "https://tennis-swap.vercel.app"
    reply_markup = {
        "inline_keyboard": [[
            {"text": "🎾 Открыть TennisSwap", "web_app": {"url": mini_app_url}}
        ]]
    }
    send_message(chat_id,
        "🎾 <b>TennisSwap — бронирование кортов</b>\n\n"
        "Команды:\n"
        "/free — свободные слоты\n"
        "/today — слоты на сегодня\n"
        "/week — расписание на неделю\n"
        "/players — список игроков\n"
        "/book [дата] [время] — забронировать слот\n"
        "/my — мои слоты\n"
        "/status — статистика",
        reply_markup
    )

def cmd_free(chat_id):
    data = load_data()
    courts = {c["id"]: c["name"] for c in data.get("courts", [])}
    free = [s for s in data.get("slots", []) if s["status"] == "free"]
    free.sort(key=lambda s: (s["date"], s["time"]))

    if not free:
        send_message(chat_id, "🟢 Свободных слотов нет")
        return

    # Группируем по датам
    by_date = {}
    for s in free:
        by_date.setdefault(s["date"], []).append(s)

    msg = "🟢 <b>Свободные слоты:</b>\n\n"
    count = 0
    for date_str in sorted(by_date.keys()):
        if count >= 40:
            msg += f"\n... и ещё слоты"
            break
        msg += f"📅 <b>{date_str}</b>\n"
        for s in by_date[date_str][:6]:
            court = courts.get(s["courtId"], "?")
            msg += f"  {s['time']} — {court} ({s['price']}₽)\n"
            count += 1
        if len(by_date[date_str]) > 6:
            msg += f"  ... ещё {len(by_date[date_str])-6}\n"
        msg += "\n"

    send_message(chat_id, msg.strip())

def cmd_today(chat_id):
    today = date.today().isoformat()
    data = load_data()
    courts = {c["id"]: c["name"] for c in data.get("courts", [])}
    players = {p["id"]: p["name"] for p in data.get("players", [])}
    slots = [s for s in data.get("slots", []) if s["date"] == today]
    slots.sort(key=lambda s: (s["time"], s["courtId"]))

    if not slots:
        send_message(chat_id, f"На {today} слотов нет")
        return

    msg = f"📅 <b>Слоты на {today}:</b>\n\n"
    for s in slots:
        icon = {"free": "🟢", "booked": "🔴", "selling": "🟡"}.get(s["status"], "⚪")
        owner = players.get(s["ownerId"], "") if s["ownerId"] else ""
        court = courts.get(s["courtId"], "?")
        if owner:
            msg += f"  {icon} {s['time']} — {court} — {owner}\n"
        else:
            msg += f"  {icon} {s['time']} — {court}\n"
    send_message(chat_id, msg.strip())

def cmd_week(chat_id):
    data = load_data()
    wk = data.get("weekStart")
    if not wk:
        send_message(chat_id, "Неделя не установлена. Попроси админа.")
        return

    courts = {c["id"]: c["name"] for c in data.get("courts", [])}
    players = {p["id"]: p["name"] for p in data.get("players", [])}

    from datetime import timedelta
    start = datetime.strptime(wk, "%Y-%m-%d")
    msg = f"📅 <b>Расписание (с {wk}):</b>\n\n"
    for i in range(7):
        d = (start + timedelta(days=i)).strftime("%Y-%m-%d")
        slots = [s for s in data.get("slots", []) if s["date"] == d]
        slots.sort(key=lambda x: (x["time"], x["courtId"]))
        if not slots:
            continue
        msg += f"<b>{d}:</b>\n"
        for s in slots[:5]:
            icon = {"free": "🟢", "booked": "🔴", "selling": "🟡"}.get(s["status"], "⚪")
            court = courts.get(s["courtId"], "?")
            owner = players.get(s["ownerId"], "") if s["ownerId"] else ""
            owner_str = f" — {owner}" if owner else ""
            msg += f"  {icon} {s['time']} — {court}{owner_str}\n"
        if len(slots) > 5:
            msg += f"  ... ещё {len(slots)-5}\n"
        msg += "\n"

    free_count = len([s for s in data.get("slots", []) if s["status"] == "free"])
    msg += f"🟢 Всего свободных: {free_count}"
    send_message(chat_id, msg.strip())

def cmd_players(chat_id):
    data = load_data()
    players = [p for p in data.get("players", []) if not p.get("isAdmin")]
    if not players:
        send_message(chat_id, "Нет игроков")
        return
    msg = "👥 <b>Игроки:</b>\n\n"
    for p in players:
        phone = f" 📞{p.get('phone','')}" if p.get("phone") else ""
        msg += f"  {p['name']}{phone}\n"
    send_message(chat_id, msg.strip())

def cmd_book(chat_id, args):
    if len(args) < 2:
        send_message(chat_id, "Напиши: /book ДАТА ВРЕМЯ\nНапример: /book 2026-06-12 15:00")
        return
    book_date, book_time = args[0], args[1]
    data = load_data()
    slots = data.get("slots", [])

    # Ищем свободный слот
    found = None
    for s in slots:
        if s["date"] == book_date and s["time"] == book_time and s["status"] == "free":
            found = s
            break

    if not found:
        send_message(chat_id, f"Слот {book_date} {book_time} не найден или уже занят. Проверь /free")
        return

    # Создаём временного игрока из Telegram
    player_id = "tg_" + str(chat_id)
    players = data.get("players", [])
    existing = [p for p in players if p["id"] == player_id]
    if not existing:
        players.append({
            "id": player_id,
            "name": f"tg_{chat_id}",
            "phone": "",
            "isAdmin": False,
            "telegramId": str(chat_id),
        })
        data["players"] = players

    # Бронируем
    found["status"] = "booked"
    found["ownerId"] = player_id
    found["sellingPrice"] = None
    save_data(data)

    court_name = "?"
    courts = {c["id"]: c["name"] for c in data.get("courts", [])}
    court_name = courts.get(found["courtId"], "?")

    send_message(chat_id,
        f"✅ <b>Слот забронирован!</b>\n\n"
        f"  {court_name}\n"
        f"  {found['date']} в {found['time']}\n"
        f"  {found['price']}₽\n\n"
        f"💳 Оплата по СБП отдельно от приложения."
    )

def cmd_my(chat_id):
    player_id = "tg_" + str(chat_id)
    data = load_data()
    courts = {c["id"]: c["name"] for c in data.get("courts", [])}
    my = [s for s in data.get("slots", []) if s.get("ownerId") == player_id and s["status"] != "free"]

    if not my:
        send_message(chat_id, "У вас нет забронированных слотов")
        return

    msg = "📋 <b>Мои слоты:</b>\n\n"
    for s in sorted(my, key=lambda x: (x["date"], x["time"])):
        court = courts.get(s["courtId"], "?")
        status = "Забронирован" if s["status"] == "booked" else "Продаётся"
        msg += f"  {s['date']} {s['time']} — {court} — {status}\n"
    send_message(chat_id, msg.strip())

def cmd_status(chat_id):
    data = load_data()
    slots = data.get("slots", [])
    free = len([s for s in slots if s["status"] == "free"])
    booked = len([s for s in slots if s["status"] == "booked"])
    selling = len([s for s in slots if s["status"] == "selling"])
    players = len([p for p in data.get("players", []) if not p.get("isAdmin")])
    courts = len(data.get("courts", []))
    week = data.get("weekStart", "не установлена")

    send_message(chat_id,
        f"📊 <b>Статистика TennisSwap:</b>\n\n"
        f"  Корты: {courts}\n"
        f"  Игроки: {players}\n"
        f"  Всего слотов: {len(slots)}\n"
        f"  🟢 Свободно: {free}\n"
        f"  🔴 Занято: {booked}\n"
        f"  🟡 Продаётся: {selling}\n"
        f"  Неделя: {week}"
    )

def handle_update(chat_id, text):
    if not text:
        return

    lower = text.lower().strip()

    if lower == "/start":
        send_menu(chat_id)
    elif lower == "/free" or "свобод" in lower:
        cmd_free(chat_id)
    elif lower == "/today" or "сегодня" in lower:
        cmd_today(chat_id)
    elif lower == "/week" or lower == "/week " or "недел" in lower or "распис" in lower:
        cmd_week(chat_id)
    elif lower == "/players" or "игрок" in lower:
        cmd_players(chat_id)
    elif lower.startswith("/book"):
        args = text.split()[1:]
        cmd_book(chat_id, args)
    elif lower == "/my" or "мои" in lower or "мой" in lower:
        cmd_my(chat_id)
    elif lower == "/status" or "статистик" in lower:
        cmd_status(chat_id)
    elif "освобожд" in lower or "освободил" in lower or "сдаю" in lower or "отменяю" in lower:
        # Пользователь хочет освободить слот — пока просто ответ
        player_id = "tg_" + str(chat_id)
        data = load_data()
        my_slots = [s for s in data.get("slots", []) if s.get("ownerId") == player_id and s["status"] == "booked"]
        if not my_slots:
            send_message(chat_id, "У вас нет забронированных слотов чтобы освободить.")
            return
        # Освобождаем первый найденный
        s = my_slots[0]
        s["status"] = "free"
        s["ownerId"] = None
        save_data(data)
        send_message(chat_id, f"✅ Слот {s['date']} {s['time']} освобождён")
    elif "оплат" in lower:
        send_message(chat_id,
            "💳 <b>Оплата</b>\n\n"
            "Оплата производится отдельно по СБП — вне приложения.\n"
            "Контакты игроков можно посмотреть в /players\n\n"
            "Администратор проверяет оплату вручную."
        )
    else:
        send_message(chat_id, "Напиши /start для списка команд")

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        self._json(200, {"status": "ok", "endpoint": "tennis bot webhook"})

    def do_OPTIONS(self):
        self._json(200, {})

    def do_POST(self):
        try:
            length = int(self.headers.get('Content-Length', 0))
            body = json.loads(self.rfile.read(length).decode())

            msg = body.get("message", {})
            chat_id = msg.get("chat", {}).get("id")
            text = msg.get("text", "")

            if chat_id:
                handle_update(chat_id, text)

            self._json(200, {"ok": True})
        except Exception as e:
            self._json(500, {"error": str(e)})

    def _json(self, code, obj):
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(obj, ensure_ascii=False).encode())
