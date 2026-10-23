#!/usr/bin/env python3
"""Serve the TV launcher and bridge its actions to the TV."""
import json
import os
import sys
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import backend_rpc

ROOT = sys.argv[1] if len(sys.argv) > 1 else "launcher"
if not os.path.isabs(ROOT) and not os.path.isdir(ROOT):
    # Resolve relative to the repo root so it works from any working directory.
    ROOT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), ROOT)
PORT = int(sys.argv[2]) if len(sys.argv) > 2 else 8765
# When the launcher last asked the TV to change screen; the home watcher stays quiet for a while after it.
LAST_ACTION = [0.0]

# Voice search: the phone page (served over HTTPS on PORT+1, since browsers only give a microphone to secure pages)
# posts listening / interim / final events here; every TV design long-polls them through designs.js.
import threading
_VOICE = {"id": 0, "events": []}
_VOICE_CV = threading.Condition()


def voice_push(state, text):
    if state not in ("listening", "interim", "final", "idle"):
        return {"ok": False, "error": "bad state"}
    with _VOICE_CV:
        _VOICE["id"] += 1
        _VOICE["events"].append({"id": _VOICE["id"], "state": state, "text": (text or "")[:200], "t": time.time()})
        del _VOICE["events"][:-50]
        _VOICE_CV.notify_all()
        return {"ok": True, "id": _VOICE["id"]}


def voice_poll(since, wait):
    """Events after `since`; waits up to `wait` seconds for one. since < 0 just returns the current id."""
    deadline = time.time() + max(0.0, min(wait, 8.0))
    with _VOICE_CV:
        while True:
            if since < 0:
                return {"ok": True, "last": _VOICE["id"], "events": []}
            new = [e for e in _VOICE["events"] if e["id"] > since]
            left = deadline - time.time()
            if new or left <= 0:
                return {"ok": True, "last": _VOICE["id"], "events": new}
            _VOICE_CV.wait(left)


def lan_ip():
    import socket
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("192.0.2.1", 9))   # no packet is sent; just picks the outbound interface
        return s.getsockname()[0]
    finally:
        s.close()
HIDDEN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "apps_hidden.json")
DESIGN_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), ".design")
# Same order as launcher/designs.js; the remote's number keys pick one.
DESIGNS = {"1": "future.html", "2": "d2-console.html", "3": "d3-widgets.html", "4": "d4-acid.html", "5": "d5-carousel.html", "6": "d5b-carousel.html", "7": "d6-space.html", "8": "d7-nothing.html"}


def current_design():
    try:
        with open(DESIGN_FILE) as f:
            choice = DESIGNS.get(f.read().strip(), DESIGNS["1"])
    except OSError:
        choice = DESIGNS["1"]
    return choice if os.path.exists(os.path.join(ROOT, choice)) else DESIGNS["1"]
SHOWN = ["YouTube", "Netflix", "TV Browser"]


def hidden_apps():
    try:
        with open(HIDDEN_FILE) as f:
            return {n.strip().lower() for n in json.load(f).get("hidden", [])}
    except Exception:
        return {"hisensebar"}


def apps():
    r = backend_rpc.handle("apps", None)
    if not r.get("ok"):
        return r
    hidden = hidden_apps()
    names = {a["name"].strip().lower(): a["name"] for a in r["data"] if a["name"].strip().lower() not in hidden}
    return {"ok": True, "data": [names[n.lower()] for n in SHOWN if n.lower() in names]}


def all_apps():
    r = backend_rpc.handle("apps", None)
    if not r.get("ok"):
        return r
    hidden = hidden_apps() | {"hisensebar", "e-manual"}
    return {"ok": True, "data": [a["name"].strip() for a in r["data"] if a["name"].strip().lower() not in hidden]}


# Where the TV is, for the weather widget. Set WEATHER_CITY, WEATHER_LAT and WEATHER_LON to your own.
WEATHER_PLACE = (os.environ.get("WEATHER_CITY", "London"),
                 float(os.environ.get("WEATHER_LAT", "51.5072")), float(os.environ.get("WEATHER_LON", "-0.1276")))
_WEATHER = {"at": 0.0, "data": None}
_WMO = {0: "Clear sky", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Fog",
        51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
        66: "Freezing rain", 67: "Freezing rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 77: "Snow grains",
        80: "Showers", 81: "Showers", 82: "Heavy showers", 85: "Snow showers", 86: "Snow showers",
        95: "Thunderstorm", 96: "Thunderstorm", 99: "Thunderstorm"}


def weather():
    """Current weather + next 12 hours from Open-Meteo for WEATHER_PLACE; cached 15 min."""
    import urllib.request
    if _WEATHER["data"] and time.time() - _WEATHER["at"] < 900:
        return {"ok": True, "data": _WEATHER["data"]}

    def get(url):
        with urllib.request.urlopen(url, timeout=6) as r:
            return json.load(r)

    city, lat, lon = WEATHER_PLACE
    try:
        w = get("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&current=temperature_2m,weather_code,is_day"
                "&hourly=temperature_2m&forecast_hours=13&timezone=auto" % (lat, lon))
    except Exception as e:
        if _WEATHER["data"]:
            return {"ok": True, "data": _WEATHER["data"], "stale": True}
        return {"ok": False, "error": str(e)}
    cur = w.get("current", {})
    data = {
        "city": city,
        "temp": round(cur.get("temperature_2m", 0)),
        "code": cur.get("weather_code", 0),
        "condition": _WMO.get(cur.get("weather_code"), "Weather"),
        "is_day": bool(cur.get("is_day", 1)),
        "hourly": [{"time": t[11:16], "temp": v} for t, v in zip(w["hourly"]["time"], w["hourly"]["temperature_2m"])],
    }
    _WEATHER.update(at=time.time(), data=data)
    return {"ok": True, "data": data}


DEFAULT_VIDEO = {"video_id": "aqz-KE-bpKQ", "title": "Big Buck Bunny 60fps 4K - Official Blender Foundation Short Film",
                 "channel": "Blender", "thumbnail": "https://i.ytimg.com/vi/aqz-KE-bpKQ/hqdefault.jpg",
                 "url": "https://www.youtube.com/watch?v=aqz-KE-bpKQ"}
YT_CHANNELS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "youtube_channels.json")
_YT = {"at": 0.0, "data": None, "ids": {}}
# The TV's DIAL server (found over SSDP); YouTube answers it only with a YouTube origin, like the phone app sends.
DIAL_YOUTUBE = "http://%s:3367/apps/YouTube"


def _yt_channel_id(ref):
    """'UC…' ids pass through; '@handle' or a channel URL is resolved once from the channel page."""
    import re
    import urllib.request
    if re.fullmatch(r"UC[\w-]{22}", ref):
        return ref
    if ref in _YT["ids"]:
        return _YT["ids"][ref]
    url = ref if ref.startswith("http") else "https://www.youtube.com/" + (ref if ref.startswith("@") else "@" + ref)
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0", "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=8) as r:
        page = r.read().decode("utf-8", "ignore")
    m = re.search(r'"externalId":"(UC[\w-]{22})"', page) or re.search(r'channel_id=(UC[\w-]{22})', page)
    if not m:
        raise LookupError("no channel id for " + ref)
    _YT["ids"][ref] = m.group(1)
    return m.group(1)


def _yt_latest_from_page(cid):
    """Fallback when the RSS feed won't answer: the first video on the channel's Videos tab."""
    import re
    import urllib.request
    try:
        req = urllib.request.Request("https://www.youtube.com/channel/%s/videos" % cid,
                                     headers={"User-Agent": "Mozilla/5.0", "Accept-Language": "en"})
        with urllib.request.urlopen(req, timeout=8) as r:
            page = r.read().decode("utf-8", "ignore")
    except Exception:
        return None
    # The first video tile's title; its id is the last videoId mentioned before it.
    t = re.search(r'lockupMetadataViewModel":\{"title":\{"content":"((?:[^"\\]|\\.)*)"', page)
    name = re.search(r'<meta property="og:title" content="(.*?)"', page)
    ids = re.findall(r'"videoId":"([\w-]{11})"', page[:t.start()]) if t else []
    if not ids:
        return None
    vid = ids[-1]
    title = json.loads('"%s"' % t.group(1))
    return {"video_id": vid, "title": title, "channel": name.group(1) if name else "", "published": "",
            "thumbnail": "https://i.ytimg.com/vi/%s/hqdefault.jpg" % vid, "url": "https://www.youtube.com/watch?v=" + vid}


def youtube_last():
    """Newest upload across the channels in youtube_channels.json (public RSS, no login); cached 15 min."""
    import yt_lounge
    watched = yt_lounge.load_last()
    if watched and watched.get("video_id"):
        return {"ok": True, "data": watched}
    try:
        with open(YT_CHANNELS_FILE) as f:
            has_channels = bool(json.load(f).get("channels"))
    except (OSError, ValueError):
        has_channels = False
    if not has_channels:
        # Nothing watched yet and no channels set: the user chose Big Buck Bunny as the standing pick.
        return {"ok": True, "data": DEFAULT_VIDEO}
    import urllib.request
    import xml.etree.ElementTree as ET
    if _YT["data"] and time.time() - _YT["at"] < 900:
        return {"ok": True, "data": _YT["data"]}
    try:
        with open(YT_CHANNELS_FILE) as f:
            refs = json.load(f).get("channels", [])
    except (OSError, ValueError):
        refs = []
    if not refs:
        return {"ok": False, "error": "no channels configured"}
    ns = {"a": "http://www.w3.org/2005/Atom", "yt": "http://www.youtube.com/xml/schemas/2015",
          "media": "http://search.yahoo.com/mrss/"}
    best = None
    for ref in refs:
        try:
            cid = _yt_channel_id(ref)
        except Exception:
            continue
        feed = None
        for _ in range(4):   # YouTube's RSS answers 404 at random; a few tries usually gets through
            try:
                req = urllib.request.Request("https://www.youtube.com/feeds/videos.xml?channel_id=" + cid,
                                             headers={"User-Agent": "Mozilla/5.0"})
                with urllib.request.urlopen(req, timeout=8) as r:
                    feed = ET.fromstring(r.read())
                break
            except Exception:
                time.sleep(0.4)
        if feed is None:
            latest = _yt_latest_from_page(cid)
            if latest and (not best or not best.get("published")):
                best = best or latest
            continue
        for e in feed.findall("a:entry", ns):
            vid = e.findtext("yt:videoId", namespaces=ns)
            published = e.findtext("a:published", namespaces=ns) or ""
            if not vid or (best and published <= best["published"]):
                continue
            best = {"video_id": vid, "title": e.findtext("a:title", namespaces=ns),
                    "channel": e.findtext("a:author/a:name", namespaces=ns), "published": published,
                    "thumbnail": "https://i.ytimg.com/vi/%s/hqdefault.jpg" % vid,
                    "url": "https://www.youtube.com/watch?v=" + vid}
    if not best:
        if _YT["data"]:
            return {"ok": True, "data": _YT["data"], "stale": True}
        return {"ok": False, "error": "channels unreachable"}
    _YT.update(at=time.time(), data=best)
    return {"ok": True, "data": best}


def youtube_play(video_id):
    """Start a video in the TV's YouTube app over DIAL, the same way casting from a phone does."""
    import re
    import urllib.request
    from tv import _cached_host
    if not re.fullmatch(r"[\w-]{11}", video_id or ""):
        return {"ok": False, "error": "bad video id"}
    host = _cached_host() or os.environ.get("HISENSE_HOST", "")
    req = urllib.request.Request(DIAL_YOUTUBE % host, data=("v=" + video_id).encode(), method="POST",
                                 headers={"Origin": "https://www.youtube.com", "Content-Type": "text/plain; charset=utf-8"})
    try:
        with urllib.request.urlopen(req, timeout=8) as r:
            return {"ok": r.status in (200, 201)}
    except Exception as e:
        return {"ok": False, "error": str(e)}


def sources():
    r = backend_rpc.handle("sources", None)
    if not r.get("ok"):
        return r
    data = [{"id": s.get("sourceid"), "name": s.get("displayname") or s.get("sourcename"),
             "signal": s.get("is_signal") == "1"} for s in r["data"]]
    return {"ok": True, "data": data}


def switch_source(sid):
    r = backend_rpc.handle("sources", None)
    if not r.get("ok"):
        return r
    for s in r["data"]:
        if s.get("sourceid") == sid or (s.get("sourcename") or "").lower() == sid.lower():
            return backend_rpc.handle("source", s)
    return {"ok": False, "error": f"unknown source {sid!r}"}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        if self.path.endswith(".html") or self.path == "/" or self.path.startswith("/api/"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _json(self, obj, code=200):
        body = json.dumps(obj).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        u = urllib.parse.urlparse(self.path)
        if u.path != "/api/voice":
            return self._json({"ok": False, "error": "not found"}, 404)
        raw = self.rfile.read(min(int(self.headers.get("Content-Length") or 0), 4096)).decode("utf-8", "ignore")
        try:
            body = json.loads(raw) if raw.strip().startswith("{") else {k: v[0] for k, v in urllib.parse.parse_qs(raw).items()}
        except ValueError:
            body = {}
        return self._json(voice_push(body.get("state", ""), body.get("text", "")))

    def do_GET(self):
        u = urllib.parse.urlparse(self.path)
        q = {k: v[0] for k, v in urllib.parse.parse_qs(u.query).items()}
        if u.path == "/_log":
            self.send_response(204)
            self.end_headers()
            return
        if u.path == "/api/apps":
            return self._json(all_apps() if q.get("all") else apps())
        if u.path == "/api/volume":
            return self._json(backend_rpc.handle("volume", None))
        if u.path == "/api/set_volume":
            return self._json(backend_rpc.handle("set_volume", q.get("v", "0")))
        if u.path == "/api/key":
            # Only the few keys the launcher's buttons need.
            if q.get("k") not in ("KEY_MUTE", "KEY_MENU", "KEY_VOLUMEUP", "KEY_VOLUMEDOWN"):
                return self._json({"ok": False, "error": "key not allowed"}, 400)
            return self._json(backend_rpc.handle("key", q["k"]))
        if u.path == "/api/sources":
            return self._json(sources())
        if u.path == "/api/launch":
            LAST_ACTION[0] = time.time()
            return self._json(backend_rpc.handle("launch", q.get("name", "")))
        if u.path == "/api/source":
            LAST_ACTION[0] = time.time()
            return self._json(switch_source(q.get("id", "")))
        if u.path == "/api/open":
            if self.client_address[0] != "127.0.0.1":
                return self._json({"ok": False, "error": "local only"}, 403)
            return self._json(backend_rpc.handle("open_url", q.get("url", "")))
        if u.path == "/api/youtube/last":
            return self._json(youtube_last())
        if u.path == "/api/youtube/play":
            LAST_ACTION[0] = time.time()
            return self._json(youtube_play(q.get("id", "")))
        if u.path == "/api/voice":
            return self._json(voice_push(q.get("state", ""), q.get("text", "")))
        if u.path == "/api/voice/poll":
            try:
                since, wait = int(q.get("since", "-1")), float(q.get("wait", "0"))
            except ValueError:
                return self._json({"ok": False, "error": "bad since"}, 400)
            return self._json(voice_poll(since, wait))
        if u.path == "/api/voice/url":
            return self._json({"ok": True, "data": "https://%s:%d/voice.html" % (lan_ip(), PORT + 1)})
        if u.path == "/api/weather":
            return self._json(weather())
        if u.path == "/api/state":
            r = backend_rpc.handle("state", None)
            r["since_action"] = round(time.time() - LAST_ACTION[0], 1)
            return self._json(r)
        if u.path == "/api/design":
            if q.get("set") in DESIGNS:
                with open(DESIGN_FILE, "w") as f:
                    f.write(q["set"])
            return self._json({"ok": True, "data": current_design()})
        if u.path == "/":
            # The TV app is installed with the bare URL; serve the chosen design there.
            self.path = "/" + current_design()
        return super().do_GET()


HTTPS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "keys", "https")


def serve_https():
    """Same site on PORT+1 over TLS (self-signed), for the phone's voice page; the TV keeps using plain HTTP."""
    import ssl
    cert, key = os.path.join(HTTPS_DIR, "cert.pem"), os.path.join(HTTPS_DIR, "key.pem")
    if not (os.path.exists(cert) and os.path.exists(key)):
        print("no HTTPS cert in", HTTPS_DIR, "- voice page unavailable", flush=True)
        return
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ctx.load_cert_chain(cert, key)
    httpd = ThreadingHTTPServer(("0.0.0.0", PORT + 1), Handler)
    httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
    threading.Thread(target=httpd.serve_forever, name="https", daemon=True).start()


if __name__ == "__main__":
    # The TV fetches dozens of fonts, icons and wallpapers at once; the default backlog of 5 drops some of them.
    ThreadingHTTPServer.request_queue_size = 64
    import yt_lounge
    from tv import _cached_host
    yt_lounge.start(_cached_host)
    ThreadingHTTPServer.daemon_threads = True
    serve_https()
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
