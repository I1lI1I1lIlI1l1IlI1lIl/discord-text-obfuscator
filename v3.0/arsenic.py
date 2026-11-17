import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from av3 import installer


def main():
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    cmd = sys.argv[1].lower() if len(sys.argv) > 1 else "install"
    flavors = [f for f, _ in installer.find_discord_apps()]
    if not flavors:
        print("[!] Discord not found in %LOCALAPPDATA%")
        return 1
    try:
        if cmd == "install":
            running = [f for f in flavors if installer.discord_running(f)]
            for f in running:
                installer.kill_discord(f)
            for f in flavors:
                res = installer.install(f)
                if not res["verified"]:
                    print("[!] Install failed (verification)")
                    return 1
                if res.get("openasar"):
                    print(f"[+] OpenAsar installed ({f})")
                print(f"[+] ArsenicV3-Dsc installed ({f})")
            for f in running:
                installer.launch_discord(f)
            return 0
        if cmd == "uninstall":
            running = [f for f in flavors if installer.discord_running(f)]
            for f in running:
                installer.kill_discord(f)
            changed = False
            for f in flavors:
                if installer.uninstall(f):
                    changed = True
                    print(f"[+] ArsenicV3-Dsc uninstalled ({f})")
            if not changed:
                print("[i] ArsenicV3-Dsc is not installed")
            for f in running:
                installer.launch_discord(f)
            return 0
        print(f"[!] Unknown command: {cmd}")
        return 2
    except Exception as e:
        print(f"[!] {e}")
        return 1


if __name__ == "__main__":
    sys.exit(main())
