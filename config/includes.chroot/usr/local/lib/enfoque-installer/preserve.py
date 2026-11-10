"""Conservative, offline user-file staging for Enfoque OS.

Only standard personal directories are migrated. An independent backup volume
is mandatory before repartitioning. This module never formats disks.
"""
from dataclasses import dataclass
from pathlib import Path
import hashlib
import json
import os
import re
import shutil
import stat
import time

FOLDERS = {
    "Desktop": ("Desktop", "Área de Trabalho", "Area de Trabalho", "Bureau", "Escritorio"),
    "Downloads": ("Downloads", "Transferências", "Transferencias", "Download"),
    "Documentos": ("Documents", "Documentos", "Documenti"),
    "Imagens": ("Pictures", "Imagens", "Images", "Fotos"),
    "Vídeos": ("Videos", "Vídeos", "Video"),
    "Músicas": ("Music", "Músicas", "Musicas", "Música"),
}
EXCLUDED_PROFILES = {"default", "default user", "all users", "systemprofile",
                     "localservice", "networkservice"}
MAX_FILES = 500000
CHUNK = 1024 * 1024


class PreservationError(RuntimeError):
    pass


@dataclass(frozen=True)
class UserFile:
    original: Path
    relative: Path
    size: int


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(CHUNK), b""):
            digest.update(block)
    return digest.hexdigest()


def _is_real_directory(path):
    return path.is_dir() and not path.is_symlink()


def _valid_name(name):
    return bool(name) and name not in (".", "..") and "\x00" not in name


def _discover_profiles(partition_root):
    """Find home profiles, including locally cached OneDrive redirected folders."""
    profiles = []
    for base_name in ("Users", "Usuários", "Usuarios",
                      "Documents and Settings", "home"):
        base = partition_root / base_name
        if not _is_real_directory(base):
            continue
        for profile in sorted(base.iterdir(), key=lambda p: p.name.casefold()):
            if _is_real_directory(profile) and profile.name.casefold() not in EXCLUDED_PROFILES:
                profiles.append(profile)
    # A separate /home partition may store accounts directly at its root.
    if not profiles and partition_root.name.lower() not in ("", "."):
        for child in sorted(partition_root.iterdir(), key=lambda p: p.name.casefold()):
            if (_is_real_directory(child) and
                    child.name not in ("lost+found", "System Volume Information", "$RECYCLE.BIN") and
                    any(_is_real_directory(child / label)
                        for aliases in FOLDERS.values() for label in aliases)):
                profiles.append(child)
    if not profiles:
        if any(_is_real_directory(partition_root / label)
               for aliases in FOLDERS.values() for label in aliases):
            profiles.append(partition_root)
    # Also scan redirected OneDrive folders if locally present.
    final = []
    for profile in profiles:
        final.append((profile, profile.name))
        if profile == partition_root:
            continue
        for child in sorted(profile.iterdir(), key=lambda p: p.name.casefold()):
            if child.name.casefold().startswith("onedrive") and _is_real_directory(child):
                if any(_is_real_directory(child / label)
                       for aliases in FOLDERS.values() for label in aliases):
                    final.append((child, profile.name))
    return final


def _walk_regular_files(folder):
    stack = [folder]
    while stack:
        current = stack.pop()
        for entry in sorted(os.scandir(current), key=lambda e: e.name.casefold(), reverse=True):
            path = Path(entry.path)
            if entry.is_symlink():
                raise PreservationError(f"Link simbolico nos dados: {path}. Faca backup manual.")
            if entry.is_dir(follow_symlinks=False):
                stack.append(path)
            elif entry.is_file(follow_symlinks=False):
                # Somente imagens .iso (inclusive .ISO) ficam fora da migracao.
                # Outros arquivos, de qualquer tipo e tamanho, sao preservados.
                if path.suffix.casefold() == ".iso":
                    continue
                s = entry.stat(follow_symlinks=False)
                if not stat.S_ISREG(s.st_mode):
                    raise PreservationError(f"Arquivo especial nao suportado: {path}")
                yield path, s.st_size
            else:
                raise PreservationError(f"Item nao suportado na pasta pessoal: {path}")


def scan_partition(partition_root, volume_label):
    """Returns source/relative-path metadata, without following any symlink."""
    if not _is_real_directory(partition_root):
        raise PreservationError("Origem de leitura invalida.")
    collected = []
    weights = {}
    profiles = _discover_profiles(partition_root)
    for profile, profile_name in profiles:
        for destination, aliases in FOLDERS.items():
            for alias in aliases:
                folder = profile / alias
                if not _is_real_directory(folder):
                    if folder.is_symlink():
                        raise PreservationError(f"Pasta pessoal redirecionada: {folder}. Faca backup manual.")
                    continue
                for file, size in _walk_regular_files(folder):
                    collected.append((profile_name, file, Path(destination),
                                      file.relative_to(folder), size))
                    weights[profile_name] = weights.get(profile_name, 0) + size + 1
                    if len(collected) > MAX_FILES:
                        raise PreservationError("Mais de 500 mil arquivos. Backup manual necessario.")
    if not weights:
        return []
    # Primary actual user has the largest locally available file collection.
    # OneDrive redirected folders belong to that same Windows profile.
    primary = max(sorted(weights), key=lambda name: weights[name])
    items = []
    for profile_name, source, destination, relative, size in collected:
        if profile_name != primary:
            destination /= f"Usuário {_safe_label(profile_name)}"
        items.append(UserFile(source, destination / relative, size))
    return items


def _safe_label(label):
    result = re.sub(r"[^a-zA-Z0-9_.-]+", "-", label).strip(".-")
    return result[:60] or "Usuario"


def compile_inventory(volumes):
    """volumes: sequence of (source label, items) scanned on mounted partitions."""
    all_items = []
    used = set()
    for volume_label, records in volumes:
        for item in records:
            dest = item.relative
            # Keep all conflicting files instead of silently overriding.
            if dest.as_posix().casefold() in used:
                base = dest.stem
                suffix = dest.suffix
                candidate = dest.with_name(f"{base} [importado-{_safe_label(volume_label)}]{suffix}")
                i = 2
                while candidate.as_posix().casefold() in used:
                    candidate = dest.with_name(f"{base} [importado-{_safe_label(volume_label)}-{i}]{suffix}")
                    i += 1
                dest = candidate
            used.add(dest.as_posix().casefold())
            all_items.append(UserFile(item.original, dest, item.size))
    if not all_items:
        raise PreservationError(
            "Nenhum arquivo encontrado nas pastas pessoais reconhecidas. "
            "Instalacao interrompida para evitar perda de dados."
        )
    return all_items


def required_space(items):
    # 10% overhead and 128 MiB for manifest, dirs, metadata and FAT allocation.
    size = sum(f.size for f in items)
    return size + max(128 * 1024 ** 2, size // 10)


def _within(root, rel):
    if rel.is_absolute() or not rel.parts or any(p in ("..", ".", "") for p in rel.parts):
        raise PreservationError("Caminho inseguro no inventario.")
    target = root.joinpath(*rel.parts)
    if not target.resolve(strict=False).is_relative_to(root.resolve()):
        raise PreservationError("Caminho fora da pasta autorizada.")
    return target


def _write_copy(source, target):
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.is_symlink() or target.exists():
        raise PreservationError(f"Destino de backup ja existe: {target}")
    src_digest = hashlib.sha256()
    with source.open("rb") as fin, target.open("xb") as fout:
        for block in iter(lambda: fin.read(CHUNK), b""):
            src_digest.update(block)
            fout.write(block)
        fout.flush()
        os.fsync(fout.fileno())
    try:
        shutil.copystat(source, target, follow_symlinks=False)
    except OSError:
        # Some removable filesystems do not implement POSIX chmod/mtime.
        pass
    if sha256(target) != src_digest.hexdigest():
        raise PreservationError(f"Copia nao bate com original: {source}")
    return src_digest.hexdigest()


def stage_files(items, backup_root, *, min_free=None):
    """Stage files, hash each copy and write an atomic manifest; never reformat."""
    root = Path(backup_root)
    if root.exists():
        raise PreservationError("Diretorio de backup existente; nao sobrescrever.")
    free = shutil.disk_usage(root.parent).free if min_free is None else min_free
    if free < required_space(items):
        raise PreservationError("Unidade de backup sem espaco suficiente.")
    root.mkdir(mode=0o700, parents=False)
    (root / "data").mkdir(mode=0o700)
    manifest = {"format": 1, "created": int(time.time()), "files": [],
                "total_bytes": sum(item.size for item in items)}
    try:
        for item in items:
            dest = _within(root / "data", item.relative)
            checksum = _write_copy(item.original, dest)
            manifest["files"].append({"path": item.relative.as_posix(),
                                      "size": item.size, "sha256": checksum})
        partial = root / "manifest.json.part"
        with partial.open("x", encoding="utf-8") as fout:
            json.dump(manifest, fout, ensure_ascii=False, indent=2)
            fout.flush()
            os.fsync(fout.fileno())
        partial.rename(root / "manifest.json")
        os.sync()
        verify_stage(root)
        return manifest
    except Exception:
        # Never erase an incomplete backup; keep it available for inspection.
        raise


def verify_stage(backup_root):
    root = Path(backup_root)
    manifest_file = root / "manifest.json"
    if not manifest_file.is_file() or manifest_file.is_symlink():
        raise PreservationError("Manifesto de backup ausente.")
    manifest = json.loads(manifest_file.read_text(encoding="utf-8"))
    if manifest.get("format") != 1 or not isinstance(manifest.get("files"), list):
        raise PreservationError("Manifesto de backup invalido.")
    if not manifest["files"]:
        raise PreservationError("Backup vazio.")
    paths = set()
    total = 0
    for entry in manifest["files"]:
        rel = Path(entry["path"])
        if rel.as_posix().casefold() in paths:
            raise PreservationError("Caminho duplicado no backup.")
        paths.add(rel.as_posix().casefold())
        source = _within(root / "data", rel)
        if (not source.is_file() or source.is_symlink() or
                source.stat().st_size != entry["size"] or sha256(source) != entry["sha256"]):
            raise PreservationError(f"Integridade do backup falhou: {rel}")
        total += entry["size"]
    if total != manifest.get("total_bytes"):
        raise PreservationError("Tamanho total do backup nao confere.")
    return manifest


def restore_files(backup_root, user_home, *, uid, gid):
    """Verify the independent backup again, copy, verify destination and set ownership."""
    manifest = verify_stage(backup_root)
    root = Path(backup_root) / "data"
    home = Path(user_home)
    if not home.is_dir() or home.is_symlink():
        raise PreservationError("Diretorio do usuario de destino invalido.")
    for folder in FOLDERS:
        (home / folder).mkdir(mode=0o755, parents=True, exist_ok=True)
        os.chown(home / folder, uid, gid)
    for entry in manifest["files"]:
        rel = Path(entry["path"])
        source = _within(root, rel)
        target = _within(home, rel)
        # The two default company shortcuts must remain usable after restore.
        if target.exists() or target.is_symlink():
            stem = target.stem
            suffix = target.suffix
            i = 1
            while target.exists() or target.is_symlink():
                target = target.with_name(f"{stem} [arquivo antigo {i}]{suffix}")
                i += 1
        current = target.parent
        missing = []
        while current != home and not current.exists():
            missing.append(current)
            current = current.parent
        if any(p.is_symlink() for p in [current, *current.parents] if p != home and home in p.parents):
            raise PreservationError("Destino possui link simbolico inseguro.")
        target.parent.mkdir(parents=True, exist_ok=True)
        for directory in missing:
            os.chown(directory, uid, gid)
        checksum = _write_copy(source, target)
        if checksum != entry["sha256"]:
            raise PreservationError(f"Falha ao restaurar: {rel}")
        os.chown(target, uid, gid)
    # Fixed paths let Thunar and XFCE show files in the expected locations.
    config = home / ".config"
    config.mkdir(exist_ok=True)
    dirs = config / "user-dirs.dirs"
    mapping = {
        "DESKTOP": "Desktop", "DOWNLOAD": "Downloads", "DOCUMENTS": "Documentos",
        "PICTURES": "Imagens", "VIDEOS": "Vídeos", "MUSIC": "Músicas",
    }
    if dirs.is_symlink() or config.is_symlink():
        raise PreservationError("Configuracao XDG com link simbolico inseguro.")
    with dirs.open("w", encoding="utf-8") as output:
        for key, value in mapping.items():
            output.write(f'XDG_{key}_DIR="$HOME/{value}"\n')
    os.chown(config, uid, gid)
    os.chown(dirs, uid, gid)
    locale = config / "user-dirs.locale"
    if not locale.exists():
        locale.write_text("pt_BR\n", encoding="utf-8")
        os.chown(locale, uid, gid)
    return len(manifest["files"])
