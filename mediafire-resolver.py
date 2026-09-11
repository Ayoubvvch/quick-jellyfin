#!/usr/bin/env python3
import sys
import re
import html
import urllib.request

def resolve_mediafire(url):
    try:
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
                "Referer": "https://www.mediafire.com/"
            }
        )
        page = urllib.request.urlopen(req, timeout=30).read().decode("utf-8", "ignore")
        page = html.unescape(page)
        
        patterns = [
            r'href="(https://download[^"]+)"',
            r'(https://download\d*\.mediafire\.com[^"\']+)',
            r'(https://download\.mediafire\.com[^"\']+)'
        ]
        
        for pat in patterns:
            m = re.search(pat, page)
            if m:
                return m.group(1)
    except Exception as e:
        sys.stderr.write(f"Error resolving MediaFire: {e}\n")
    return None

if __name__ == "__main__":
    if len(sys.argv) > 1:
        target_url = sys.argv[1]
        direct = resolve_mediafire(target_url)
        if direct:
            print(direct)
            sys.exit(0)
    sys.exit(1)