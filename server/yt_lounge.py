"""Remember what the TV's YouTube app is playing, for the launcher's "Continue watching" card.

YouTube's TV app exposes a "lounge" (the channel the phone app uses as a remote). While YouTube is running, its DIAL
status carries a screenId; we trade that for a lounge token, join as a remote, and listen for nowPlaying /
onStateChange events. The latest video, position and duration are saved to .youtube_last.json.
"""
import json
import os
import re
import threading
import time
import urllib.parse
import urllib.request
import uuid

HERE = os.path.dirname(os.path.abspath(__file__))
LAST_FILE = os.path.join(HERE, ".youtube_last.json")
DIAL = "http://%s:3367/apps/YouTube"
BIND = "https://www.youtube.com/api/lounge/bc/bind"
ORIGIN = {"Origin": "https://www.youtube.com"}


def log(msg):
    print(time.strftime("%H:%M:%S"), "[yt]", msg, flush=True)


def load_last():
    try:
        with open(LAST_FILE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def _save(entry):
    with open(LAST_FILE, "w") as f:
        json.dump(entry, f, indent=2)


def _title(video_id):
    try:
        url = "https://www.youtube.com/oembed?format=json&url=" + urllib.parse.quote("https://www.youtube.com/watch?v=" + video_id)
        with urllib.request.urlopen(url, timeout=6) as r:
            o = json.load(r)
        return o.get("title", ""), o.get("author_name", "")
    except Exception:
        return "", ""


def _screen_id(host):
    req = urllib.request.Request(DIAL % host, headers=ORIGIN)
    with urllib.request.urlopen(req, timeout=5) as r:
        xml = r.read().decode("utf-8", "ignore")
    if "<state>running</state>" not in xml:
        return None
    m = re.search(r"<screenId>([^<]+)</screenId>", xml)
    return m.group(1) if m else None


def _lounge_token(screen_id):
    data = urllib.parse.urlencode({"screen_ids": screen_id}).encode()
    req = urllib.request.Request("https://www.youtube.com/api/lounge/pairing/get_lounge_token_batch", data=data)
    with urllib.request.urlopen(req, timeout=8) as r:
        return json.load(r)["screens"][0]["loungeToken"]


def _frames(stream):
    """The bind endpoint streams '<length>\\n<json chunk>' frames; yield each decoded chunk."""
    buf = b""
    while True:
        part = stream.read1(4096) if hasattr(stream, "read1") else stream.read(4096)
        if not part:
            return
        buf += part
        while True:
            nl = buf.find(b"\n")
            if nl < 0:
                break
            try:
                size = int(buf[:nl].strip() or b"0")
            except ValueError:
                buf = buf[nl + 1:]
                continue
            if len(buf) - nl - 1 < size:
                break
            chunk, buf = buf[nl + 1:nl + 1 + size], buf[nl + 1 + size:]
            try:
                yield json.loads(chunk.decode("utf-8", "ignore"))
            except ValueError:
                pass


class Lounge:
    def __init__(self, host_fn):
        self.host_fn = host_fn
        self.device_id = str(uuid.uuid4())
        self.current = load_last() or {}

    def _params(self, token, **extra):
        p = {"device": "REMOTE_CONTROL", "app": "youtube-desktop", "name": "TV Launcher", "id": self.device_id,
             "loungeIdToken": token, "VER": "8", "CVER": "1", "mdx-version": "3",
             "zx": uuid.uuid4().hex[:12], "t": "1"}
        p.update(extra)
        return p

    def _handle(self, events):
        for ev in events:
            if not isinstance(ev, list) or len(ev) < 2 or not isinstance(ev[1], list) or not ev[1]:
                continue
            name, args = ev[1][0], ev[1][1:]
            data = args[0] if args and isinstance(args[0], dict) else {}
            if name == "nowPlaying" and data.get("videoId"):
                vid = data["videoId"]
                if vid != self.current.get("video_id"):
                    title, channel = _title(vid)
                    self.current = {"video_id": vid, "title": title, "channel": channel,
                                    "thumbnail": "https://i.ytimg.com/vi/%s/hqdefault.jpg" % vid,
                                    "url": "https://www.youtube.com/watch?v=" + vid}
                    log("now playing %s %s" % (vid, title))
                self._position(data)
            elif name == "onStateChange":
                self._position(data)

    def _position(self, data):
        if not self.current.get("video_id"):
            return
        try:
            t, d = float(data.get("currentTime") or 0), float(data.get("duration") or 0)
        except (TypeError, ValueError):
            return
        if d > 0:
            self.current.update(position=round(t), duration=round(d), progress=round(t / d, 3))
        self.current["watched_at"] = time.time()
        _save(self.current)

    def _session(self, token):
        # Join: the reply carries our session ids (c = SID, S = gsessionid) and usually the current nowPlaying.
        req = urllib.request.Request(BIND + "?" + urllib.parse.urlencode(self._params(token, RID="1")),
                                     data=b"count=0", headers={"Content-Type": "application/x-www-form-urlencoded"})
        with urllib.request.urlopen(req, timeout=10) as r:
            body = r.read().decode("utf-8", "ignore")
        sid = re.search(r'\["c","([^"]+)"', body)
        gsid = re.search(r'\["S","([^"]+)"', body)
        if not sid or not gsid:
            raise RuntimeError("lounge bind gave no session")
        for m in re.finditer(r"^\d+\n(\[.*?\])\s*$", body, re.S | re.M):
            try:
                self._handle(json.loads(m.group(1)))
            except ValueError:
                pass
        aid = 0
        # Listen: long-polling stream of events until YouTube closes or the session expires.
        while True:
            q = self._params(token, RID="rpc", SID=sid.group(1), gsessionid=gsid.group(1), CI="0", AID=str(aid), TYPE="xmlhttp")
            with urllib.request.urlopen(BIND + "?" + urllib.parse.urlencode(q), timeout=90) as r:
                for chunk in _frames(r):
                    for ev in chunk:
                        if isinstance(ev, list) and ev and isinstance(ev[0], int):
                            aid = max(aid, ev[0])
                    self._handle(chunk)

    def run(self):
        while True:
            try:
                host = self.host_fn() or os.environ.get("HISENSE_HOST", "")
                sid = _screen_id(host)
                if not sid:
                    time.sleep(8)
                    continue
                log("YouTube is open; joining its lounge")
                self._session(_lounge_token(sid))
            except Exception as e:
                log("lounge: %s" % e)
                time.sleep(8)


def start(host_fn):
    t = threading.Thread(target=Lounge(host_fn).run, name="yt-lounge", daemon=True)
    t.start()
    return t
