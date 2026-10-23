import hashlib
import json
import os
import queue
import random
import ssl
import threading
import time

import paho.mqtt.client as mqtt

HERE = os.path.dirname(os.path.abspath(__file__))
# Newer firmware needs the newer client cert; older firmware works with the RemoteNow pair. See the README.
CERT = os.path.join(HERE, "keys", "vidaa_client.pem")
KEY = os.path.join(HERE, "keys", "vidaa_client.key")
if not os.path.exists(CERT):
    CERT = os.path.join(HERE, "keys", "rcm_certchain_pem.cer")
    KEY = os.path.join(HERE, "keys", "rcm_pem_privkey.pkcs8")

DEFAULT_HOST = os.environ.get("HISENSE_HOST")
DEFAULT_PORT = 36669
HOST_CACHE = os.path.join(HERE, ".host")
AUTH_FILE = os.path.join(HERE, ".auth.json")

# Dynamic ("modern") login, ported from pyvidaa (MIT, Warren Rees):
# https://github.com/warrenrees/pyvidaa
_PATTERN = "38D65DC30F45109A369A86FCE866A85B"
_VALUE_SUFFIX = "h!i@s#$v%i^d&a*a"
_TIME_XOR = 0x5698_1477_2b03_a968


def _md5(s):
    return hashlib.md5(s.encode("utf-8")).hexdigest().upper()


def dynamic_credentials(device_uuid, brand="his", ts=None):
    """client_id, username, password for a fresh (unpaired) login."""
    ts = int(time.time()) if ts is None else ts
    client_id = f"{device_uuid}${brand}${_md5(f'{_PATTERN}${device_uuid}')[:6]}_vidaacommon_001"
    username = f"{brand}${ts ^ _TIME_XOR}"
    remainder = sum(int(d) for d in str(ts)) % 10
    value_md5 = _md5(f"{brand}{remainder}{_VALUE_SUFFIX}")[:6]
    return client_id, username, _md5(f"{ts}${value_md5}")


def _load_auth():
    try:
        with open(AUTH_FILE) as f:
            return json.load(f)
    except (OSError, ValueError):
        return {}


def _save_auth(auth):
    with open(AUTH_FILE, "w") as f:
        json.dump(auth, f, indent=2)
    os.chmod(AUTH_FILE, 0o600)


def _cached_host():
    try:
        with open(HOST_CACHE) as f:
            return f.read().strip() or None
    except OSError:
        return None


def _remember_host(host):
    try:
        with open(HOST_CACHE, "w") as f:
            f.write(host)
    except OSError:
        pass


def _reachable(host, port, timeout=0.8):
    import socket

    try:
        with socket.create_connection((host, port), timeout=timeout):
            return True
    except OSError:
        return False


def resolve_host(port=DEFAULT_PORT):
    """Last paired host first, then SSDP, then the static default."""
    cached = _cached_host()
    if cached and _reachable(cached, port):
        return cached
    try:
        from discover import discover

        found = discover()
    except Exception:
        found = None
    if found and _reachable(found, port):
        return found
    if DEFAULT_HOST and _reachable(DEFAULT_HOST, port):
        return DEFAULT_HOST
    raise OSError("TV not reachable")


class HisenseTV:
    """Minimal VIDAA MQTT remote client (paho-mqtt v2)."""

    def __init__(self, host=None, port=DEFAULT_PORT, timeout=12.0):
        if host is None:
            host = resolve_host(port)
        self.host = host
        self.port = port
        self.timeout = timeout
        self._q = queue.Queue()
        self._token = threading.Event()
        self.connected = threading.Event()
        self.muted = False
        self.volume = None
        self._volume_at = 0.0
        self._state_at = 0.0
        self.state = None
        self.apps = None

        ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
        if not (os.path.exists(CERT) and os.path.exists(KEY)):
            raise SystemExit("No client certificate in server/keys/. See 'Add the client certificate' in the README.")
        ctx.load_cert_chain(certfile=CERT, keyfile=KEY)
        self._ctx = ctx

        # A stable, locally administered MAC-style id the TV pairs with once.
        self._auth = _load_auth()
        if not self._auth.get("uuid"):
            octets = [0x02] + [random.randint(0, 255) for _ in range(5)]
            self._auth = {"uuid": ":".join(f"{o:02x}" for o in octets)}
            _save_auth(self._auth)

        now = time.time()
        self._refresh_on_connect = False
        if self._auth.get("accesstoken") and now < self._auth.get("access_expires", 0):
            self.client_id = self._auth["client_id"]
            username, password = self._auth["username"], self._auth["accesstoken"]
        elif self._auth.get("refreshtoken") and now < self._auth.get("refresh_expires", 0):
            self.client_id = self._auth["client_id"]
            username, password = self._auth["username"], self._auth["refreshtoken"]
            self._refresh_on_connect = True
        else:
            self.client_id, username, password = dynamic_credentials(self._auth["uuid"])
        self._device = self.client_id

        self._c = mqtt.Client(
            mqtt.CallbackAPIVersion.VERSION2, client_id=self.client_id
        )
        self._c.username_pw_set(username, password)
        self._username = username
        self._c.tls_set_context(self._ctx)
        self._c.on_connect = self._on_connect
        self._c.on_message = self._on_message
        self._c.on_subscribe = self._on_subscribe
        self._c.on_disconnect = self._on_disconnect
        self.connect_error = None

    def _on_disconnect(self, client, userdata, flags, reason_code, properties=None):
        if not self.connected.is_set():
            self.connect_error = self.connect_error or str(reason_code)

    def _on_connect(self, client, userdata, flags, reason_code, properties=None):
        if reason_code.is_failure:
            self.connect_error = str(reason_code)
            return
        self._subscribe()
        self.connected.set()

    def _subscribe(self):
        # The TV refuses subscriptions (SUBACK 0x80) from a client it has not
        # authorized yet, so this is repeated once the PIN has been entered.
        # Newer firmware also refuses '#' wildcards, so list every reply topic.
        own = f"/remoteapp/mobile/{self._device}"
        self._c.subscribe([(t, 0) for t in (
            f"{own}/#",
            "/remoteapp/mobile/broadcast/#",
            f"{own}/platform_service/data/tokenissuance",
            f"{own}/ui_service/data/authentication",
            f"{own}/ui_service/data/authenticationcode",
            f"{own}/ui_service/data/vidaa_app_connect",
            f"{own}/ui_service/data/state",
            f"{own}/ui_service/data/sourcelist",
            f"{own}/ui_service/data/applist",
            f"{own}/platform_service/data/gettvinfo",
            "/remoteapp/mobile/broadcast/ui_service/state",
            "/remoteapp/mobile/broadcast/ui_service/volume",
            "/remoteapp/mobile/broadcast/platform_service/actions/volumechange",
            "/remoteapp/mobile/broadcast/platform_service/actions/tvsleep",
        )])

    def _on_subscribe(self, client, userdata, mid, reason_codes, properties=None):
        if os.environ.get("HISENSE_DEBUG"):
            print(f"[tv] suback {[str(r) for r in reason_codes]}", flush=True)

    def _on_message(self, client, userdata, msg):
        if os.environ.get("HISENSE_DEBUG"):
            print(f"[tv] {msg.topic} {msg.payload[:300]!r}", flush=True)
        payload = msg.payload
        if payload:
            try:
                payload = json.loads(payload.decode("utf-8", "strict"))
            except (ValueError, UnicodeDecodeError):
                payload = msg.payload
        if isinstance(payload, dict):
            if msg.topic.endswith("/volumechange"):
                if payload.get("volume_type") == 2:
                    self.muted = bool(payload.get("volume_value"))
                elif payload.get("volume_type") == 0:
                    self.volume = int(payload.get("volume_value", 0))
            elif msg.topic.endswith("/ui_service/state") and "statetype" in payload:
                self.state = payload
            elif msg.topic.endswith("/tokenissuance") and payload.get("accesstoken"):
                self._store_token(payload)
        self._q.put((msg.topic, payload))

    def connect(self):
        self._c.connect(self.host, self.port)
        self._c.loop_start()
        import time as _t
        deadline = _t.time() + self.timeout
        while not self.connected.is_set() and self.connect_error is None:
            if _t.time() > deadline:
                raise TimeoutError("MQTT connect timed out")
            _t.sleep(0.1)
        if self.connect_error:
            self.disconnect()
            raise ConnectionError(f"TV refused MQTT login: {self.connect_error}")
        _remember_host(self.host)
        if self._refresh_on_connect:
            self._token.clear()
            self._call("platform_service", "gettoken", {"refreshtoken": self._auth["refreshtoken"]}, kind="data")
            self._token.wait(self.timeout)

    def _store_token(self, payload):
        now = time.time()
        self._auth.update(
            client_id=self.client_id,
            username=self._username,
            accesstoken=payload["accesstoken"],
            refreshtoken=payload.get("refreshtoken") or self._auth.get("refreshtoken"),
            # Renew a day early so a reconnect never lands on a dead token.
            access_expires=now + (float(payload.get("accesstoken_duration_day", 7)) - 1) * 86400,
            refresh_expires=now + (float(payload.get("refreshtoken_duration_day", 30)) - 1) * 86400,
        )
        _save_auth(self._auth)
        self._token.set()

    @property
    def paired(self):
        return bool(self._auth.get("accesstoken"))

    def disconnect(self):
        try:
            self._c.disconnect()
        finally:
            self._c.loop_stop()

    def _drain(self):
        while True:
            try:
                self._q.get_nowait()
            except queue.Empty:
                return

    def _wait(self, match=None, timeout=None):
        import time as _t
        deadline = _t.time() + (self.timeout if timeout is None else timeout)
        while _t.time() < deadline:
            try:
                item = self._q.get(block=True, timeout=max(0.1, deadline - _t.time()))
            except queue.Empty:
                break
            if match is None or match(*item):
                return item
        raise TimeoutError(f"no matching response in {self.timeout:.0f}s")

    def _call(self, service, action, payload=None, kind="actions"):
        if isinstance(payload, dict):
            payload = json.dumps(payload)
        topic = f"/remoteapp/tv/{service}/{self._device}/{kind}/{action}"
        self._c.publish(topic, payload).wait_for_publish()

    def start_authorization(self):
        """Trigger the TV to display the 4-digit pairing code."""
        self._drain()
        self._call("ui_service", "vidaa_app_connect",
                   {"app_version": 2, "connect_result": 0, "device_type": "Mobile App"})

    def send_authorization_code(self, code):
        self._drain()
        self._token.clear()
        self._call("ui_service", "authenticationcode", {"authNum": int(code)})
        try:
            _, payload = self._wait(match=lambda t, p: "authentication" in t and isinstance(p, dict))
            if "result" in payload and str(payload["result"]) != "1":
                raise RuntimeError(f"authorization failed: {payload}")
        except TimeoutError:
            pass  # some firmware never confirms the PIN; the token below is the real test
        # The PIN only authorizes this session; the token is what lets us back in.
        self._subscribe()
        time.sleep(1)
        self._call("platform_service", "gettoken", {"refreshtoken": ""}, kind="data")
        self._call("ui_service", "authenticationcodeclose", "")
        if not self._token.wait(self.timeout):
            raise RuntimeError("PIN accepted but the TV issued no access token")
        return True

    def send_key(self, key):
        self._call("remote_service", "sendkey", key)

    def set_volume(self, volume):
        volume = max(0, min(100, int(volume)))
        self._call("platform_service", "changevolume", str(volume))

    def source_list(self):
        self._drain()
        self._call("ui_service", "sourcelist")
        _, payload = self._wait(match=lambda t, p: isinstance(p, list))
        return payload

    def app_list(self):
        if self.apps is None:
            self._drain()
            self._call("ui_service", "applist")
            _, payload = self._wait(match=lambda t, p: isinstance(p, list))
            self.apps = [a for a in payload if isinstance(a, dict) and a.get("name")]
        return self.apps

    def find_app(self, name, _refreshed=False):
        want = name.strip().lower()
        apps = self.app_list()
        for a in apps:
            if a["name"].lower() == want:
                return a
        for a in apps:
            if want in a["name"].lower() or a["name"].lower() in want:
                return a
        if not _refreshed:
            # The list is cached; an app installed since then needs a re-fetch.
            self.apps = None
            return self.find_app(name, _refreshed=True)
        return None

    def launch_app(self, name):
        app = self.find_app(name)
        if app is None:
            raise LookupError(f"app not installed: {name}")
        payload = {k: app[k] for k in ("appId", "name", "url", "urlType", "storeType") if k in app}
        self._call("ui_service", "launchapp", payload)
        return app

    def change_source(self, payload):
        self._call("ui_service", "changesource", payload)

    def get_volume(self):
        # The TV doesn't reliably broadcast changes made with its own remote, so ask again once the reading is stale.
        if self.volume is None or time.time() - self._volume_at > 1.0:
            self._drain()
            self._call("platform_service", "getvolume")
            try:
                self._wait(match=lambda t, p: isinstance(p, dict) and p.get("volume_type") == 0,
                           timeout=None if self.volume is None else 1.5)
                self._volume_at = time.time()
            except TimeoutError:
                if self.volume is None:
                    raise
                self._volume_at = time.time() + 4
        return {"volume_value": self.volume, "muted": self.muted}

    def get_state(self):
        # Like volume, state broadcasts can be missed; a stale "home" would make the watcher reopen the launcher over an app.
        if self.state is None or time.time() - self._state_at > 1.0:
            self._drain()
            self._call("ui_service", "gettvstate")
            try:
                # Inside some apps the TV answers slowly or not at all; keep the last broadcast state rather than block.
                self._wait(match=lambda t, p: isinstance(p, dict) and "statetype" in p,
                           timeout=None if self.state is None else 1.5)
                self._state_at = time.time()
            except TimeoutError:
                if self.state is None:
                    raise
                self._state_at = time.time() + 4   # no answer: back off, broadcasts still keep it current
        return self.state
