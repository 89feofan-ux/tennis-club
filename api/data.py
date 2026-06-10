# Vercel serverless API — data in Upstash Redis (persistent)
import json
import os
from http.server import BaseHTTPRequestHandler
from urllib.request import Request, urlopen

KV_URL = os.environ.get("KV_REST_API_URL", "https://holy-beagle-145944.upstash.io")
KV_TOKEN = os.environ.get("KV_REST_API_TOKEN", "gQAAAAAAAjoYAAIgcDFmMGZkOTllYTdiNzE0MzExYTk3MjJkZjU5NDA2Y2EwOA")

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

class handler(BaseHTTPRequestHandler):
    def do_OPTIONS(self):
        self._json(200, {})

    def do_GET(self):
        self._json(200, load_data())

    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length).decode())
        action = body.get("action")
        data = load_data()

        if action == "save_all":
            if "players" in body: data["players"] = body["players"]
            if "courts" in body: data["courts"] = body["courts"]
            if "slots" in body: data["slots"] = body["slots"]
            if "weekStart" in body: data["weekStart"] = body["weekStart"]
            save_data(data)
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
