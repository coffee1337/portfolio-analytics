"""Client IP extraction, privacy masking and geo/network enrichment.

Design rules
------------
* The raw client IP is never written to the database. Only a masked subnet
  (``95.161.224.xxx``) and a salted HMAC (``ip_hash``) are persisted.
* ``extract_client_ip`` reads CDN headers first (Cloudflare terminates TLS in
  front of Render), then walks ``X-Forwarded-For`` **left to right** — the
  left-most entry is the real client, the right-most is the platform hop that
  used to be mistaken for the visitor (hence "Frankfurt" instead of Moscow).
* No blocking network calls in the request path: ``lookup_geo`` is async and is
  only awaited from a FastAPI ``BackgroundTasks`` worker. Cached answers are
  used synchronously, so a warm cache is free.
"""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import os
import threading
import time
import urllib.parse
from dataclasses import dataclass, replace
from typing import Iterable, Mapping

import httpx

VISITOR_SALT = os.environ.get("VISITOR_SALT", "change-me-in-prod")
GEO_LOOKUP = os.environ.get("GEO_LOOKUP", "1") == "1"
CACHE_TTL = 24 * 60 * 60  # seconds
CACHE_MAX = 5000

# Headers that carry the real client address, in priority order.
IP_HEADERS = ("cf-connecting-ip", "true-client-ip", "x-real-ip", "fastly-client-ip")
COUNTRY_HEADERS = ("cf-ipcountry", "x-vercel-ip-country", "x-geo-country")
CITY_HEADERS = ("cf-ipcity", "x-vercel-ip-city")
REGION_HEADERS = ("cf-region", "x-vercel-ip-country-region")

PRIMARY_URL = "http://ip-api.com/json/{ip}"
PRIMARY_FIELDS = "status,countryCode,regionName,city,isp,org,as,hosting,proxy"
FALLBACK_URL = "https://ipwho.is/{ip}"

DATACENTER_MARKERS = (
    "digitalocean",
    "amazon",
    "aws",
    "google cloud",
    "google llc",
    "microsoft corporation",
    "azure",
    "hetzner",
    "ovh",
    "linode",
    "choopa",
    "vultr",
    "m247",
    "datacamp",
    "contabo",
    "scaleway",
    "cloudflare warp",
    "cloudflare, inc",
    "leaseweb",
    "oracle cloud",
    "alibaba",
    "tencent",
    "upcloud",
    "hostinger",
    "timeweb",
    "aeza",
    "selectel",
)


@dataclass(slots=True)
class GeoInfo:
    """Everything we know about an address. Empty strings mean "unknown"."""

    country: str = ""
    region: str = ""
    city: str = ""
    asn: str = ""
    isp: str = ""
    is_datacenter: bool = False
    source: str = ""  # header | cache | ip-api | ipwho | ""

    def merge_headers(self, other: "GeoInfo") -> "GeoInfo":
        """Keep one source consistent: city/region only from the geo lookup."""
        return GeoInfo(
            country=self.country or other.country,
            region=self.region or other.region,
            city=self.city or other.city,
            asn=self.asn or other.asn,
            isp=self.isp or other.isp,
            is_datacenter=self.is_datacenter or other.is_datacenter,
            source=self.source or other.source,
        )


def _clean_ip(raw: str | None) -> str | None:
    """Strip whitespace, brackets, port and IPv6 zone from a candidate."""
    if not raw:
        return None
    value = raw.strip().strip("\"'").strip()
    if not value:
        return None
    if value.startswith("[") and "]" in value:  # [2a00::1]:443
        value = value[1 : value.index("]")]
    elif value.count(":") == 1 and "." in value:  # 1.2.3.4:12345
        value = value.split(":", 1)[0]
    if "%" in value:  # fe80::1%eth0
        value = value.split("%", 1)[0]
    try:
        ipaddress.ip_address(value)
    except ValueError:
        return None
    return value


def is_public_ip(candidate: str | None) -> bool:
    """True only for a globally routable unicast address."""
    try:
        addr = ipaddress.ip_address((candidate or "").strip())
    except ValueError:
        return False
    return bool(
        addr.is_global
        and not (
            addr.is_private
            or addr.is_loopback
            or addr.is_link_local
            or addr.is_multicast
            or addr.is_reserved
            or addr.is_unspecified
        )
    )


def extract_client_ip(request) -> str:
    """Real client address or ``""`` when only private hops are visible."""
    headers = request.headers
    for header in IP_HEADERS:
        candidate = _clean_ip(headers.get(header))
        if candidate and is_public_ip(candidate):
            return candidate
    forwarded = headers.get("x-forwarded-for", "")
    if forwarded:
        # Left to right: client, proxy, proxy … The platform hop is on the right.
        for part in forwarded.split(","):
            candidate = _clean_ip(part)
            if candidate and is_public_ip(candidate):
                return candidate
    direct = _clean_ip(request.client.host if request.client else None)
    if direct and is_public_ip(direct):
        return direct
    return ""


def mask_ip(ip: str | None) -> str:
    """Masked subnet for display: IPv4 keeps 3 octets, IPv6 keeps 3 hextets."""
    addr = _clean_ip(ip)
    if not addr:
        return ""
    try:
        parsed = ipaddress.ip_address(addr)
    except ValueError:
        return ""
    if parsed.version == 4:
        parts = str(parsed).split(".")
        return f"{parts[0]}.{parts[1]}.{parts[2]}.xxx"
    hextets = parsed.exploded.split(":")
    return f"{hextets[0]}:{hextets[1]}:{hextets[2]}:xxxx::"


def hash_ip(ip: str | None) -> str:
    """Stable salted HMAC of the address (24 hex chars, never reversible)."""
    addr = _clean_ip(ip)
    if not addr:
        return ""
    digest = hmac.new(VISITOR_SALT.encode(), addr.encode(), hashlib.sha256).hexdigest()
    return digest[:24]


def header_geo(headers: Mapping[str, str]) -> GeoInfo:
    """Country/city/region from CDN headers, if the edge provides them."""
    country = ""
    for header in COUNTRY_HEADERS:
        value = (headers.get(header) or "").strip().upper()
        if value and value not in ("XX", "T1"):
            country = value[:8]
            break
    city = ""
    for header in CITY_HEADERS:
        value = (headers.get(header) or "").strip()
        if value:
            city = urllib.parse.unquote(value)[:64]
            break
    region = ""
    for header in REGION_HEADERS:
        value = (headers.get(header) or "").strip()
        if value:
            region = urllib.parse.unquote(value)[:64]
            break
    return GeoInfo(country=country, region=region, city=city, source="header" if country else "")


def looks_like_datacenter(isp: str, org: str, hosting: bool = False, proxy: bool = False) -> bool:
    if hosting or proxy:
        return True
    haystack = f"{isp} {org}".lower()
    return any(marker in haystack for marker in DATACENTER_MARKERS)


class _GeoCache:
    """Tiny thread-safe TTL + LRU cache (no extra dependency)."""

    def __init__(self, ttl: int = CACHE_TTL, limit: int = CACHE_MAX) -> None:
        self._ttl = ttl
        self._limit = limit
        self._data: dict[str, tuple[float, GeoInfo]] = {}
        self._lock = threading.Lock()

    def get(self, key: str) -> GeoInfo | None:
        now = time.time()
        with self._lock:
            item = self._data.get(key)
            if not item:
                return None
            stored_at, info = item
            if now - stored_at > self._ttl:
                self._data.pop(key, None)
                return None
            # touch for LRU ordering
            self._data.pop(key)
            self._data[key] = item
            return info

    def put(self, key: str, info: GeoInfo) -> None:
        with self._lock:
            self._data.pop(key, None)
            self._data[key] = (time.time(), info)
            while len(self._data) > self._limit:
                oldest = next(iter(self._data))
                self._data.pop(oldest, None)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()

    def __len__(self) -> int:  # pragma: no cover - diagnostics only
        return len(self._data)


_cache = _GeoCache()


def cached_geo(ip: str) -> GeoInfo | None:
    return _cache.get(ip) if ip else None


def cache_geo(ip: str, info: GeoInfo) -> None:
    if ip:
        _cache.put(ip, info)


def clear_cache() -> None:
    _cache.clear()


def _asn_string(raw: str) -> str:
    value = (raw or "").strip().upper()
    if not value:
        return ""
    if value.startswith("AS"):
        return value.split(" ")[0][:32]
    if value.isdigit():
        return f"AS{value}"[:32]
    first = value.split(" ")[0]
    return first[:32] if first.startswith("AS") else ""


def _from_ip_api(data: dict) -> GeoInfo | None:
    if data.get("status") != "success":
        return None
    country = str(data.get("countryCode") or "")[:8].upper()
    if not country:
        return None
    isp = str(data.get("isp") or data.get("org") or "")[:128]
    org = str(data.get("org") or "")
    return GeoInfo(
        country=country,
        region=str(data.get("regionName") or "")[:64],
        city=str(data.get("city") or "")[:64],
        asn=_asn_string(str(data.get("as") or "")),
        isp=isp,
        is_datacenter=looks_like_datacenter(isp, org, bool(data.get("hosting")), bool(data.get("proxy"))),
        source="ip-api",
    )


def _from_ipwho(data: dict) -> GeoInfo | None:
    if not data.get("success", False):
        return None
    country = str(data.get("country_code") or "")[:8].upper()
    if not country:
        return None
    connection = data.get("connection") or {}
    isp = str(connection.get("isp") or connection.get("org") or "")[:128]
    org = str(connection.get("org") or "")
    return GeoInfo(
        country=country,
        region=str(data.get("region") or "")[:64],
        city=str(data.get("city") or "")[:64],
        asn=_asn_string(str(connection.get("asn") or "")),
        isp=isp,
        is_datacenter=looks_like_datacenter(isp, org, bool(connection.get("hosting")), False),
        source="ipwho",
    )


async def lookup_geo(ip: str, client: httpx.AsyncClient | None = None) -> GeoInfo | None:
    """Ask the geo providers (ip-api first, ipwho.is as a fallback)."""
    if not GEO_LOOKUP or not is_public_ip(ip):
        return None
    own_client = client is None
    client = client or httpx.AsyncClient(timeout=2.5, follow_redirects=True)
    try:
        try:
            response = await client.get(
                PRIMARY_URL.format(ip=ip), params={"fields": PRIMARY_FIELDS}
            )
            if response.status_code == 200:
                info = _from_ip_api(response.json())
                if info:
                    return info
        except (httpx.HTTPError, ValueError):
            pass
        try:
            response = await client.get(FALLBACK_URL.format(ip=ip))
            if response.status_code == 200:
                info = _from_ipwho(response.json())
                if info:
                    return info
        except (httpx.HTTPError, ValueError):
            pass
        return None
    finally:
        if own_client:
            await client.aclose()


async def enrich_geo_async(ip: str, headers: Mapping[str, str] | None = None) -> GeoInfo:
    """Cached enrichment; safe to await from a background task."""
    known = cached_geo(ip)
    if known:
        return known
    info = await lookup_geo(ip)
    if info is None:
        # Cache the negative result too, but keep CDN header data as a bonus.
        info = replace(header_geo(headers or {}), source="none")
    cache_geo(ip, info)
    return info


def resolve_geo_now(ip: str, headers: Mapping[str, str]) -> tuple[GeoInfo, bool]:
    """Synchronous view for the ingest path.

    Returns ``(info, needs_lookup)``: cached value when available, CDN headers
    otherwise, and a flag telling the caller to schedule the async backfill.
    """
    from_headers = header_geo(headers)
    if not ip:
        return from_headers, False
    known = cached_geo(ip)
    if known:
        # A lookup answers country AND city together — never mix sources.
        if known.country:
            return known, False
        return from_headers.merge_headers(known), False
    return from_headers, bool(GEO_LOOKUP)


def datacenter_flag(isp: str, asn: str = "", is_datacenter: bool = False) -> bool:
    return is_datacenter or looks_like_datacenter(isp, asn)


def merge_geo_rows(rows: Iterable[tuple[str, str, str, str, str, bool]]) -> dict[str, str]:
    """Utility kept for tests: pick the most populated geo row."""
    best = ("", "", "", "", "", False)
    for row in rows:
        if sum(1 for value in row[:5] if value) > sum(1 for value in best[:5] if value):
            best = row
    return {
        "country": best[0],
        "region": best[1],
        "city": best[2],
        "asn": best[3],
        "isp": best[4],
    }
