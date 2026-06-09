# Vercel serverless API for tennis club data
import json, os
from http.server import BaseHTTPRequestHandler

DATA_FILE = "/tmp/tennis_data.json"  # Vercel has writable /tmp

def load_data():
    try:
        with open(DATA_FILE) as f:
            return json.load(f)
    except:
        return {"players": [], "courts": [], "slots": [], "weekStart": None}

def save_data(data):
    with open(DATA_FILE, "w") as f:
        json.dump(data, f, ensure_ascii=False)

class handler(BaseHTTPRequestHandler):
    def do_GET(self):
        data = load_data()
        self._json(200, data)

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length))
        action = body.get("action")
        data = load_data()

        if action == "save_all":
            if "players" in body: data["players"] = body["players"]
            if "courts" in body: data["courts"] = body["courts"]
            if "slots" in body: data["slots"] = body["slots"]
            if "weekStart" in body: data["weekStart"] = body["weekStart"]
            save_data(data)
            self._json(200, {"ok": True})
        else:
            self._json(400, {"error": "unknown action"})

    def _json(self, code, obj):
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(obj, ensure_ascii=False).encode())
