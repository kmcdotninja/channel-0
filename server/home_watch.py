#!/usr/bin/env python3
"""Open the HisenseBar launcher whenever the TV lands on the VIDAA home screen.

Goes through tvsite_server's API rather than its own MQTT session: a paired
client id may only hold one connection, so a second one kicks the server off.
"""
import json
import os
import socket
import time
import urllib.parse
import urllib.request

APP = "HisenseBar"
API = os.environ.get("HISENSE_API", "http://127.0.0.1:8765")
POLL = 1.0
COOLDOWN = 4.0
QUIET_AFTER_ACTION = 8.0   # opening an app passes through the VIDAA home screen; don't pounce on it
HOME_CONFIRMS = 2          # home must be seen on this many polls in a row
OFF_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".home_watch_off")


def log(msg):
    print(time.strftime("%H:%M:%S"), msg, flush=True)


def api(path):
    with urllib.request.urlopen(API + path, timeout=15) as r:
        return json.load(r)


def launcher_url():
    """This Mac's LAN address, as the TV sees it."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("192.0.2.1", 9))  # no packet is sent; just picks the outbound interface
        return f"http://{s.getsockname()[0]}:{urllib.parse.urlparse(API).port or 8765}/"
    finally:
        s.close()


def is_home(payload):
    return isinstance(payload, dict) and payload.get("statetype") == "remote_launcher"


def main():
    last_launch = 0.0
    last_status = None
    home_seen = 0
    while True:
        try:
            r = api("/api/state")
            status = "connected" if r.get("ok") else f"waiting for TV ({r.get('error')})"
            if status != last_status:
                log(status)
                last_status = status
            home_seen = home_seen + 1 if r.get("ok") and is_home(r.get("data")) else 0
            if (home_seen >= HOME_CONFIRMS and not os.path.exists(OFF_FILE)
                    and r.get("since_action", 99) > QUIET_AFTER_ACTION
                    and time.time() - last_launch > COOLDOWN):
                home_seen = 0
                last_launch = time.time()
                res = api("/api/launch?name=" + urllib.parse.quote(APP))
                if not res.get("ok"):
                    # Not installed via hisense://debug: open it by URL instead.
                    res = api("/api/open?url=" + urllib.parse.quote(launcher_url(), safe=""))
                log("home screen, opened " + APP if res.get("ok") else f"launch failed: {res.get('error')}")
        except OSError as e:
            if last_status != "server":
                log(f"launcher server not reachable at {API} ({e}); is tvsite_server.py running?")
                last_status = "server"
        time.sleep(POLL)


if __name__ == "__main__":
    main()
