# Vercel serverless API — data in global variable (persists between calls)
import json

_data = None

def get_data():
    global _data
    if _data is None:
        _data = {"players": [], "courts": [], "slots": [], "weekStart": None}
    return _data

def handler(req_body=None):
    """Vercel Python Serverless: called as /api/data"""
    from http.server import BaseHTTPRequestHandler

    # GET handler
    return json.dumps(get_data(), ensure_ascii=False) + "\n"

def lambda_handler(event, context):
    """AWS Lambda-like handler for Vercel"""
    method = event.get("httpMethod", "GET")
    headers = event.get("headers", {})

    if method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                "Access-Control-Allow-Headers": "Content-Type",
            },
            "body": "{}",
        }

    if method == "GET":
        body = json.dumps(get_data(), ensure_ascii=False)
        return {
            "statusCode": 200,
            "headers": {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
            },
            "body": body,
        }

    if method == "POST":
        try:
            body = json.loads(event.get("body", "{}"))
        except json.JSONDecodeError:
            return {"statusCode": 400, "body": json.dumps({"error": "invalid JSON"})}

        action = body.get("action")
        data = get_data()

        if action == "save_all":
            if "players" in body: data["players"] = body["players"]
            if "courts" in body: data["courts"] = body["courts"]
            if "slots" in body: data["slots"] = body["slots"]
            if "weekStart" in body: data["weekStart"] = body["weekStart"]
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps({"ok": True}),
            }
        elif action == "ping":
            return {
                "statusCode": 200,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps({"ok": True, "players": len(data.get("players", []))}),
            }
        else:
            return {
                "statusCode": 400,
                "headers": {
                    "Content-Type": "application/json",
                    "Access-Control-Allow-Origin": "*",
                },
                "body": json.dumps({"error": "unknown action"}),
            }

    return {"statusCode": 405, "body": json.dumps({"error": "method not allowed"})}
