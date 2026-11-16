"""User-Agent parsing: bots, device class, OS and browser.

Kept dependency-free on purpose — the collector runs on a free 512 MB Render
instance and only needs coarse buckets, not a full UA database.
"""

from __future__ import annotations

BOT_MARKERS = (
    "bot",
    "crawler",
    "spider",
    "slurp",
    "bingpreview",
    "facebookexternalhit",
    "telegrambot",
    "twitterbot",
    "linkedinbot",
    "discordbot",
    "whatsapp",
    "slackbot",
    "vkshare",
    "applebot",
    "yandex",
    "baiduspider",
    "duckduckbot",
    "ahrefs",
    "semrush",
    "mj12bot",
    "dotbot",
    "petalbot",
    "bytespider",
    "gptbot",
    "claudebot",
    "perplexity",
    "ccbot",
    "curl",
    "wget",
    "python-requests",
    "python-urllib",
    "httpx",
    "aiohttp",
    "go-http-client",
    "java/",
    "okhttp",
    "axios",
    "node-fetch",
    "undici",
    "headless",
    "phantomjs",
    "playwright",
    "puppeteer",
    "selenium",
    "cypress",
    "lighthouse",
    "pagespeed",
    "gtmetrix",
    "pingdom",
    "uptimerobot",
    "statuscake",
    "datadog",
    "newrelic",
    "render/1.0",
    "prerender",
)


def is_bot_ua(ua: str, headers=None, is_datacenter: bool = False) -> bool:
    """Bots, CLI clients, headless browsers and preview fetchers."""
    value = (ua or "").strip()
    if len(value) < 12:
        return True
    lowered = value.lower()
    if any(marker in lowered for marker in BOT_MARKERS):
        return True
    if headers is not None:
        purpose = " ".join(
            str(headers.get(key) or "")
            for key in ("purpose", "x-purpose", "sec-purpose", "x-moz", "x-requested-with")
        ).lower()
        if "prefetch" in purpose or "prerender" in purpose:
            return True
        if str(headers.get("x-render-origin-server") or ""):
            return True
    # Data-centre traffic without a browser UA is treated as machine traffic.
    if is_datacenter and "mozilla/" not in lowered:
        return True
    return False


def parse_device(ua: str, is_bot: bool = False) -> str:
    if is_bot:
        return "bot"
    lowered = (ua or "").lower()
    if "ipad" in lowered or "tablet" in lowered or ("android" in lowered and "mobile" not in lowered):
        return "tablet"
    if "mobile" in lowered or "iphone" in lowered or "ipod" in lowered or "android" in lowered:
        return "mobile"
    return "desktop"


def parse_os(ua: str) -> str:
    lowered = (ua or "").lower()
    if "iphone" in lowered or "ipad" in lowered or "ipod" in lowered:
        return "iOS"
    if "android" in lowered:
        return "Android"
    if "windows" in lowered:
        return "Windows"
    if "mac os" in lowered or "macintosh" in lowered:
        return "macOS"
    if "cros" in lowered:
        return "ChromeOS"
    if "linux" in lowered or "x11" in lowered:
        return "Linux"
    return ""


def parse_browser(ua: str) -> str:
    lowered = (ua or "").lower()
    if "edg/" in lowered or "edga/" in lowered or "edgios/" in lowered:
        return "Edge"
    if "opr/" in lowered or "opera" in lowered:
        return "Opera"
    if "yabrowser" in lowered:
        return "Yandex"
    if "firefox/" in lowered or "fxios/" in lowered:
        return "Firefox"
    if "chrome/" in lowered or "crios/" in lowered or "chromium" in lowered:
        return "Chrome"
    if "safari/" in lowered:
        return "Safari"
    return ""


def describe(ua: str, headers=None, is_datacenter: bool = False) -> tuple[str, bool, str, str]:
    """Return ``(device, is_bot, os, browser)`` in one pass."""
    bot = is_bot_ua(ua, headers, is_datacenter)
    return parse_device(ua, bot), bot, parse_os(ua), parse_browser(ua)
