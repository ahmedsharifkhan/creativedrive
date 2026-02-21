import os, json, datetime

DRIVE_DIR = "drive"
DEFAULT_FOLDERS = ["Images", "Videos", "Files", "Apps"]

def iso_mtime(path):
    ts = os.path.getmtime(path)
    return datetime.datetime.utcfromtimestamp(ts).isoformat() + "Z"

def get_kind(full_path, is_dir):
    if is_dir:
        return "folder"
    ext = os.path.splitext(full_path)[1].lower()
    if ext in [".jpg", ".jpeg", ".png", ".gif", ".webp"]:
        return "image"
    if ext in [".mp4", ".mov", ".mkv", ".webm"]:
        return "video"
    if ext == ".pdf":
        return "pdf"
    if ext in [".exe", ".msi"]:
        return "app"
    return "file"

def node_for(full_path):
    is_dir = os.path.isdir(full_path)
    rel = os.path.relpath(full_path, DRIVE_DIR).replace("\\", "/")
    name = os.path.basename(full_path)
    ext = "" if is_dir else os.path.splitext(name)[1].lower()
    kind = get_kind(full_path, is_dir)
    size = 0 if is_dir else os.path.getsize(full_path)

    # IMPORTANT: URL must be relative for GitHub Pages
    url = None if is_dir else f"drive/{rel}"

    node = {
        "id": rel,
        "name": name,
        "kind": kind,
        "isDir": is_dir,
        "ext": ext,
        "size": size,
        "modified": iso_mtime(full_path),
        "relPath": rel,
        "url": url
    }

    if is_dir:
        children = []
        for entry in os.listdir(full_path):
            if entry.startswith("."):
                continue
            children.append(node_for(os.path.join(full_path, entry)))

        children.sort(key=lambda x: (0 if x["isDir"] else 1, x["name"].lower()))
        node["children"] = children

    return node

def ensure_folders():
    os.makedirs(DRIVE_DIR, exist_ok=True)
    for f in DEFAULT_FOLDERS:
        os.makedirs(os.path.join(DRIVE_DIR, f), exist_ok=True)

def build_root():
    ensure_folders()
    return {
        "id": "",
        "name": "My Drive",
        "kind": "folder",
        "isDir": True,
        "relPath": "",
        "children": [node_for(os.path.join(DRIVE_DIR, f)) for f in DEFAULT_FOLDERS]
    }

if __name__ == "__main__":
    root = build_root()
    with open("tree.json", "w", encoding="utf-8") as f:
        json.dump(root, f, ensure_ascii=False, indent=2)
    print("✅ tree.json generated")