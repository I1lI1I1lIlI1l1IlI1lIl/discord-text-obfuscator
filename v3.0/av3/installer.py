import json
import os
import shutil
import subprocess
import time
from datetime import datetime

from . import asar

APP_NAME = "ArsenicV3-Dsc"
MARKER = "/* AV3 */"
DISCORD_FLAVORS = ("Discord", "DiscordCanary", "DiscordPTB")
OPENASAR_URL = "https://github.com/GooseMod/OpenAsar/releases/download/nightly/app.asar"


class InstallError(Exception):
    pass

CREATE_NO_WINDOW = 0x08000000


def _log_event(msg):
    try:
        d = av3_dir()
        os.makedirs(d, exist_ok=True)
        with open(os.path.join(d, "log.txt"), "a", encoding="utf-8") as f:
            f.write(f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {msg}\n")
    except Exception:
        pass


def av3_dir():
    base = os.environ.get("APPDATA") or os.path.expanduser("~")
    return os.path.join(base, APP_NAME)


def payload_dir():
    return os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dist")


def find_discord_apps():
    local = os.environ.get("LOCALAPPDATA") or ""
    out = []
    for flavor in DISCORD_FLAVORS:
        base = os.path.join(local, flavor)
        if not os.path.isdir(base):
            continue
        apps = []
        for name in os.listdir(base):
            if name.startswith("app-") and os.path.isdir(os.path.join(base, name)):
                apps.append(name)
        if not apps:
            continue
        apps.sort()
        out.append((flavor, os.path.join(base, apps[-1])))
    return out


def _exe_name(flavor):
    return {"Discord": "Discord.exe", "DiscordCanary": "DiscordCanary.exe", "DiscordPTB": "DiscordPTB.exe"}[flavor]


def discord_running(flavor="Discord"):
    try:
        out = subprocess.run(["tasklist", "/FI", f"IMAGENAME eq {_exe_name(flavor)}"],
                             capture_output=True, timeout=15,
                             creationflags=CREATE_NO_WINDOW).stdout.lower()
        return _exe_name(flavor).lower().encode() in out
    except Exception:
        return False


def kill_discord(flavor="Discord"):
    exe = _exe_name(flavor)
    subprocess.run(["taskkill", "/IM", exe], capture_output=True, creationflags=CREATE_NO_WINDOW)
    for _ in range(10):
        if not discord_running(flavor):
            return True
        time.sleep(0.5)
    subprocess.run(["taskkill", "/F", "/IM", exe], capture_output=True, creationflags=CREATE_NO_WINDOW)
    time.sleep(1)
    return not discord_running(flavor)


def launch_discord(flavor="Discord"):
    local = os.environ.get("LOCALAPPDATA") or ""
    update_exe = os.path.join(local, flavor, "Update.exe")
    if os.path.isfile(update_exe):
        subprocess.Popen([update_exe, "--processStart", _exe_name(flavor)],
                         creationflags=subprocess.CREATE_NEW_PROCESS_GROUP | CREATE_NO_WINDOW)
    else:
        subprocess.Popen([os.path.join(find_app_dir(flavor), _exe_name(flavor))],
                         creationflags=subprocess.DETACHED_PROCESS | subprocess.CREATE_NEW_PROCESS_GROUP)


def _replace_atomic(tmp, dest, flavor=None, attempts=6):
    last = None
    for k in range(attempts):
        try:
            os.replace(tmp, dest)
            return
        except PermissionError as e:
            last = e
            if flavor and discord_running(flavor):
                kill_discord(flavor)
            time.sleep(0.5 + 0.5 * k)
    raise InstallError(f"access denied replacing {dest} (file locked by Discord or antivirus): {last}")


def find_app_dir(flavor="Discord"):
    for fl, d in find_discord_apps():
        if fl == flavor:
            return d
    raise InstallError(f"{flavor} not found in %LOCALAPPDATA%")



def _bootstrap_require_line(bootstrap_path):
    return f'require("{bootstrap_path.replace(chr(92), "/")}"); {MARKER}'


def _strip_av3_lines(text):
    kept = [ln for ln in text.splitlines() if MARKER not in ln]
    return "\n".join(kept) + ("\n" if kept else "")


def find_core_asar(app_dir):
    p = os.path.join(app_dir, "resources", "app.asar")
    if os.path.isfile(p) and os.path.getsize(p) > 100:
        return p
    mods = os.path.join(app_dir, "modules")
    if os.path.isdir(mods):
        for name in sorted(os.listdir(mods)):
            if name.startswith("discord_desktop_core"):
                cand = os.path.join(mods, name, "core.asar")
                if os.path.isfile(cand) and os.path.getsize(cand) > 100:
                    return cand
    return None


def _main_entry_file(files):
    raw = files.get("package.json")
    if raw:
        try:
            main = json.loads(raw.decode("utf-8")).get("main") or "index.js"
            return main.replace("\\", "/")
        except Exception:
            pass
    if "index.js" in files:
        return "index.js"
    for p in files:
        if "/" not in p and p.endswith(".js"):
            return p
    raise InstallError("no entry point found in asar (package.json main)")


def install_openasar(flavor="Discord"):
    import urllib.request
    app_dir = find_app_dir(flavor)
    res = os.path.join(app_dir, "resources")
    os.makedirs(res, exist_ok=True)
    dest = os.path.join(res, "app.asar")
    tmp = dest + ".av3dl"
    urllib.request.urlretrieve(OPENASAR_URL, tmp)
    if not os.path.getsize(tmp):
        raise InstallError("OpenAsar download failed (empty file)")
    _replace_atomic(tmp, dest, flavor)
    _log_event("OpenAsar installed")
    return install(flavor)


def install(flavor="Discord"):
    app_dir = find_app_dir(flavor)
    asar_path = find_core_asar(app_dir)
    if not asar_path:
        return install_openasar(flavor)
    header, raw, data_start = asar.read_archive(asar_path)
    files = asar.extract_files(raw, header, data_start)

    main_file = _main_entry_file(files)
    if main_file not in files:
        raise InstallError(f"entry point {main_file} not found in {asar_path}")

    idx_text = files[main_file].decode("utf-8", "replace")
    was_patched = MARKER in idx_text

    bdir = os.path.join(av3_dir(), "backup")
    os.makedirs(bdir, exist_ok=True)
    if not was_patched:
        bpath = os.path.join(bdir, f"{flavor}.{os.path.basename(asar_path)}.bak-{datetime.now():%Y%m%d-%H%M%S}")
        shutil.copy2(asar_path, bpath)

    target = av3_dir()
    os.makedirs(target, exist_ok=True)
    dist = payload_dir()
    src_boot = os.path.join(dist, "bootstrap.js")
    src_rend = os.path.join(dist, "renderer.js")
    for src in (src_boot, src_rend):
        if not os.path.isfile(src):
            raise InstallError(f"built payload missing: {src}")
    shutil.copy2(src_boot, os.path.join(target, "bootstrap.js"))
    shutil.copy2(src_rend, os.path.join(target, "renderer.js"))

    idx_text = _strip_av3_lines(idx_text)
    new_idx = _bootstrap_require_line(os.path.join(target, "bootstrap.js")) + "\n" + idx_text
    files[main_file] = new_idx.encode("utf-8")

    new_asar = asar.build_archive(header, files)
    tmp = asar_path + ".av3tmp"
    with open(tmp, "wb") as f:
        f.write(new_asar)
    _replace_atomic(tmp, asar_path, flavor)

    vheader, vraw, vstart = asar.read_archive(asar_path)
    vfiles = asar.extract_files(vraw, vheader, vstart)
    ok = MARKER in vfiles[main_file].decode("utf-8", "replace")
    if ok:
        _log_event("ArsenicV3-Dsc installed")
    return {"verified": ok}


def uninstall(flavor="Discord"):
    app_dir = find_app_dir(flavor)
    asar_path = find_core_asar(app_dir)
    if not asar_path:
        return False
    header, raw, data_start = asar.read_archive(asar_path)
    files = asar.extract_files(raw, header, data_start)
    main_file = _main_entry_file(files)
    idx_text = files[main_file].decode("utf-8", "replace")
    if MARKER not in idx_text:
        return False
    files[main_file] = _strip_av3_lines(idx_text).encode("utf-8")
    new_asar = asar.build_archive(header, files)
    tmp = asar_path + ".av3tmp"
    with open(tmp, "wb") as f:
        f.write(new_asar)
    _replace_atomic(tmp, asar_path, flavor)
    _log_event("ArsenicV3-Dsc uninstalled")
    return True
