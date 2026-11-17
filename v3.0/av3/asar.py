import copy
import hashlib
import json
import struct


class AsarError(Exception):
    pass

def read_archive(path):
    with open(path, "rb") as f:
        raw = f.read()
    if len(raw) < 16:
        raise AsarError(f"{path}: too small to be an asar")
    header_len = struct.unpack("<I", raw[4:8])[0]
    str_len = struct.unpack("<I", raw[12:16])[0]
    if 16 + str_len > len(raw) or 8 + header_len > len(raw):
        raise AsarError(f"{path}: corrupted header")
    js = raw[16:16 + str_len].decode("utf-8")
    return json.loads(js), raw, 8 + header_len


def iter_file_nodes(node, prefix=""):
    for name, child in (node.get("files") or {}).items():
        p = f"{prefix}/{name}" if prefix else name
        if "files" in child:
            yield from iter_file_nodes(child, p)
        else:
            yield p, child


def extract_files(raw, header, data_start):
    out = {}
    for p, node in iter_file_nodes(header):
        if node.get("unpacked"):
            continue
        off = data_start + int(node["offset"])
        size = node["size"]
        if off + size > len(raw):
            raise AsarError(f"{p}: data out of bounds")
        out[p] = raw[off:off + size]
    return out


def _integrity(data, block_size=4194304):
    blocks = [hashlib.sha256(data[i:i + block_size]).hexdigest()
              for i in range(0, len(data), block_size)]
    return {
        "algorithm": "SHA256",
        "hash": hashlib.sha256(data).hexdigest(),
        "blockSize": block_size,
        "blocks": blocks,
    }


def build_archive(header, files):

    header = copy.deepcopy(header)
    pieces = []
    cursor = 0

    def assign(node, prefix=""):
        nonlocal cursor
        for name, child in (node.get("files") or {}).items():
            p = f"{prefix}/{name}" if prefix else name
            if "files" in child:
                assign(child, p)
                continue
            if child.get("unpacked"):
                continue
            if p not in files:
                raise AsarError(f"missing content for file: {p}")
            data = files[p]
            child["offset"] = str(cursor)
            child["size"] = len(data)
            if "integrity" in child:
                child["integrity"] = _integrity(data, child["integrity"].get("blockSize", 4194304))
            pieces.append(data)
            cursor += len(data)

    assign(header)
    js = json.dumps(header, separators=(",", ":"), ensure_ascii=False).encode("utf-8")
    pad = (-len(js)) % 4
    header_pickle = struct.pack("<II", 4 + len(js) + pad, len(js)) + js + b"\x00" * pad
    size_pickle = struct.pack("<II", 4, len(header_pickle))
    return size_pickle + header_pickle + b"".join(pieces)
