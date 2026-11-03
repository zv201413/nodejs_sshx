#!/usr/bin/env python3
"""Build the panel deployment ZIP without including user configuration or credentials."""

import os
from pathlib import Path
import tempfile
import zipfile


root = Path(__file__).resolve().parents[1]
files = [
    "index.js", "log-limit.js", "runtime-files.js", "tls-cert.js",
    "tls-links.js", "hyp2p.js", "package.json", "index.html",
]
contents = [(name, (root / name).read_bytes()) for name in files]
destination = root / "deploy" / "nodejs-sshx-pterodactyl.zip"
destination.parent.mkdir(parents=True, exist_ok=True)
with tempfile.NamedTemporaryFile(dir=destination.parent, suffix=".zip", delete=False) as temp:
    temporary = Path(temp.name)
try:
    with zipfile.ZipFile(temporary, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for name, data in contents:
            entry = zipfile.ZipInfo(name, date_time=(1980, 1, 1, 0, 0, 0))
            entry.compress_type = zipfile.ZIP_DEFLATED
            entry.create_system = 3
            entry.external_attr = 0o100644 << 16
            archive.writestr(entry, data)
    os.chmod(temporary, 0o644)
    os.replace(temporary, destination)
finally:
    temporary.unlink(missing_ok=True)
print(f"Built {destination} ({len(files)} files; existing application.properties is preserved)")
