# Vercel serverless API — data in global variable (persists between calls)
import json

_data = None

def get_data():
    global _data
    if _data is None:
        _data = {"players": [], "courts": [], "slots": [], "weekStart": None}
    return _data

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self._json(200, {})

    def do_GET(self):
        self._json(200, get_data())

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length).decode())
        action = body.get("action")
        data = get_data()

        if action == "save_all":
            if "players" in body: data["players"] = body["players"]
            if "courts" in body: data["courts"] = body["courts"]
            if "slots" in body: data["slots"] = body["slots"]
            if "weekStart" in body: data["weekStart"] = body["weekStart"]
            self._json(200, {"ok": True})
        elif action == "ping":
            self._json(200, {"ok": True, "players": len(data.get("players",[]))})
        else:
            self._json(400, {"error": "unknown action"})

    def _json(self, code, obj):
        self.send_response(code)
        self.send_header('Content-type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
        self.wfile.write(json.dumps(obj, ensure_ascii=False).encode())
