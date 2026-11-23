#!/usr/bin/env python3
"""
HalucynacjeGTP2 — Deterministyczny generator i walidator 3 binarnych szablonów
wysp `.nbt` dla Skyblock Builder (Minecraft 1.21.1, DataVersion 3955).

Zero zewnętrznych zależności (wyłącznie Python 3 stdlib: struct, gzip, json, pathlib).
Korzysta wyłącznie z bloków waniliowych Minecraft 1.21.1 oraz zweryfikowanych na
prawdziwych plikach JAR bloków obowiązkowych modów rdzeniowych paczki:
  - `create` (`create-1.21.1-6.0.10.jar`)
  - `createdeco` (`createdeco-2.1.3.jar`)
  - `lightmanscurrency` (`lightmanscurrency-1.21-2.3.0.6.jar` — bezstanowe `atm` i `terminal`!)

Docelowe pliki (zgodne z `MelanX/SkyblockBuilder` 21.1.37 `SkyPaths.java` oraz
`SpreadInfo$Origin.CENTER`, gdzie `originOffset = (size.x // 2, size.y // 2, size.z // 2)`):
  1. config/skyblockbuilder/templates/islands/starter_island.nbt     (15 x 13 x 15, floor_y=6, offset [-7,-6,-7])
  2. config/skyblockbuilder/templates/spreads/market_island.nbt      (45 x 25 x 35, floor_y=8, offset [152, 4, 0])
  3. config/skyblockbuilder/templates/spreads/industrial_island.nbt  (33 x 21 x 33, floor_y=6, offset [0, 4, 152])

Użycie:
  python3 scripts/generate_island_nbt.py            # generuje 3 pliki .nbt i weryfikuje je
  python3 scripts/generate_island_nbt.py --verify   # parsuje i weryfikuje istniejące .nbt na dysku
"""

from __future__ import annotations

import argparse
import gzip
import io
import json
import math
import re
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Minecraft 1.21.1 DataVersion
MC_1_21_1_DATA_VERSION = 3955

# Dozwolone przestrzenie nazw (wyłącznie rdzeniowe mody zainstalowane na kliencie i serwerze)
ALLOWED_NAMESPACES = ("minecraft:", "create:", "createdeco:", "lightmanscurrency:")

# NBT tag type IDs (Java Edition big-endian)
TAG_END = 0
TAG_BYTE = 1
TAG_SHORT = 2
TAG_INT = 3
TAG_LONG = 4
TAG_FLOAT = 5
TAG_DOUBLE = 6
TAG_BYTE_ARRAY = 7
TAG_STRING = 8
TAG_LIST = 9
TAG_COMPOUND = 10
TAG_INT_ARRAY = 11
TAG_LONG_ARRAY = 12


# ---------------------------------------------------------------------------
# Minimalistyczny, kompletny koder / dekoder binarnego NBT (Java Edition)
# ---------------------------------------------------------------------------

@dataclass(frozen=True)
class NbtByte:
    value: int


@dataclass(frozen=True)
class NbtShort:
    value: int


@dataclass(frozen=True)
class NbtInt:
    value: int


@dataclass(frozen=True)
class NbtLong:
    value: int


@dataclass(frozen=True)
class NbtString:
    value: str


@dataclass(frozen=True)
class NbtList:
    elem_type: int
    items: list[Any]


@dataclass(frozen=True)
class NbtCompound:
    entries: dict[str, Any]


def _tag_type_of(val: Any) -> int:
    if isinstance(val, NbtByte):
        return TAG_BYTE
    if isinstance(val, NbtShort):
        return TAG_SHORT
    if isinstance(val, NbtInt):
        return TAG_INT
    if isinstance(val, NbtLong):
        return TAG_LONG
    if isinstance(val, NbtString):
        return TAG_STRING
    if isinstance(val, NbtList):
        return TAG_LIST
    if isinstance(val, NbtCompound):
        return TAG_COMPOUND
    raise TypeError(f"Unsupported NBT wrapper type: {type(val)!r}")


def _write_str(buf: io.BytesIO, text: str) -> None:
    raw = text.encode("utf-8")
    buf.write(struct.pack(">H", len(raw)))
    buf.write(raw)


def _write_payload(buf: io.BytesIO, tag_type: int, val: Any) -> None:
    if tag_type == TAG_BYTE:
        buf.write(struct.pack(">b", val.value))
    elif tag_type == TAG_SHORT:
        buf.write(struct.pack(">h", val.value))
    elif tag_type == TAG_INT:
        buf.write(struct.pack(">i", val.value))
    elif tag_type == TAG_LONG:
        buf.write(struct.pack(">q", val.value))
    elif tag_type == TAG_STRING:
        _write_str(buf, val.value)
    elif tag_type == TAG_LIST:
        buf.write(struct.pack(">bi", val.elem_type, len(val.items)))
        for item in val.items:
            if _tag_type_of(item) != val.elem_type:
                raise ValueError(
                    f"NBT list element type mismatch: expected {val.elem_type}, got {_tag_type_of(item)}"
                )
            _write_payload(buf, val.elem_type, item)
    elif tag_type == TAG_COMPOUND:
        for key, child in val.entries.items():
            child_type = _tag_type_of(child)
            buf.write(struct.pack(">b", child_type))
            _write_str(buf, key)
            _write_payload(buf, child_type, child)
        buf.write(struct.pack(">b", TAG_END))
    else:
        raise ValueError(f"Unsupported NBT write tag_type={tag_type}")


def encode_nbt_gzip(root: NbtCompound) -> bytes:
    buf = io.BytesIO()
    buf.write(struct.pack(">b", TAG_COMPOUND))
    _write_str(buf, "")
    _write_payload(buf, TAG_COMPOUND, root)
    # mtime=0 gwarantuje w 100% deterministyczne pliki binarne w Git
    return gzip.compress(buf.getvalue(), compresslevel=9, mtime=0)


def _read_exact(stream: io.BytesIO, n: int) -> bytes:
    data = stream.read(n)
    if len(data) != n:
        raise ValueError(f"Unexpected EOF while reading NBT: expected {n} bytes, got {len(data)}")
    return data


def _read_str(stream: io.BytesIO) -> str:
    (length,) = struct.unpack(">H", _read_exact(stream, 2))
    return _read_exact(stream, length).decode("utf-8")


def _read_payload(stream: io.BytesIO, tag_type: int) -> Any:
    if tag_type == TAG_BYTE:
        return NbtByte(struct.unpack(">b", _read_exact(stream, 1))[0])
    if tag_type == TAG_SHORT:
        return NbtShort(struct.unpack(">h", _read_exact(stream, 2))[0])
    if tag_type == TAG_INT:
        return NbtInt(struct.unpack(">i", _read_exact(stream, 4))[0])
    if tag_type == TAG_LONG:
        return NbtLong(struct.unpack(">q", _read_exact(stream, 8))[0])
    if tag_type == TAG_FLOAT:
        return struct.unpack(">f", _read_exact(stream, 4))[0]
    if tag_type == TAG_DOUBLE:
        return struct.unpack(">d", _read_exact(stream, 8))[0]
    if tag_type == TAG_BYTE_ARRAY:
        (length,) = struct.unpack(">i", _read_exact(stream, 4))
        return list(_read_exact(stream, length))
    if tag_type == TAG_STRING:
        return NbtString(_read_str(stream))
    if tag_type == TAG_LIST:
        elem_type, length = struct.unpack(">bi", _read_exact(stream, 5))
        items = [_read_payload(stream, elem_type) for _ in range(length)]
        return NbtList(elem_type, items)
    if tag_type == TAG_COMPOUND:
        entries: dict[str, Any] = {}
        while True:
            (child_type,) = struct.unpack(">b", _read_exact(stream, 1))
            if child_type == TAG_END:
                break
            name = _read_str(stream)
            entries[name] = _read_payload(stream, child_type)
        return NbtCompound(entries)
    if tag_type == TAG_INT_ARRAY:
        (length,) = struct.unpack(">i", _read_exact(stream, 4))
        return list(struct.unpack(f">{length}i", _read_exact(stream, 4 * length)))
    if tag_type == TAG_LONG_ARRAY:
        (length,) = struct.unpack(">i", _read_exact(stream, 4))
        return list(struct.unpack(f">{length}q", _read_exact(stream, 8 * length)))
    raise ValueError(f"Unknown NBT tag type: {tag_type}")


def decode_nbt_gzip(raw_gz: bytes) -> NbtCompound:
    raw = gzip.decompress(raw_gz)
    stream = io.BytesIO(raw)
    (root_type,) = struct.unpack(">b", _read_exact(stream, 1))
    if root_type != TAG_COMPOUND:
        raise ValueError(f"Root NBT tag must be TAG_Compound (10), got {root_type}")
    _root_name = _read_str(stream)
    root = _read_payload(stream, TAG_COMPOUND)
    remaining = stream.read()
    if remaining:
        raise ValueError(f"Trailing {len(remaining)} bytes after root NBT compound")
    return root


# ---------------------------------------------------------------------------
# Pomocniczy builder struktur Minecraft (.nbt)
# ---------------------------------------------------------------------------

class StructureBuilder:
    def __init__(self, sx: int, sy: int, sz: int) -> None:
        self.size = (sx, sy, sz)
        self._blocks: dict[tuple[int, int, int], tuple[str, tuple[tuple[str, str], ...], NbtCompound | None]] = {}

    def set(
        self,
        x: int,
        y: int,
        z: int,
        block: str,
        props: dict[str, str] | None = None,
        nbt: NbtCompound | None = None,
    ) -> None:
        sx, sy, sz = self.size
        if not (0 <= x < sx and 0 <= y < sy and 0 <= z < sz):
            raise ValueError(f"Block ({x}, {y}, {z}) out of bounds for size {self.size}")
        prop_tuple = tuple(sorted((props or {}).items()))
        self._blocks[(x, y, z)] = (block, prop_tuple, nbt)

    def clear(self, x: int, y: int, z: int) -> None:
        self._blocks.pop((x, y, z), None)

    def fill(
        self,
        x0: int,
        y0: int,
        z0: int,
        x1: int,
        y1: int,
        z1: int,
        block: str,
        props: dict[str, str] | None = None,
    ) -> None:
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                for z in range(z0, z1 + 1):
                    self.set(x, y, z, block, props)

    def clear_box(self, x0: int, y0: int, z0: int, x1: int, y1: int, z1: int) -> None:
        for x in range(x0, x1 + 1):
            for y in range(y0, y1 + 1):
                for z in range(z0, z1 + 1):
                    self._blocks.pop((x, y, z), None)

    def get_block_name(self, x: int, y: int, z: int) -> str | None:
        entry = self._blocks.get((x, y, z))
        return entry[0] if entry else None

    def to_nbt(self) -> NbtCompound:
        palette_index: dict[tuple[str, tuple[tuple[str, str], ...]], int] = {}
        palette_list: list[NbtCompound] = []
        blocks_list: list[NbtCompound] = []

        # Sortowanie po (y, z, x) dla pełnej deterministyczności
        for (x, y, z) in sorted(self._blocks.keys(), key=lambda p: (p[1], p[2], p[0])):
            name, props, block_nbt = self._blocks[(x, y, z)]
            key = (name, props)
            if key not in palette_index:
                palette_index[key] = len(palette_list)
                pal_entries: dict[str, Any] = {"Name": NbtString(name)}
                if props:
                    pal_entries["Properties"] = NbtCompound(
                        {k: NbtString(v) for k, v in props}
                    )
                palette_list.append(NbtCompound(pal_entries))

            blk_entries: dict[str, Any] = {
                "pos": NbtList(TAG_INT, [NbtInt(x), NbtInt(y), NbtInt(z)]),
                "state": NbtInt(palette_index[key]),
            }
            if block_nbt is not None:
                blk_entries["nbt"] = block_nbt
            blocks_list.append(NbtCompound(blk_entries))

        sx, sy, sz = self.size
        return NbtCompound(
            {
                "DataVersion": NbtInt(MC_1_21_1_DATA_VERSION),
                "size": NbtList(TAG_INT, [NbtInt(sx), NbtInt(sy), NbtInt(sz)]),
                "palette": NbtList(TAG_COMPOUND, palette_list),
                "blocks": NbtList(TAG_COMPOUND, blocks_list),
                "entities": NbtList(TAG_COMPOUND, []),
            }
        )


def make_chest_nbt(items: list[tuple[int, str, int]]) -> NbtCompound:
    """Tworzy poprawny blok encji `minecraft:chest` dla Minecraft 1.21.1 (`count` jako TAG_Int)."""
    item_tags: list[NbtCompound] = []
    for slot, item_id, count in items:
        item_tags.append(
            NbtCompound(
                {
                    "Slot": NbtByte(slot),
                    "id": NbtString(item_id),
                    "count": NbtInt(count),
                }
            )
        )
    return NbtCompound(
        {
            "id": NbtString("minecraft:chest"),
            "Items": NbtList(TAG_COMPOUND, item_tags),
        }
    )


def make_sign_nbt(lines: tuple[str, str, str, str], color: str = "white", glowing: bool = True) -> NbtCompound:
    """Tworzy woskowany, świecący szyld `minecraft:sign` w formacie Minecraft 1.21.1."""
    front_msgs = [NbtString(json.dumps({"text": ln}, ensure_ascii=False)) for ln in lines]
    empty_msgs = [NbtString('{"text":""}') for _ in range(4)]
    return NbtCompound(
        {
            "id": NbtString("minecraft:sign"),
            "is_waxed": NbtByte(1),
            "front_text": NbtCompound(
                {
                    "has_glowing_text": NbtByte(1 if glowing else 0),
                    "color": NbtString(color),
                    "messages": NbtList(TAG_STRING, front_msgs),
                }
            ),
            "back_text": NbtCompound(
                {
                    "has_glowing_text": NbtByte(0),
                    "color": NbtString("black"),
                    "messages": NbtList(TAG_STRING, empty_msgs),
                }
            ),
        }
    )


def _deterministic_noise(x: int, z: int, seed: int = 0) -> float:
    """Deterministyczna gładka funkcja pseudolosowa [-1, 1] do rzeźbienia latających skał."""
    return (
        0.55 * math.sin(x * 0.37 + z * 0.21 + seed)
        + 0.30 * math.cos(x * 0.71 - z * 0.53 + seed * 1.7)
        + 0.15 * math.sin((x + z) * 1.13 + seed * 0.5)
    )


# ---------------------------------------------------------------------------
# 1. Wyspa Startowa: starter_island.nbt (15 x 13 x 15)
#    Środek powierzchni: (7, 6, 7) -> świat (0, 64, 0) przy offset [-7, -6, -7]
#    Punkt spawnu:       (7, 7, 7) -> świat (0, 65, 0), patrzenie: EAST (+X)
# ---------------------------------------------------------------------------

def build_starter_island() -> StructureBuilder:
    sb = StructureBuilder(15, 13, 15)
    cx, cz = 7, 7

    # Naturalna, zwężająca się bryła latającej wyspy (y = 0..6)
    layer_radii = {
        6: 5.4,  # powierzchnia grass_block
        5: 5.0,  # warstwa dirt
        4: 4.3,  # stone / cobblestone / dekoracyjne żyły andezytu i rud
        3: 3.3,  # stone / cobblestone
        2: 2.3,  # cobblestone / andesite
        1: 1.3,  # dolny stożek
    }
    for y, radius in layer_radii.items():
        for x in range(15):
            for z in range(15):
                dist = math.hypot(x - cx, z - cz)
                if dist <= radius:
                    if y == 6:
                        sb.set(x, y, z, "minecraft:grass_block", {"snowy": "false"})
                    elif y == 5:
                        sb.set(x, y, z, "minecraft:dirt")
                    elif y == 4:
                        if (x, z) in {(5, 6), (9, 8)}:
                            sb.set(x, y, z, "minecraft:andesite")
                        elif (x, z) == (6, 8):
                            sb.set(x, y, z, "minecraft:coal_ore")
                        elif (x, z) == (8, 6):
                            sb.set(x, y, z, "minecraft:iron_ore")
                        elif (x + z) % 3 == 0:
                            sb.set(x, y, z, "minecraft:cobblestone")
                        else:
                            sb.set(x, y, z, "minecraft:stone")
                    elif y == 3:
                        sb.set(
                            x,
                            y,
                            z,
                            "minecraft:andesite" if (x + z) % 4 == 0 else "minecraft:stone",
                        )
                    else:
                        sb.set(x, y, z, "minecraft:cobblestone")

    # Kotwica bedrockowa na samym dnie (7, 0, 7)
    sb.set(7, 0, 7, "minecraft:bedrock")

    # Pirs Wschodni (+X) wskazujący dokładnie kierunek na Wyspę-Rynek (+152E)
    for x in range(11, 15):
        for z in (6, 7, 8):
            blk = "minecraft:chiseled_stone_bricks" if z == 7 else "minecraft:stone_bricks"
            sb.set(x, 6, z, blk)
            if x <= 13:
                sb.set(x, 5, z, "minecraft:stone_bricks")

    # Słupki latarniowe na krańcu Pirsu Wschodniego
    for z in (6, 8):
        sb.set(14, 7, z, "minecraft:stone_brick_wall", {"up": "true", "waterlogged": "false"})
        sb.set(14, 8, z, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})

    # Znacznik Południowy (+Z) wskazujący kierunek na Hutę Południową (+152S)
    for x in (6, 7, 8):
        sb.set(x, 6, 12, "minecraft:deepslate_bricks")
        sb.set(x, 6, 13, "minecraft:polished_deepslate" if x == 7 else "minecraft:deepslate_bricks")
        sb.set(x, 5, 12, "minecraft:cobbled_deepslate")

    # Wbudowany, ustalony generator bruku (rząd z=10; świat = x-7, y+58, z-7):
    # - (3, 6, 10) [(-4, 64, 3)]: woda źródłowa (level=0)
    # - (4, 6, 10) [(-3, 64, 3)]: woda płynąca (level=1) nad dołkiem
    # - (4, 5, 10) [(-3, 63, 3)]: dołek z wodą spadającą (level=8), dno (4, 4, 10) = stone
    # - (5, 6, 10) [(-2, 64, 3)]: odnawiający się bruk (cobblestone)
    # - (6, 6, 10) [(-1, 64, 3)]: lawa źródłowa (level=0), bez styku z wodą (brak obsydianu)
    # - (6, 7, 10) [(-1, 65, 3)]: niepalna osłona nad lawą (stone_brick_slab)
    # Pełne, niepalne obramowanie boczne i spód (zero otwartych boków poza kanałem z=10)
    for x in (3, 4, 5, 6):
        sb.set(x, 6, 9, "minecraft:stone_bricks")
        sb.set(x, 6, 11, "minecraft:stone_bricks")
        sb.set(x, 5, 9, "minecraft:stone_bricks")
        sb.set(x, 5, 11, "minecraft:stone_bricks")
    sb.set(2, 6, 10, "minecraft:stone_bricks")
    sb.set(7, 6, 10, "minecraft:stone_bricks")
    for x in (3, 5, 6):
        sb.set(x, 5, 10, "minecraft:stone_bricks")

    sb.set(3, 6, 10, "minecraft:water", {"level": "0"})
    sb.set(4, 6, 10, "minecraft:water", {"level": "1"})
    sb.set(4, 5, 10, "minecraft:water", {"level": "8"})
    sb.set(5, 6, 10, "minecraft:cobblestone")
    sb.set(6, 6, 10, "minecraft:lava", {"level": "0"})
    sb.set(6, 7, 10, "minecraft:stone_brick_slab", {"type": "bottom", "waterlogged": "false"})

    # Skrzynia startowa z pakietem anty-softlock (obok spawnu) + stół rzemieślniczy
    starter_chest_items = [
        (0, "minecraft:lava_bucket", 1),
        (1, "minecraft:ice", 2),
        (2, "minecraft:oak_sapling", 4),
        (3, "minecraft:sweet_berries", 2),
        (4, "minecraft:sugar_cane", 2),
        (5, "minecraft:cactus", 1),
        (6, "minecraft:kelp", 2),
        (7, "minecraft:wheat_seeds", 4),
        (8, "minecraft:bone_meal", 8),
        (9, "minecraft:torch", 16),
        (10, "minecraft:cobblestone", 16),
        (11, "minecraft:glass", 3),
    ]
    sb.set(
        6,
        7,
        5,
        "minecraft:chest",
        {"facing": "south", "type": "single", "waterlogged": "false"},
        make_chest_nbt(starter_chest_items),
    )
    sb.set(5, 7, 5, "minecraft:crafting_table")

    # Dąb startowy w narożniku NW (pień na (3, 7..10, 3))
    trunk_coords = [(3, y, 3) for y in range(7, 11)]
    for tx, ty, tz in trunk_coords:
        sb.set(tx, ty, tz, "minecraft:oak_log", {"axis": "y"})

    leaf_positions: list[tuple[int, int, int]] = []
    for y in (9, 10):
        for dx in range(-2, 3):
            for dz in range(-2, 3):
                if abs(dx) == 2 and abs(dz) == 2:
                    continue
                if dx == 0 and dz == 0:
                    continue
                leaf_positions.append((3 + dx, y, 3 + dz))
    for dx in range(-1, 2):
        for dz in range(-1, 2):
            leaf_positions.append((3 + dx, 11, 3 + dz))
    for dx, dz in [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)]:
        leaf_positions.append((3 + dx, 12, 3 + dz))

    for lx, ly, lz in leaf_positions:
        dist = min(abs(lx - tx) + abs(ly - ty) + abs(lz - tz) for tx, ty, tz in trunk_coords)
        dist = max(1, min(6, dist))
        sb.set(
            lx,
            ly,
            lz,
            "minecraft:oak_leaves",
            {"distance": str(dist), "persistent": "false", "waterlogged": "false"},
        )

    for tx, tz in [(5, 7), (9, 5), (9, 9), (6, 9)]:
        sb.set(tx, 7, tz, "minecraft:torch")

    sb.set(7, 7, 7, "minecraft:air")
    sb.set(7, 8, 7, "minecraft:air")

    return sb


# ---------------------------------------------------------------------------
# 2. Wielka Wyspa-Rynek: market_island.nbt (45 x 25 x 35)
#    Środek placu: (22, 8, 17) -> świat (152, 64, 0) przy offset [152, 4, 0], origin "center"
#    Architektura wiktoriańsko-steampunkowa (Create 6 + Lightman's Currency):
#      - Rzeźbiony latający klif (y=0..7) ze stalowymi kratownicami i latarniami nawigacyjnymi
#      - 100% PŁASKI plac mozaikowy na y=8 (Y=64) — ZERO schodów/półpłytek na poziomie chodnika
#        dla bezbłędnego pathfindingu NPC `Shoppers`!
#      - Monumentalna Zachodnia Hala Stacji Kolejowej (x=0..8, z=11..23) ze szklanym sklepieniem,
#        miedzianymi okapami, strefą Hypertube i Padem pod Waystone
#      - 2-poziomowa Centralna Rotunda Handlowa (x=19..25, z=14..20) z miedzianą kopułą,
#        iglicą mosiężną (do y=24 / Y=80) oraz PRAWDZIWYM działającym `lightmanscurrency:terminal`
#      - 8 dwukondygnacyjnych tematycznych butików z pasiastymi markizami, polskimi szyldami,
#        otwartym frontem pod sklepy LC i 3-blokową tylną aleją automatyzacji z pomostem Create
#      - 3 PRAWDZIWE działające bankomaty `lightmanscurrency:atm` w kioskach (odstęp >= 12 bloków)
#      - Wschodni taras ogrodowy z bezpiecznie ogrodzoną fontanną, klombami i balkonem widokowym
# ---------------------------------------------------------------------------

def _build_boutique(
    sb: StructureBuilder,
    x0: int,
    z_front: int,
    facing_south: bool,
    primary_wool: str,
    accent_block: str,
    wall_block: str,
    floor_block: str,
    roof_stairs: str,
    roof_slab: str,
    sign_lines: tuple[str, str, str, str],
    sign_color: str,
    floor_y: int = 8,
) -> None:
    """Buduje dwukondygnacyjny, 6x4-blokowy butik w stylu Create Victorian Bazaar."""
    # Kierunek wgłąb sklepu (od frontu w stronę tylnej alei serwisowej)
    dz_back = -1 if facing_south else 1
    z_rows = [z_front + i * dz_back for i in range(4)]  # 0=front, 1..2=wnętrze, 3=tylna ściana
    z_min, z_max = min(z_rows), max(z_rows)
    x1 = x0 + 5

    front_face = "south" if facing_south else "north"
    back_face = "north" if facing_south else "south"
    awning_z = z_front + (1 if facing_south else -1)

    # 1. Podłoga wnętrza (100% płasko na y = floor_y!)
    sb.fill(x0, floor_y, z_min, x1, floor_y, z_max, floor_block)
    # Mosiężny / ozdobny próg na froncie
    sb.fill(x0, floor_y, z_front, x1, floor_y, z_front, "create:cut_limestone_bricks")
    sb.set(x0, floor_y, z_front, accent_block)
    sb.set(x1, floor_y, z_front, accent_block)

    # 2. Parter (y = floor_y + 1 .. floor_y + 3 = 9..11):
    #    - 4 solidne narożne kolumny (accent u dołu + stripped_spruce_log / wall)
    #    - Pełne ściany boczne (x0 i x1) z okienkiem / półką
    #    - 100% otwarty 4-blokowy front (x0+1..x1-1) oraz 2-blokowe tylne wejście serwisowe (x0+2..x0+3)
    for cx in (x0, x1):
        for cz in (z_front, z_rows[3]):
            sb.set(cx, floor_y + 1, cz, accent_block)
            sb.set(cx, floor_y + 2, cz, "minecraft:stripped_spruce_log", {"axis": "y"})
            sb.set(cx, floor_y + 3, cz, accent_block)

        # Ściany boczne wnętrza (z_rows[1], z_rows[2])
        for cz in (z_rows[1], z_rows[2]):
            sb.set(cx, floor_y + 1, cz, wall_block)
            sb.set(cx, floor_y + 2, cz, "create:framed_glass")
            sb.set(cx, floor_y + 3, cz, wall_block)

    # Tylna ściana (z_rows[3]) z otwartym 2-blokowym lukiem serwisowym (x0+2..x0+3) dla rur/taśm Create!
    for tx in (x0 + 1, x1 - 1):
        sb.set(tx, floor_y + 1, z_rows[3], wall_block)
        sb.set(tx, floor_y + 2, z_rows[3], wall_block)
        sb.set(tx, floor_y + 3, z_rows[3], wall_block)
    # Nadproże tylnego luku (otwarte na wysokość 2 bloków y=9..10, belka na y=11)
    for tx in (x0 + 2, x0 + 3):
        sb.set(tx, floor_y + 3, z_rows[3], "minecraft:stripped_spruce_log", {"axis": "x"})

    # Frontowe nadproże parteru (y = floor_y + 3 = 11) + przytulna latarnia wejściowa
    for tx in range(x0 + 1, x1):
        sb.set(tx, floor_y + 3, z_front, "minecraft:stripped_spruce_log", {"axis": "x"})
    # Boczne beczki / detale rzemieślnicze w narożnikach tylnych wewnątrz (nie blokują 2x2 środka!)
    sb.set(x0 + 1, floor_y + 1, z_rows[2], "minecraft:barrel", {"facing": "up", "open": "false"})
    sb.set(x1 - 1, floor_y + 1, z_rows[2], "minecraft:barrel", {"facing": "up", "open": "false"})

    # 3. Pasiasta markiza handlowa wysunięta nad chodnik (y = floor_y + 4 = 12) + latarnia pod markizą
    for i, tx in enumerate(range(x0, x1 + 1)):
        stripe = primary_wool if i % 2 == 0 else "minecraft:white_wool"
        sb.set(tx, floor_y + 4, z_front, stripe)
        sb.set(tx, floor_y + 4, awning_z, stripe)
    # Ciepłe latarnie zwisające z końców markizy (na wysokości y=11, 3 bloki nad ziemią — nie blokują graczy/NPC!)
    sb.set(x0 + 1, floor_y + 3, awning_z, "minecraft:lantern", {"hanging": "true", "waterlogged": "false"})
    sb.set(x1 - 1, floor_y + 3, awning_z, "minecraft:lantern", {"hanging": "true", "waterlogged": "false"})

    # Strop między parterem a piętrem (y = floor_y + 4 = 12) + ciepłe wpuszczone światło sufitowe
    sb.fill(x0, floor_y + 4, z_min, x1, floor_y + 4, z_max, "minecraft:spruce_planks")
    # Przywróć pasiastą krawędź na froncie
    for i, tx in enumerate(range(x0, x1 + 1)):
        sb.set(tx, floor_y + 4, z_front, primary_wool if i % 2 == 0 else "minecraft:white_wool")
    sb.set(x0 + 2, floor_y + 4, z_rows[1], "minecraft:ochre_froglight", {"axis": "y"})
    sb.set(x0 + 3, floor_y + 4, z_rows[1], "minecraft:ochre_froglight", {"axis": "y"})

    # 4. Drugie piętro — szachulcowa fasada butiku z podświetlonym oknem (y = floor_y + 5..6 = 13..14)
    for y in (floor_y + 5, floor_y + 6):
        sb.set(x0, y, z_front, "minecraft:stripped_spruce_log", {"axis": "y"})
        sb.set(x1, y, z_front, "minecraft:stripped_spruce_log", {"axis": "y"})
        sb.set(x0, y, z_rows[3], "minecraft:stripped_spruce_log", {"axis": "y"})
        sb.set(x1, y, z_rows[3], "minecraft:stripped_spruce_log", {"axis": "y"})
        for cz in (z_rows[1], z_rows[2]):
            sb.set(x0, y, cz, wall_block)
            sb.set(x1, y, cz, wall_block)
        for tx in range(x0 + 1, x1):
            sb.set(tx, y, z_rows[3], wall_block)

    # Fasada piętra z przeszkloną witryną i ciepłym podświetleniem wnętrza
    sb.set(x0 + 1, floor_y + 5, z_front, wall_block)
    sb.set(x1 - 1, floor_y + 5, z_front, wall_block)
    sb.set(x0 + 2, floor_y + 5, z_front, "create:horizontal_framed_glass")
    sb.set(x0 + 3, floor_y + 5, z_front, "create:horizontal_framed_glass")
    sb.set(x0 + 2, floor_y + 5, z_rows[1], "minecraft:ochre_froglight", {"axis": "y"})
    sb.set(x0 + 3, floor_y + 5, z_rows[1], "minecraft:ochre_froglight", {"axis": "y"})

    for tx in range(x0 + 1, x1):
        sb.set(tx, floor_y + 6, z_front, "minecraft:stripped_spruce_log", {"axis": "x"})

    # Polski szyld handlowy nad markizą (y = floor_y + 5 = 13, na froncie awning_z)
    # Umieszczony na belce frontowej (z_front + kierunek) jako `oak_wall_sign` przylegający do z_front
    sb.set(
        x0 + 2,
        floor_y + 5,
        awning_z,
        "minecraft:oak_wall_sign",
        {"facing": front_face, "waterlogged": "false"},
        make_sign_nbt(sign_lines, color=sign_color, glowing=True),
    )
    # Dekoracyjna doniczka z kwiatem po drugiej stronie szyldu na markizie
    sb.set(x0 + 3, floor_y + 5, awning_z, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})

    # 5. Dwuspadowy dach (y = floor_y + 7..8 = 15..16) z miedzianych / łupkowych dachówek
    for tx in range(x0, x1 + 1):
        # Dolny rząd okapu (z_front oraz z_rows[3])
        sb.set(tx, floor_y + 7, z_front, roof_stairs, {"facing": back_face, "half": "bottom", "shape": "straight"})
        sb.set(tx, floor_y + 7, z_rows[3], roof_stairs, {"facing": front_face, "half": "bottom", "shape": "straight"})
        # Górny rząd pochyły (z_rows[1], z_rows[2])
        sb.set(tx, floor_y + 8, z_rows[1], roof_stairs, {"facing": back_face, "half": "bottom", "shape": "straight"})
        sb.set(tx, floor_y + 8, z_rows[2], roof_stairs, {"facing": front_face, "half": "bottom", "shape": "straight"})
    # Szczytowe wypełnienie ścian bocznych pod kalenicą
    for cz in (z_rows[1], z_rows[2]):
        sb.set(x0, floor_y + 7, cz, wall_block)
        sb.set(x1, floor_y + 7, cz, wall_block)
    # Ozdobne mosiężne zwieńczenia kalenicy na końcach dachu
    sb.set(x0, floor_y + 9, z_rows[1], roof_slab, {"type": "bottom"})
    sb.set(x0, floor_y + 9, z_rows[2], roof_slab, {"type": "bottom"})
    sb.set(x1, floor_y + 9, z_rows[1], roof_slab, {"type": "bottom"})
    sb.set(x1, floor_y + 9, z_rows[2], roof_slab, {"type": "bottom"})


def build_market_island() -> StructureBuilder:
    sx, sy, sz = 45, 25, 35
    floor_y = 8
    cx, cz = 22, 17
    sb = StructureBuilder(sx, sy, sz)

    # -----------------------------------------------------------------------
    # 1. Rzeźbiony, wielowarstwowy latający klif (y = 0..7) + kratownice Create
    # -----------------------------------------------------------------------
    for y in range(0, floor_y):
        # Krzywa zwężania w dół: przy y=7 pełna podstawa, przy y=0 ostry kil skalny
        t = (y + 0.5) / floor_y  # 0.06 .. 0.94
        rx = 4.5 + 18.8 * (t ** 0.72)
        rz = 3.5 + 14.3 * (t ** 0.72)
        for x in range(sx):
            for z in range(sz):
                nx = (x - cx) / rx
                nz = (z - cz) / rz
                # Zaokrąglony prostokąt (superelipsa p=2.6) + deterministyczne żebra skalne
                r_super = (abs(nx) ** 2.6 + abs(nz) ** 2.6) ** (1.0 / 2.6)
                n_val = _deterministic_noise(x, z, seed=17) * (0.14 * (1.0 - t * 0.6))
                if y == floor_y - 1:
                    # Pełna mocna płyta nośna pod całym placem 45x35
                    in_rock = True
                else:
                    in_rock = (r_super + n_val) <= 1.02

                if in_rock:
                    if y == floor_y - 1:
                        # Gzyms okalający krawędź placu z łupkowych cegieł + kamienny rdzeń
                        if x in (0, sx - 1) or z in (0, sz - 1):
                            sb.set(x, y, z, "minecraft:deepslate_bricks")
                        else:
                            sb.set(x, y, z, "minecraft:stone")
                    elif y >= 5:
                        if (x + z * 3) % 7 == 0:
                            sb.set(x, y, z, "minecraft:andesite")
                        elif (x * 5 + z) % 9 == 0:
                            sb.set(x, y, z, "minecraft:tuff")
                        else:
                            sb.set(x, y, z, "minecraft:stone")
                    elif y >= 3:
                        if (x + z) % 4 == 0:
                            sb.set(x, y, z, "minecraft:cobbled_deepslate")
                        elif (x * 3 + z) % 5 == 0:
                            sb.set(x, y, z, "minecraft:tuff")
                        else:
                            sb.set(x, y, z, "minecraft:cobblestone")
                    else:
                        sb.set(
                            x,
                            y,
                            z,
                            "minecraft:deepslate_bricks" if (x + z) % 2 == 0 else "minecraft:cobbled_deepslate",
                        )

    # Steampunkowe wsporniki kratownicowe pod krawędziami stacji i balkonu wschodniego
    for z in (11, 14, 20, 23):
        sb.set(1, 6, z, "create:industrial_iron_block")
        sb.set(2, 5, z, "create:metal_girder", {"bottom": "false", "top": "false", "x": "true", "z": "false"})
        sb.set(3, 5, z, "create:industrial_iron_block")
        sb.set(1, 5, z, "minecraft:lantern", {"hanging": "true", "waterlogged": "false"})
    for z in (13, 17, 21):
        sb.set(43, 6, z, "create:industrial_iron_block")
        sb.set(42, 5, z, "create:metal_girder", {"bottom": "false", "top": "false", "x": "true", "z": "false"})
        sb.set(43, 5, z, "minecraft:lantern", {"hanging": "true", "waterlogged": "false"})

    # -----------------------------------------------------------------------
    # 2. 100% PŁASKI, MOZAIKOWY PLAC NA y = 8 (świat Y = 64)
    #    ZERO schodów/półpłytek na y = 8..9 -> bezbłędny pathfinding `Shoppers`!
    # -----------------------------------------------------------------------
    # Bazowa jasna kostka wapienna Create
    for x in range(sx):
        for z in range(sz):
            if (x + z) % 2 == 0:
                sb.set(x, floor_y, z, "create:cut_limestone_bricks")
            else:
                sb.set(x, floor_y, z, "create:small_limestone_bricks")

    # Ciemna rama obwodowa placu
    for x in range(sx):
        sb.set(x, floor_y, 0, "minecraft:polished_deepslate")
        sb.set(x, floor_y, sz - 1, "minecraft:polished_deepslate")
    for z in range(sz):
        sb.set(0, floor_y, z, "minecraft:polished_deepslate")
        sb.set(sx - 1, floor_y, z, "minecraft:polished_deepslate")

    # Tylne aleje logistyczne Create (3 bloki szerokości za oboma rzędami butików!)
    # Północ: z=1..4, Południe: z=30..33 (x=6..37)
    sb.fill(6, floor_y, 1, 37, floor_y, 4, "minecraft:polished_deepslate")
    sb.fill(6, floor_y, 30, 37, floor_y, 33, "minecraft:polished_deepslate")
    for x in range(8, 37, 2):
        sb.set(x, floor_y, 2, "create:industrial_iron_block")
        sb.set(x, floor_y, 32, "create:industrial_iron_block")

    # Wielka Aleja Triumfalna Wschód-Zachód (z = 14..20, x = 8..43)
    sb.fill(8, floor_y, 14, 43, floor_y, 20, "create:polished_cut_limestone")
    for x in range(8, 44):
        sb.set(x, floor_y, 14, "minecraft:polished_deepslate")
        sb.set(x, floor_y, 20, "minecraft:polished_deepslate")
        # Złoto-ochrowy dywan królewski w osi placu (z = 17)
        sb.set(x, floor_y, 17, "create:cut_ochrum_bricks" if x % 2 == 0 else "create:brass_casing")
        sb.set(x, floor_y, 16, "create:cut_limestone_bricks")
        sb.set(x, floor_y, 18, "create:cut_limestone_bricks")

    # Poprzeczna Aleja Północ-Południe przechodząca przez Rotundę (x = 20..24, z = 9..25)
    sb.fill(20, floor_y, 9, 24, floor_y, 25, "create:polished_cut_limestone")
    for z in range(9, 26):
        sb.set(22, floor_y, z, "create:cut_ochrum_bricks" if z % 2 == 0 else "create:brass_casing")

    # Wpuszczone medaliony świetlne `ochre_froglight` / `copper_bulb` (anty-spawn >= 12 na całej wyspie!)
    for lx in range(3, sx - 2, 5):
        for lz in range(3, sz - 2, 5):
            # Nie nadpisuj osi torowiska stacji (x<=8, z=15..19) ani centralnego terminala
            if lx <= 8 and 14 <= lz <= 20:
                continue
            if (lx, lz) == (cx, cz):
                continue
            sb.set(lx, floor_y, lz, "minecraft:ochre_froglight", {"axis": "y"})
    # Dodatkowe wpuszczone światła w tylnych alejach serwisowych
    for lx in range(8, 37, 6):
        sb.set(lx, floor_y, 3, "minecraft:copper_bulb", {"lit": "true", "powered": "false"})
        sb.set(lx, floor_y, 31, "minecraft:copper_bulb", {"lit": "true", "powered": "false"})

    # -----------------------------------------------------------------------
    # 3. Monumentalna Zachodnia Hala Stacji Kolejowej (x = 0..8, z = 11..23)
    #    Otwarty przejazd o szerokości 9 bloków (z=13..21) i wysokości 7 (y=9..15)!
    # -----------------------------------------------------------------------
    # Perony stacji i wpuszczone torowisko z podkładami pod `create:track` na Y=65
    sb.fill(0, floor_y, 11, 8, floor_y, 23, "minecraft:smooth_stone")
    sb.fill(0, floor_y, 15, 8, floor_y, 19, "minecraft:polished_deepslate")
    for x in range(0, 9):
        # Podkłady kolejowe w osi Z=17 (świat Z=0, dokładnie naprzeciwko Pirsu Startowej!)
        sb.set(x, floor_y, 16, "minecraft:stripped_spruce_log", {"axis": "z"} if x % 2 == 0 else {"axis": "x"})
        sb.set(x, floor_y, 17, "create:railway_casing" if x % 2 == 0 else "minecraft:polished_deepslate")
        sb.set(x, floor_y, 18, "minecraft:stripped_spruce_log", {"axis": "z"} if x % 2 == 0 else {"axis": "x"})
    # Złote krawędzie bezpieczeństwa peronów
    for x in range(0, 9):
        sb.set(x, floor_y, 14, "create:cut_ochrum_bricks")
        sb.set(x, floor_y, 20, "create:cut_ochrum_bricks")
    for x in (2, 6):
        sb.set(x, floor_y, 12, "minecraft:copper_bulb", {"lit": "true", "powered": "false"})
        sb.set(x, floor_y, 22, "minecraft:copper_bulb", {"lit": "true", "powered": "false"})

    # Filary nośne hali dworca (x = 1, 5, 8 na z = 11 oraz z = 23)
    for px in (1, 5, 8):
        for pz in (11, 23):
            sb.set(px, floor_y + 1, pz, "create:railway_casing")
            sb.set(px, floor_y + 2, pz, "create:industrial_iron_block")
            for y in range(floor_y + 3, floor_y + 7):
                sb.set(px, y, pz, "create:cut_limestone_bricks")
            sb.set(px, floor_y + 7, pz, "create:brass_casing")
            # Półokrągłe wsporniki łuku pod dachem (w stronę wnętrza hali)
            in_z = pz + (1 if pz == 11 else -1)
            sb.set(px, floor_y + 7, in_z, "create:industrial_iron_block")

    # Przeszklone boczne arkady dworca na piętrze (y = floor_y + 4..6 = 12..14)
    for x in (2, 3, 4, 6, 7):
        for pz in (11, 23):
            sb.set(x, floor_y + 5, pz, "create:framed_glass")
            sb.set(x, floor_y + 6, pz, "create:horizontal_framed_glass")
            sb.set(x, floor_y + 7, pz, "create:industrial_iron_block")

    # Sklepienie kolebkowe dworca (szkło + żebra żelazne + patynowana miedź, y = 16..20)
    # Profil łuku po Z (z = 11..23): rośnie ku osi z = 17
    arch_profile = [
        (11, 16), (12, 17), (13, 18), (14, 19), (15, 19), (16, 20), (17, 20),
        (18, 20), (19, 19), (20, 19), (21, 18), (22, 17), (23, 16),
    ]
    for x in range(1, 9):
        is_rib = x in (1, 5, 8)
        for az, ay in arch_profile:
            if is_rib:
                blk = "create:brass_casing" if az == 17 else "create:industrial_iron_block"
                sb.set(x, ay, az, blk)
            else:
                if 14 <= az <= 20:
                    sb.set(x, ay, az, "create:tiled_glass")
                else:
                    sb.set(x, ay, az, "create:weathered_copper_shingles" if x % 2 == 0 else "create:exposed_copper_shingles")
        # Dolne okapy miedziane po bokach hali
        sb.set(x, 16, 10, "create:weathered_copper_shingle_stairs", {"facing": "south", "half": "bottom", "shape": "straight"})
        sb.set(x, 16, 24, "create:weathered_copper_shingle_stairs", {"facing": "north", "half": "bottom", "shape": "straight"})

    # Ozdobny fronton dworca od strony Wyspy Startowej (x=1) i od strony placu (x=8) + wiszące latarnie
    for fx, sign_face in [(1, "west"), (8, "east")]:
        sb.set(fx, 19, 17, "create:brass_block")
        sb.set(fx, 21, 17, "minecraft:lightning_rod", {"facing": "up", "powered": "false", "waterlogged": "false"})
        # Szyld dworca
        sx_sign = fx - 1 if sign_face == "west" else fx + 1
        sb.set(
            sx_sign,
            19,
            17,
            "minecraft:oak_wall_sign",
            {"facing": sign_face, "waterlogged": "false"},
            make_sign_nbt(("★ DWORZEC ★", "HALUCYNACJE", "WIELKI RYNEK", "TOR Y=65"), color="yellow", glowing=True),
        )
    # Żyrandole łańcuchowe w hali dworca (y=17..19 -> 9 bloków nad torem, zero kolizji z pociągiem!)
    for lx in (3, 6):
        sb.set(lx, 19, 17, "minecraft:chain", {"axis": "y", "waterlogged": "false"})
        sb.set(lx, 18, 17, "minecraft:chain", {"axis": "y", "waterlogged": "false"})
        sb.set(lx, 17, 17, "minecraft:lantern", {"hanging": "true", "waterlogged": "false"})

    # Strefy towarzyszące przy Dworcu: Hypertube (Północ) + Waystone (Południe)
    # Północ: x=5..8, z=7..9 (Terminal Create: Hypertubes)
    sb.fill(5, floor_y, 7, 8, floor_y, 9, "create:copper_casing")
    sb.set(6, floor_y, 8, "create:brass_block")
    sb.set(7, floor_y, 8, "create:brass_block")
    sb.set(5, floor_y + 1, 7, "create:copper_casing")
    sb.set(5, floor_y + 2, 7, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})
    sb.set(
        6,
        floor_y + 1,
        7,
        "minecraft:oak_wall_sign",
        {"facing": "east", "waterlogged": "false"},
        make_sign_nbt(("STACJA", "HYPERTUBES", "Szybki powrót", "na Startową"), color="orange", glowing=True),
    )

    # Południe: x=5..8, z=25..27 (Pad pod Waystone)
    sb.fill(5, floor_y, 25, 8, floor_y, 27, "create:cut_limestone_bricks")
    sb.set(6, floor_y, 26, "minecraft:chiseled_tuff_bricks")
    sb.set(7, floor_y, 26, "minecraft:chiseled_tuff_bricks")
    sb.set(5, floor_y + 1, 27, "create:cut_limestone_bricks")
    sb.set(5, floor_y + 2, 27, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})
    sb.set(
        6,
        floor_y + 1,
        27,
        "minecraft:oak_wall_sign",
        {"facing": "east", "waterlogged": "false"},
        make_sign_nbt(("SANKTUARIUM", "WAYSTONE", "Postaw tutaj", "swój Waystone"), color="light_blue", glowing=True),
    )

    # -----------------------------------------------------------------------
    # 4. 8 Dwukondygnacyjnych Tematycznych Butików + Tylna Estakada Logistyczna
    # -----------------------------------------------------------------------
    north_boutiques = [
        (
            10,
            "minecraft:orange_wool",
            "minecraft:bricks",
            "minecraft:white_terracotta",
            "minecraft:oak_planks",
            "create:copper_shingle_stairs",
            "create:copper_shingle_slab",
            ("1. PIEKARNIA", "& ŚNIADANIA", "Tier 1 | NPC +20%", "Sklep LC tutaj"),
            "orange",
        ),
        (
            17,
            "minecraft:green_wool",
            "minecraft:stripped_oak_log",
            "create:cut_limestone_bricks",
            "minecraft:spruce_planks",
            "create:exposed_copper_shingle_stairs",
            "create:exposed_copper_shingle_slab",
            ("2. BISTRO", "FARMER'S DELIGHT", "Tier 2 | NPC +20%", "Dania obiadowe"),
            "lime",
        ),
        (
            24,
            "minecraft:pink_wool",
            "create:brass_casing",
            "minecraft:white_terracotta",
            "minecraft:dark_oak_planks",
            "create:copper_shingle_stairs",
            "create:copper_shingle_slab",
            ("3. CUKIERNIA", "& CZEKOLADA", "Tier 3 | NPC +20%", "Słodycze Create"),
            "pink",
        ),
        (
            31,
            "minecraft:yellow_wool",
            "create:andesite_casing",
            "create:cut_limestone_bricks",
            "minecraft:polished_andesite",
            "create:weathered_copper_shingle_stairs",
            "create:weathered_copper_shingle_slab",
            ("4. MECHANIKA", "CREATE 6.0", "Tier 4 | NPC +20%", "Mechanizmy & Koła"),
            "yellow",
        ),
    ]

    south_boutiques = [
        (
            10,
            "minecraft:red_wool",
            "create:railway_casing",
            "minecraft:bricks",
            "minecraft:polished_deepslate",
            "minecraft:deepslate_tile_stairs",
            "minecraft:deepslate_tile_slab",
            ("5. SKŁAD KOLEI", "& BIOPALIWA", "Tier 4 | NPC +20%", "Tory & Paliwa"),
            "red",
        ),
        (
            17,
            "minecraft:cyan_wool",
            "create:cut_asurine_bricks",
            "create:polished_cut_limestone",
            "minecraft:polished_deepslate",
            "create:weathered_copper_shingle_stairs",
            "create:weathered_copper_shingle_slab",
            ("6. ELEKTRONIKA", "APPLIED ENERG. 2", "Tier 5 | NPC +20%", "Procesory & Ogniwa"),
            "cyan",
        ),
        (
            24,
            "minecraft:blue_wool",
            "create:industrial_iron_block",
            "create:cut_limestone_bricks",
            "minecraft:polished_deepslate",
            "minecraft:deepslate_tile_stairs",
            "minecraft:deepslate_tile_slab",
            ("7. PRZEMYSŁ", "MEKANISM", "Tier 5 | NPC +20%", "Obwody & Stopy"),
            "light_blue",
        ),
        (
            31,
            "minecraft:purple_wool",
            "create:brass_block",
            "create:polished_cut_limestone",
            "minecraft:dark_oak_planks",
            "create:copper_shingle_stairs",
            "create:copper_shingle_slab",
            ("8. BAZAR VIP", "KONTRAKTY +35%", "Wpisz /kontrakt", "Eksport Premium"),
            "magenta",
        ),
    ]

    for x0, wool, accent, wall, flr, r_st, r_sl, slines, scol in north_boutiques:
        _build_boutique(sb, x0, 8, True, wool, accent, wall, flr, r_st, r_sl, slines, scol, floor_y)

    for x0, wool, accent, wall, flr, r_st, r_sl, slines, scol in south_boutiques:
        _build_boutique(sb, x0, 26, False, wool, accent, wall, flr, r_st, r_sl, slines, scol, floor_y)

    # Dekoracyjna sztaba monet w narożniku sklepu #8 (Bazar VIP)
    # -----------------------------------------------------------------------
    # 4b. Tematyczne dekoracje wnętrz wszystkich 8 butików (w narożnikach —
    #     środkowy front 2x2 pozostaje w 100% wolny na sklepy Lightman's Currency!)
    # -----------------------------------------------------------------------
    # #1 Piekarnia (x=10..15, z=5..8): rozpalony smoker, snopek siana, mak w doniczce
    sb.set(11, floor_y + 1, 6, "minecraft:smoker", {"facing": "south", "lit": "true"})
    sb.set(14, floor_y + 1, 6, "minecraft:hay_block", {"axis": "y"})
    sb.set(14, floor_y + 2, 6, "minecraft:potted_poppy")
    # #2 Bistro FD (x=17..22, z=5..8): stół rzemieślniczy, beczka, paproć w doniczce
    sb.set(18, floor_y + 1, 6, "minecraft:crafting_table")
    sb.set(21, floor_y + 1, 6, "minecraft:barrel", {"facing": "up", "open": "false"})
    sb.set(21, floor_y + 2, 6, "minecraft:potted_fern")
    # #3 Cukiernia (x=24..29, z=5..8): plaster miodu, beczka, różowy tulipan
    sb.set(25, floor_y + 1, 6, "minecraft:honeycomb_block")
    sb.set(28, floor_y + 1, 6, "minecraft:barrel", {"facing": "up", "open": "false"})
    sb.set(28, floor_y + 2, 6, "minecraft:potted_pink_tulip")
    # #4 Mechanika Create (x=31..36, z=5..8): stół kowalski, obudowa andezytowa, latarnia
    sb.set(32, floor_y + 1, 6, "minecraft:smithing_table")
    sb.set(35, floor_y + 1, 6, "create:andesite_casing")
    sb.set(35, floor_y + 2, 6, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})
    # #5 Skład Kolei & Paliwa (x=10..15, z=26..29): rozpalony piec hutniczy, blok węgla, skrzynia kolejowa
    sb.set(11, floor_y + 1, 28, "minecraft:blast_furnace", {"facing": "north", "lit": "true"})
    sb.set(14, floor_y + 1, 28, "minecraft:coal_block")
    sb.set(14, floor_y + 2, 28, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})
    # #6 Elektronika AE2 (x=17..22, z=26..29): serwer z azurytu, latarnia morska, szklana gablotka
    sb.set(18, floor_y + 1, 28, "create:cut_asurine_bricks")
    sb.set(18, floor_y + 2, 28, "minecraft:sea_lantern")
    sb.set(21, floor_y + 1, 28, "create:framed_glass")
    # #7 Przemysł Mekanism (x=24..29, z=26..29): obudowa miedziana, kowadło, przemysłowe żelazo
    sb.set(25, floor_y + 1, 28, "create:copper_casing")
    sb.set(25, floor_y + 2, 28, "minecraft:copper_bulb", {"lit": "true", "powered": "false"})
    sb.set(28, floor_y + 1, 28, "minecraft:anvil", {"facing": "north"})
    # #8 Bazar VIP Kontrakty +35% (x=31..36, z=26..29): sztaba monet, stos monet, szmaragd, pulpit
    sb.set(32, floor_y + 1, 28, "lightmanscurrency:coinblock_gold")
    sb.set(32, floor_y + 2, 28, "lightmanscurrency:coinpile_gold", {"facing": "north", "waterlogged": "false"})
    sb.set(35, floor_y + 1, 28, "minecraft:emerald_block")
    sb.set(35, floor_y + 2, 28, "minecraft:potted_orange_tulip")

    # Ładunki bagażowe i donice na peronach Zachodniego Dworca (poza torem z=15..19!)
    sb.set(2, floor_y + 1, 12, "minecraft:barrel", {"facing": "up", "open": "false"})
    sb.set(3, floor_y + 1, 12, "create:copper_casing")
    sb.set(2, floor_y + 2, 12, "minecraft:potted_oak_sapling")
    sb.set(2, floor_y + 1, 22, "minecraft:barrel", {"facing": "up", "open": "false"})
    sb.set(3, floor_y + 1, 22, "create:brass_casing")
    sb.set(3, floor_y + 2, 22, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})

    # Estakada logistyczna (napowietrzny pomost Create w tylnych alejach na y = 13, x = 8..36)
    # Pozwala graczom od razu wieszać Chain Conveyors, Frogporty i zsypy za wszystkimi 8 sklepami!
    for z_gantry in (3, 31):
        for x in range(8, 37):
            sb.set(x, floor_y + 5, z_gantry, "createdeco:brass_catwalk", {"bottom": "false"})
        for px in (8, 16, 23, 30, 36):
            for y in range(floor_y + 1, floor_y + 5):
                sb.set(px, y, z_gantry, "create:metal_girder", {"bottom": "false", "top": "false", "x": "false", "z": "false"})
            sb.set(px, floor_y + 6, z_gantry, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})

    # -----------------------------------------------------------------------
    # 5. Wielka Centralna Rotunda Giełdowa z Miedzianą Kopułą (x=19..25, z=14..20)
    #    W środku (22, 9, 17): PRAWDZIWY działający `lightmanscurrency:terminal`!
    # -----------------------------------------------------------------------
    # Ozdobna posadzka Rotundy na y = floor_y
    sb.fill(19, floor_y, 14, 25, floor_y, 20, "create:polished_cut_limestone")
    for dx in (-2, 2):
        for dz in (-2, 2):
            sb.set(cx + dx, floor_y, cz + dz, "minecraft:ochre_froglight", {"axis": "y"})
    sb.set(cx, floor_y, cz, "create:brass_block")

    # 4 monumentalne otwarte narożne kolumny (pełny swobodny ruch NPC dookoła!)
    for px, pz in [(19, 14), (25, 14), (19, 20), (25, 20)]:
        sb.set(px, floor_y + 1, pz, "create:brass_casing")
        for y in range(floor_y + 2, floor_y + 6):
            sb.set(px, y, pz, "create:cut_limestone_bricks")
        sb.set(px, floor_y + 6, pz, "create:brass_casing")
        # Ozdobne kinkiety latarniowe na kolumnach
        sb.set(px, floor_y + 5, pz + (1 if pz == 14 else -1), "minecraft:lantern", {"hanging": "true", "waterlogged": "false"})

    # 4 donice kwiatowe przy zewnętrznych narożnikach Rotundy
    for fx, fz, flower in [
        (18, 14, "minecraft:potted_dandelion"),
        (26, 14, "minecraft:potted_blue_orchid"),
        (18, 20, "minecraft:potted_orange_tulip"),
        (26, 20, "minecraft:potted_azalea_bush"),
    ]:
        sb.set(fx, floor_y + 1, fz, "create:cut_limestone_bricks")
        sb.set(fx, floor_y + 2, fz, flower)

    # PRAWDZIWY działający Terminal Handlowy Lightman's Currency w sercu Rotundy!
    sb.set(cx, floor_y + 1, cz, "lightmanscurrency:terminal", {"facing": "west"})
    # Złote stosiki monet obok terminala jako akcent wizualny (na poziomie y=floor_y+1, nie blokują podejścia)
    sb.set(cx + 1, floor_y + 1, cz, "lightmanscurrency:coinpile_gold", {"facing": "west", "waterlogged": "false"})

    # Górny pierścień i arkady Rotundy (y = 14..15)
    for x in range(19, 26):
        sb.set(x, 14, 14, "create:brass_casing" if x in (19, 22, 25) else "create:cut_limestone_bricks")
        sb.set(x, 14, 20, "create:brass_casing" if x in (19, 22, 25) else "create:cut_limestone_bricks")
    for z in range(15, 20):
        sb.set(19, 14, z, "create:brass_casing" if z == 17 else "create:cut_limestone_bricks")
        sb.set(25, 14, z, "create:brass_casing" if z == 17 else "create:cut_limestone_bricks")
    # Złoty szyld Giełdy nad wejściem zachodnim do Rotundy
    sb.set(
        18,
        14,
        17,
        "minecraft:oak_wall_sign",
        {"facing": "west", "waterlogged": "false"},
        make_sign_nbt(("★ GIEŁDA ★", "TERMINAL HANDLU", "Żetony Etapów", "& Skup Hurtowy"), color="yellow", glowing=True),
    )

    # Przeszklona latarnia dachowa / tambur kopuły (y = 15..17, 5x5 ścięte narożniki)
    for y in (15, 16, 17):
        for x in range(20, 25):
            for z in range(15, 20):
                on_edge = x in (20, 24) or z in (15, 19)
                is_corner = x in (20, 24) and z in (15, 19)
                if on_edge:
                    if is_corner:
                        sb.set(x, y, z, "create:brass_casing")
                    elif y == 17:
                        sb.set(x, y, z, "create:brass_casing")
                    else:
                        sb.set(x, y, z, "create:tiled_glass")
    # Wiszący żyrandol w sercu kopuły (świeci w nocy przez szkło!)
    sb.set(cx, 17, cz, "minecraft:chain", {"axis": "y", "waterlogged": "false"})
    sb.set(cx, 16, cz, "minecraft:ochre_froglight", {"axis": "y"})
    sb.set(cx, 15, cz, "minecraft:lantern", {"hanging": "true", "waterlogged": "false"})

    # Ozdobne miedziane okapy wokół podstawy kopuły (y = 15)
    for x in range(20, 25):
        sb.set(x, 15, 14, "create:weathered_copper_shingle_stairs", {"facing": "south", "half": "bottom", "shape": "straight"})
        sb.set(x, 15, 20, "create:weathered_copper_shingle_stairs", {"facing": "north", "half": "bottom", "shape": "straight"})
    for z in range(15, 20):
        sb.set(19, 15, z, "create:weathered_copper_shingle_stairs", {"facing": "east", "half": "bottom", "shape": "straight"})
        sb.set(25, 15, z, "create:weathered_copper_shingle_stairs", {"facing": "west", "half": "bottom", "shape": "straight"})

    # Wielowarstwowa patynowana miedziana kopuła (y = 18..21) + mosiężna iglica (y = 22..24)
    for x in range(20, 25):
        for z in range(15, 20):
            if (x in (20, 24)) and (z in (15, 19)):
                continue
            sb.set(x, 18, z, "create:weathered_copper_shingles")
    sb.fill(21, 19, 16, 23, 19, 18, "create:exposed_copper_shingles")
    sb.set(cx, 19, 15, "create:exposed_copper_shingle_stairs", {"facing": "south", "half": "bottom", "shape": "straight"})
    sb.set(cx, 19, 19, "create:exposed_copper_shingle_stairs", {"facing": "north", "half": "bottom", "shape": "straight"})
    sb.set(20, 19, cz, "create:exposed_copper_shingle_stairs", {"facing": "east", "half": "bottom", "shape": "straight"})
    sb.set(24, 19, cz, "create:exposed_copper_shingle_stairs", {"facing": "west", "half": "bottom", "shape": "straight"})
    for dx, dz in [(0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)]:
        sb.set(cx + dx, 20, cz + dz, "create:copper_shingles")
    sb.set(cx, 21, cz, "minecraft:copper_bulb", {"lit": "true", "powered": "false"})
    sb.set(cx, 22, cz, "create:brass_block")
    sb.set(cx, 23, cz, "create:brass_bars", {"east": "false", "north": "false", "south": "false", "west": "false"})
    sb.set(cx, 24, cz, "minecraft:lightning_rod", {"facing": "up", "powered": "false", "waterlogged": "false"})

    # 2 ozdobne arkady wiszące z latarniami nad głównym bulwarem (x = 16 i x = 29, z = 12..22)
    for lx in (16, 29):
        for lz in (12, 22):
            sb.set(lx, floor_y + 1, lz, "create:cut_limestone_bricks")
            sb.set(lx, floor_y + 2, lz, "create:brass_bars", {"east": "false", "north": "false", "south": "false", "west": "false"})
            sb.set(lx, floor_y + 3, lz, "create:brass_bars", {"east": "false", "north": "false", "south": "false", "west": "false"})
            sb.set(lx, floor_y + 4, lz, "create:brass_casing")
            sb.set(lx, floor_y + 5, lz, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})
        # Napowietrzny łuk z girlandą świetlną nad aleją (y = 13, 5 bloków nad ziemią)
        for gz in range(13, 22):
            if gz in (13, 21):
                sb.set(lx, floor_y + 5, gz, "create:brass_bars", {"east": "false", "north": "true", "south": "true", "west": "false"})
            elif gz in (15, 19):
                sb.set(lx, floor_y + 5, gz, "create:brass_casing")
                sb.set(lx, floor_y + 4, gz, "minecraft:lantern", {"hanging": "true", "waterlogged": "false"})
            else:
                sb.set(lx, floor_y + 5, gz, "create:metal_girder", {"bottom": "false", "top": "false", "x": "false", "z": "true"})

    # -----------------------------------------------------------------------
    # 6. 3 PRAWDZIWE działające Bankomaty `lightmanscurrency:atm` w kioskach
    #    Minimalny odstęp między bankomatami = 12.0 bloków (wymóg >= 6.0)!
    # -----------------------------------------------------------------------
    atm_kiosks = [
        (11, 11, "south"),  # ATM #1 (NW Bulwar)
        (34, 11, "south"),  # ATM #2 (NE Bulwar — 23 bloki od #1!)
        (34, 23, "north"),  # ATM #3 (SE Bulwar — 12 bloków od #2, 25.9 od #1!)
    ]
    for ax, az, face in atm_kiosks:
        sb.set(ax, floor_y, az, "minecraft:gold_block")
        for dx, dz in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            sb.set(ax + dx, floor_y, az + dz, "create:brass_casing")
        sb.set(ax, floor_y + 1, az, "lightmanscurrency:atm", {"bottom": "true", "facing": face})
        sb.set(ax, floor_y + 2, az, "lightmanscurrency:atm", {"bottom": "false", "facing": face})
        sb.set(ax, floor_y + 3, az, "minecraft:copper_bulb", {"lit": "true", "powered": "false"})
        sb.set(ax, floor_y + 4, az, "create:copper_shingle_slab", {"type": "bottom"})
        sz_sign = az + (1 if face == "south" else -1)
        sb.set(
            ax,
            floor_y + 3,
            sz_sign,
            "minecraft:oak_wall_sign",
            {"facing": face, "waterlogged": "false"},
            make_sign_nbt(("BANKOMAT", "★ ATM ★", "Konto Drużyny", "Lightman's"), color="yellow", glowing=True),
        )

    # -----------------------------------------------------------------------
    # 7. Wschodni Taras Ogrodowy, Fontanna i Balkon Widokowy (x = 37..44)
    # -----------------------------------------------------------------------
    for x in range(38, 43):
        for z in range(15, 20):
            on_rim = x in (38, 42) or z in (15, 19)
            if on_rim:
                sb.set(x, floor_y + 1, z, "create:cut_limestone_bricks")
                if (x in (38, 42)) and (z in (15, 19)):
                    sb.set(x, floor_y + 2, z, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})
            else:
                sb.set(x, floor_y, z, "minecraft:sea_lantern")
                sb.set(x, floor_y + 1, z, "minecraft:water", {"level": "0"})
    sb.set(40, floor_y + 1, 17, "create:brass_casing")
    sb.set(40, floor_y + 2, 17, "create:cut_limestone_brick_wall", {"east": "none", "north": "none", "south": "none", "up": "true", "west": "none"})
    sb.set(40, floor_y + 3, 17, "create:brass_block")
    sb.set(40, floor_y + 4, 17, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})

    # 2 bujne klomby botaniczne w narożnikach wschodnich z rozłożystymi drzewkami azaliowymi
    for z0, z1 in [(7, 10), (24, 27)]:
        for x in range(39, 43):
            for z in range(z0, z1 + 1):
                on_rim = x in (39, 42) or z in (z0, z1)
                if on_rim:
                    sb.set(x, floor_y + 1, z, "create:cut_limestone_bricks")
                else:
                    sb.set(x, floor_y, z, "minecraft:moss_block")
                    sb.set(x, floor_y + 1, z, "minecraft:moss_block")
                    leaf = "minecraft:flowering_azalea_leaves" if (x + z) % 2 == 0 else "minecraft:azalea_leaves"
                    sb.set(x, floor_y + 2, z, leaf, {"distance": "1", "persistent": "true", "waterlogged": "false"})
        mid_z = (z0 + z1) // 2
        sb.set(40, floor_y + 2, mid_z, "minecraft:oak_log", {"axis": "y"})
        sb.set(40, floor_y + 3, mid_z, "minecraft:oak_log", {"axis": "y"})
        for dx in (-1, 0, 1):
            for dz in (-1, 0, 1):
                if abs(dx) == 1 and abs(dz) == 1:
                    continue
                leaf = "minecraft:flowering_azalea_leaves" if (dx + dz) % 2 == 0 else "minecraft:azalea_leaves"
                sb.set(40 + dx, floor_y + 4, mid_z + dz, leaf, {"distance": "1", "persistent": "true", "waterlogged": "false"})
        sb.set(40, floor_y + 5, mid_z, "minecraft:flowering_azalea_leaves", {"distance": "1", "persistent": "true", "waterlogged": "false"})
        # Kwieciste doniczki na narożnikach murków klombów
        sb.set(39, floor_y + 2, z0, "minecraft:potted_poppy")
        sb.set(39, floor_y + 2, z1, "minecraft:potted_blue_orchid")

    # -----------------------------------------------------------------------
    # 8. Ozdobna balustrada obwodowa z latarniami (zero spadania NPC w pustkę!)
    #    Zachowuje pełny prześwit wjazdu stacji na x = 0, z = 12..22!
    # -----------------------------------------------------------------------
    for x in range(0, sx):
        for bz in (0, sz - 1):
            if x % 6 == 0 or x == sx - 1:
                sb.set(x, floor_y + 1, bz, "create:brass_casing")
                sb.set(x, floor_y + 2, bz, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})
            else:
                sb.set(x, floor_y + 1, bz, "create:cut_limestone_brick_wall", {"east": "low", "north": "none", "south": "none", "up": "false", "west": "low"})

    for z in range(1, sz - 1):
        if z % 5 == 0:
            sb.set(sx - 1, floor_y + 1, z, "create:brass_casing")
            sb.set(sx - 1, floor_y + 2, z, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})
        else:
            sb.set(sx - 1, floor_y + 1, z, "create:cut_limestone_brick_wall", {"east": "none", "north": "low", "south": "low", "up": "false", "west": "none"})
        if not (11 <= z <= 23):
            if z % 5 == 0:
                sb.set(0, floor_y + 1, z, "create:brass_casing")
                sb.set(0, floor_y + 2, z, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})
            else:
                sb.set(0, floor_y + 1, z, "create:cut_limestone_brick_wall", {"east": "none", "north": "low", "south": "low", "up": "false", "west": "none"})

    return sb


# ---------------------------------------------------------------------------
# 3. Huta Południowa & Terminal Towarowy: industrial_island.nbt (33 x 21 x 33)
#    Środek płyty: (16, 6, 16) -> świat (0, 64, 152) przy offset [0, 4, 152], origin "center"
#    Architektura ciężkiego przemysłu Create + AE2 + Mekanism:
#      - Rzeźbiony kadłub bazaltowo-łupkowy (y=0..5) ze stalowymi kratownicami i żarem pieców
#      - 4 wielkie otwarte zatoki budowlane (11x11 każda) na idealnie płaskiej płycie Y=64
#      - Północny Terminal Towarowy z ogromną suwnicą bramową (`create:metal_girder` + `createdeco:industrial_iron_catwalk`)
#      - Ceglano-żelazny komin przemysłowy z dymem (`campfire` signal_fire=true) oraz
#        przeszklona Dyspozytornia z działającym `lightmanscurrency:terminal`
# ---------------------------------------------------------------------------

def build_industrial_island() -> StructureBuilder:
    sx, sy, sz = 33, 21, 33
    floor_y = 6
    cx, cz = 16, 16
    sb = StructureBuilder(sx, sy, sz)

    # 1. Rzeźbiony bazaltowo-łupkowy kadłub pod płytą (y = 0..5)
    for y in range(0, floor_y):
        t = (y + 0.5) / floor_y
        rx = 3.5 + 13.8 * (t ** 0.72)
        rz = 3.5 + 13.8 * (t ** 0.72)
        for x in range(sx):
            for z in range(sz):
                if y == floor_y - 1:
                    in_rock = True
                else:
                    nx = (x - cx) / rx
                    nz = (z - cz) / rz
                    r_super = (abs(nx) ** 2.8 + abs(nz) ** 2.8) ** (1.0 / 2.8)
                    n_val = _deterministic_noise(x, z, seed=42) * (0.12 * (1.0 - t * 0.5))
                    in_rock = (r_super + n_val) <= 1.02

                if in_rock:
                    if y == floor_y - 1:
                        if x in (0, sx - 1) or z in (0, sz - 1):
                            sb.set(x, y, z, "create:industrial_iron_block")
                        else:
                            sb.set(x, y, z, "minecraft:deepslate_bricks")
                    elif y >= 3:
                        sb.set(
                            x,
                            y,
                            z,
                            "minecraft:deepslate" if (x + z) % 3 != 0 else "minecraft:cobbled_deepslate",
                            {"axis": "y"} if (x + z) % 3 != 0 else None,
                        )
                    else:
                        if (x + z) % 7 == 0 and y == 1:
                            sb.set(x, y, z, "minecraft:magma_block")
                        else:
                            sb.set(x, y, z, "minecraft:deepslate_tiles")

    # Stalowe wsporniki pod północnym dokiem kolejowym
    for x in (11, 14, 18, 21):
        sb.set(x, 4, 1, "create:industrial_iron_block")
        sb.set(x, 3, 2, "create:metal_girder", {"bottom": "false", "top": "false", "x": "false", "z": "true"})
        sb.set(x, 3, 1, "minecraft:lantern", {"hanging": "true", "waterlogged": "false"})

    # 2. Płaska, modułowa płyta fabryczna 33x33 na y = 6 (świat Y = 64!)
    sb.fill(0, floor_y, 0, sx - 1, floor_y, sz - 1, "minecraft:deepslate_bricks")

    # 4 wyraźnie obramowane zatoki fabryczne (NW, NE, SW, SE — czyste płaskie pola pod maszyny!)
    for bx0, bx1 in [(2, 12), (20, 30)]:
        for bz0, bz1 in [(2, 12), (20, 30)]:
            # Pomiń NE narożnik dyspozytorni i komina (x=24..30, z=2..9) — dostanie własną podłogę
            sb.fill(bx0, floor_y, bz0, bx1, floor_y, bz1, "minecraft:polished_deepslate")
            for x in range(bx0, bx1 + 1):
                sb.set(x, floor_y, bz0, "minecraft:deepslate_tiles")
                sb.set(x, floor_y, bz1, "minecraft:deepslate_tiles")
            for z in range(bz0, bz1 + 1):
                sb.set(bx0, floor_y, z, "minecraft:deepslate_tiles")
                sb.set(bx1, floor_y, z, "minecraft:deepslate_tiles")

    # Główny krzyż transportowy (x=14..18 oraz z=14..18) z ostrzegawczymi pasami żółto-czarnymi
    sb.fill(14, floor_y, 0, 18, floor_y, sz - 1, "minecraft:smooth_stone")
    sb.fill(0, floor_y, 14, sx - 1, floor_y, 18, "minecraft:smooth_stone")
    for i in range(1, sx - 1):
        haz = "minecraft:yellow_concrete" if i % 2 == 0 else "minecraft:black_concrete"
        if not (13 <= i <= 19):
            sb.set(i, floor_y, 13, haz)
            sb.set(i, floor_y, 19, haz)
            sb.set(13, floor_y, i, haz)
            sb.set(19, floor_y, i, haz)

    # Centralna płyta rozdzielcza (14..18, 14..18)
    sb.fill(15, floor_y, 15, 17, floor_y, 17, "create:industrial_iron_block")
    sb.set(cx, floor_y, cz, "create:brass_block")

    # Północny Dok Kolejowy — wpuszczone podkłady kolejowe w osi X=16 (świat X=0!)
    for z in range(0, 11):
        sb.set(15, floor_y, z, "minecraft:stripped_spruce_log", {"axis": "x"} if z % 2 == 0 else {"axis": "z"})
        sb.set(16, floor_y, z, "create:railway_casing" if z % 2 == 0 else "minecraft:polished_deepslate")
        sb.set(17, floor_y, z, "minecraft:stripped_spruce_log", {"axis": "x"} if z % 2 == 0 else {"axis": "z"})

    # Gęsta siatka wpuszczonych świateł `sea_lantern` / `copper_bulb` (zero mobów!)
    for x in (4, 10, 16, 22, 28):
        for z in (4, 10, 16, 22, 28):
            if (x, z) == (cx, cz) or (x == 16 and z <= 10):
                continue
            sb.set(x, floor_y, z, "minecraft:sea_lantern")

    # 3. Monumentalna Suwnica Bramowa nad Północnym Dokiem Towarowym (x=11..21, z=1..7, y=7..18)
    for gx in (11, 21):
        for gz in (1, 7):
            sb.set(gx, floor_y + 1, gz, "create:industrial_iron_block")
            for y in range(floor_y + 2, floor_y + 10):
                sb.set(gx, y, gz, "create:metal_girder", {"bottom": "false", "top": "false", "x": "false", "z": "false"})
            sb.set(gx, floor_y + 10, gz, "create:industrial_iron_block")
        # Stężenia wzdłużne między słupami suwnicy
        for gz in range(2, 7):
            sb.set(gx, floor_y + 9, gz, "create:metal_girder", {"bottom": "false", "top": "false", "x": "false", "z": "true"})
            sb.set(gx, floor_y + 10, gz, "create:industrial_iron_block")

    # Most suwnicy przerzucony nad torem (z = 3..5, y = floor_y + 10..11 = 16..17)
    for x in range(11, 22):
        sb.set(x, floor_y + 10, 3, "create:industrial_iron_block")
        sb.set(x, floor_y + 10, 4, "create:metal_girder", {"bottom": "false", "top": "false", "x": "true", "z": "false"})
        sb.set(x, floor_y + 10, 5, "create:industrial_iron_block")
        sb.set(x, floor_y + 11, 3, "createdeco:industrial_iron_catwalk", {"bottom": "false"})
        sb.set(x, floor_y + 11, 5, "createdeco:industrial_iron_catwalk", {"bottom": "false"})
        if x in (13, 19):
            sb.set(x, floor_y + 9, 4, "minecraft:copper_bulb", {"lit": "true", "powered": "false"})
    # Kabina wciągarki pośrodku suwnicy + wiszący łańcuch z hakiem ładunkowym (z=4, x=15..17)
    sb.fill(15, floor_y + 11, 3, 17, floor_y + 12, 5, "create:copper_casing")
    sb.set(16, floor_y + 12, 3, "create:framed_glass")
    sb.set(16, floor_y + 13, 4, "minecraft:copper_bulb", {"lit": "true", "powered": "false"})
    # Łańcuch i mosiężny hak wysoko nad torem (y=13..15 -> 7 bloków prześwitu nad torem!)
    sb.set(16, floor_y + 9, 4, "minecraft:chain", {"axis": "y", "waterlogged": "false"})
    sb.set(16, floor_y + 8, 4, "minecraft:chain", {"axis": "y", "waterlogged": "false"})
    sb.set(16, floor_y + 7, 4, "create:brass_block")

    # Szyld nad wjazdem kolejowym (z=1, x=16, wysoko na belce y=15)
    for x in range(12, 21):
        sb.set(x, floor_y + 9, 1, "create:industrial_iron_block")
    sb.set(
        16,
        floor_y + 9,
        0,
        "minecraft:oak_wall_sign",
        {"facing": "north", "waterlogged": "false"},
        make_sign_nbt(("★ HUTA POŁUDN. ★", "DOK TOWAROWY", "AE2 & MEKANISM", "TOR Y=65"), color="yellow", glowing=True),
    )

    # 4. Komin Przemysłowy z prawdziwym dymem + Przeszklona Dyspozytornia (NE: x=24..30, z=3..9)
    # Komin (x=28..30, z=3..5, rośnie od y=7 aż do y=20!)
    for y in range(floor_y + 1, 20):
        for x in range(28, 31):
            for z in range(3, 6):
                is_center = (x == 29 and z == 4)
                if is_center:
                    continue
                if y in (floor_y + 1, 11, 15, 19):
                    sb.set(x, y, z, "create:industrial_iron_block")
                else:
                    sb.set(x, y, z, "minecraft:bricks" if (x + z + y) % 3 != 0 else "minecraft:deepslate_bricks")
    # Palenisko dymne w szczycie komina (hay_block pod campfire -> wysoka kolumna dymu!)
    sb.set(29, 17, 4, "minecraft:hay_block", {"axis": "y"})
    sb.set(29, 18, 4, "minecraft:campfire", {"facing": "north", "lit": "true", "signal_fire": "true", "waterlogged": "false"})
    sb.set(29, 20, 3, "minecraft:copper_bulb", {"lit": "true", "powered": "false"})
    sb.set(29, 20, 5, "minecraft:copper_bulb", {"lit": "true", "powered": "false"})

    # Przeszklona Dyspozytornia (x=24..27, z=5..9, y=7..11) z działającym `lightmanscurrency:terminal`
    sb.fill(24, floor_y, 5, 27, floor_y, 9, "create:industrial_iron_block")
    for px in (24, 27):
        for pz in (5, 9):
            for y in range(floor_y + 1, floor_y + 5):
                sb.set(px, y, pz, "create:industrial_iron_block")
    for x in (25, 26):
        sb.set(x, floor_y + 1, 5, "minecraft:deepslate_bricks")
        sb.set(x, floor_y + 2, 5, "create:framed_glass")
        sb.set(x, floor_y + 3, 5, "create:framed_glass")
        sb.set(x, floor_y + 4, 5, "create:industrial_iron_block")
        sb.set(x, floor_y + 4, 9, "create:industrial_iron_block")
    for z in (6, 7, 8):
        sb.set(27, floor_y + 1, z, "minecraft:deepslate_bricks")
        sb.set(27, floor_y + 2, z, "create:framed_glass")
        sb.set(27, floor_y + 3, z, "create:framed_glass")
        sb.set(27, floor_y + 4, z, "create:industrial_iron_block")
        sb.set(24, floor_y + 4, z, "create:industrial_iron_block")
    # Dach dyspozytorni z płaskich płyt miedzi
    sb.fill(24, floor_y + 5, 5, 27, floor_y + 5, 9, "create:weathered_copper_shingle_slab", {"type": "bottom"})
    sb.set(25, floor_y + 4, 7, "minecraft:copper_bulb", {"lit": "true", "powered": "false"})
    # Wyposażenie wnętrza dyspozytorni: Terminal LC, stół rzemieślniczy, beczka, piec, stół kowalski, kaktus
    sb.set(26, floor_y + 1, 6, "lightmanscurrency:terminal", {"facing": "west"})
    sb.set(26, floor_y + 1, 7, "minecraft:crafting_table")
    sb.set(26, floor_y + 1, 8, "minecraft:barrel", {"facing": "up", "open": "false"})
    sb.set(25, floor_y + 1, 6, "minecraft:blast_furnace", {"facing": "south", "lit": "true"})
    sb.set(25, floor_y + 1, 8, "minecraft:smithing_table")
    sb.set(25, floor_y + 2, 8, "minecraft:potted_cactus")
    # Szyld Dyspozytorni od strony placu (z = 9, nad wejściem na belce y = floor_y + 4)
    sb.set(
        25,
        floor_y + 4,
        10,
        "minecraft:oak_wall_sign",
        {"facing": "south", "waterlogged": "false"},
        make_sign_nbt(("DYSPOZYTORNIA", "TERMINAL LC", "Strefa Huty", "Stage 2-5"), color="cyan", glowing=True),
    )

    # 4b. Zbiornik przemysłowy z miedzi i szkła obok Komina (x = 25..26, z = 2..3, y = 7..12)
    for tx in (25, 26):
        for tz in (2, 3):
            sb.set(tx, floor_y + 1, tz, "create:copper_casing")
            sb.set(tx, floor_y + 2, tz, "create:framed_glass")
            sb.set(tx, floor_y + 3, tz, "create:framed_glass")
            sb.set(tx, floor_y + 4, tz, "create:copper_casing")
            sb.set(tx, floor_y + 5, tz, "create:copper_shingle_slab", {"type": "bottom"})
    sb.set(25, floor_y + 5, 2, "minecraft:copper_bulb", {"lit": "true", "powered": "false"})

    # 4c. Plac kontenerowy / skrzynie towarowe przy Doku Północnym (x = 7..9, z = 2..5)
    sb.fill(7, floor_y + 1, 2, 9, floor_y + 1, 3, "create:copper_casing")
    sb.fill(7, floor_y + 2, 2, 8, floor_y + 2, 3, "create:brass_casing")
    sb.set(9, floor_y + 2, 2, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})
    sb.set(8, floor_y + 1, 5, "minecraft:barrel", {"facing": "up", "open": "false"})
    sb.set(9, floor_y + 1, 5, "create:railway_casing")
    sb.set(9, floor_y + 2, 5, "minecraft:barrel", {"facing": "up", "open": "false"})

    # 4d. 4 słupki ostrzegawcze na narożnikach skrzyżowania centralnego (poza 4 zatokami 11x11!)
    for sx_b, sz_b in [(13, 13), (19, 13), (13, 19), (19, 19)]:
        sb.set(sx_b, floor_y + 1, sz_b, "create:industrial_iron_block")
        sb.set(sx_b, floor_y + 2, sz_b, "minecraft:copper_bulb", {"lit": "true", "powered": "false"})

    # 5. Murki ochronne obwodowe + słupy oświetleniowe (otwarty Dok Północny x=13..19, z=0!)
    for x in range(0, sx):
        if x % 6 == 0 or x == sx - 1:
            sb.set(x, floor_y + 1, sz - 1, "create:industrial_iron_block")
            sb.set(x, floor_y + 2, sz - 1, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})
        else:
            sb.set(x, floor_y + 1, sz - 1, "minecraft:deepslate_brick_wall", {"up": "true", "waterlogged": "false"})

        if not (13 <= x <= 19):
            if x in (12, 20) or x % 6 == 0 or x == sx - 1:
                sb.set(x, floor_y + 1, 0, "create:industrial_iron_block")
                sb.set(x, floor_y + 2, 0, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})
            else:
                sb.set(x, floor_y + 1, 0, "minecraft:deepslate_brick_wall", {"up": "true", "waterlogged": "false"})

    for z in range(1, sz - 1):
        for bx in (0, sx - 1):
            if z % 6 == 0:
                sb.set(bx, floor_y + 1, z, "create:industrial_iron_block")
                sb.set(bx, floor_y + 2, z, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})
            else:
                sb.set(bx, floor_y + 1, z, "minecraft:deepslate_brick_wall", {"up": "true", "waterlogged": "false"})

    return sb


# ---------------------------------------------------------------------------
# Weryfikator round-trip binarnych plików `.nbt` + cross-check z templates.json5
# ---------------------------------------------------------------------------

def _index_blocks(
    root: NbtCompound,
    vanilla_only: bool = False,
) -> tuple[tuple[int, int, int], list[NbtCompound], dict[tuple[int, int, int], tuple[str, NbtCompound | None]]]:
    dv = root.entries["DataVersion"].value
    if dv != MC_1_21_1_DATA_VERSION:
        raise AssertionError(f"Expected DataVersion {MC_1_21_1_DATA_VERSION}, got {dv}")

    size_items = [x.value for x in root.entries["size"].items]
    if len(size_items) != 3:
        raise AssertionError(f"Invalid size tag: {size_items}")
    sx, sy, sz = size_items

    palette = root.entries["palette"].items
    if not palette:
        raise AssertionError("Palette is empty")

    for idx, p in enumerate(palette):
        name = p.entries["Name"].value
        if vanilla_only:
            if not name.startswith("minecraft:"):
                raise AssertionError(f"Non-vanilla block in palette[{idx}]: {name}")
        else:
            if not name.startswith(ALLOWED_NAMESPACES):
                raise AssertionError(f"Disallowed namespace in palette[{idx}]: {name}")
        if "Properties" in p.entries:
            for k, v in p.entries["Properties"].entries.items():
                if not isinstance(v, NbtString):
                    raise AssertionError(f"Non-string property {k} in palette[{idx}]")

    blocks_map: dict[tuple[int, int, int], tuple[str, NbtCompound | None]] = {}
    for blk in root.entries["blocks"].items:
        pos = tuple(c.value for c in blk.entries["pos"].items)
        state = blk.entries["state"].value
        if not (0 <= pos[0] < sx and 0 <= pos[1] < sy and 0 <= pos[2] < sz):
            raise AssertionError(f"Block pos {pos} out of bounds {(sx, sy, sz)}")
        if not (0 <= state < len(palette)):
            raise AssertionError(f"Invalid state index {state} (palette len {len(palette)})")
        bname = palette[state].entries["Name"].value
        bnbt = blk.entries.get("nbt")
        blocks_map[pos] = (bname, bnbt)

    return (sx, sy, sz), palette, blocks_map


def _index_block_props(root: NbtCompound) -> dict[tuple[int, int, int], dict[str, str]]:
    """Zwraca mapę właściwości blockstate (`Properties`) dla każdej pozycji z NBT."""
    palette = root.entries["palette"].items
    props_map: dict[tuple[int, int, int], dict[str, str]] = {}
    for blk in root.entries["blocks"].items:
        pos = tuple(c.value for c in blk.entries["pos"].items)
        state = blk.entries["state"].value
        p_entry = palette[state]
        if "Properties" in p_entry.entries:
            props_map[pos] = {k: v.value for k, v in p_entry.entries["Properties"].entries.items()}
        else:
            props_map[pos] = {}
    return props_map


_FLAMMABLE_SUBSTRINGS = (
    "_log", "_wood", "_planks", "_leaves", "_wool", "_carpet",
    "_fence", "_sign", "_bed", "_banner", "_sapling",
    "chest", "crafting_table", "barrel", "bookshelf", "vine",
    "hay_block", "scaffolding", "bamboo", "composter", "lectern",
    "loom", "beehive", "bee_nest", "tnt", "short_grass", "tall_grass",
    "oak_", "spruce_", "birch_", "jungle_", "acacia_", "dark_oak_",
    "mangrove_", "cherry_",
)


def _is_flammable_block(name: str) -> bool:
    short = name.split(":")[-1]
    return any(tok in short for tok in _FLAMMABLE_SUBSTRINGS)


def _is_solid_nonflammable_containment(name: str) -> bool:
    if name in ("minecraft:air", "minecraft:water", "minecraft:lava", "minecraft:torch", "minecraft:lantern"):
        return False
    if any(tok in name for tok in ("slab", "wall", "stairs", "leaves", "pane", "bars")):
        return False
    return not _is_flammable_block(name)


def verify_all(repo_root: Path) -> None:
    targets = {
        "starter": repo_root / "config/skyblockbuilder/templates/islands/starter_island.nbt",
        "market": repo_root / "config/skyblockbuilder/templates/spreads/market_island.nbt",
        "industrial": repo_root / "config/skyblockbuilder/templates/spreads/industrial_island.nbt",
    }

    for key, path in targets.items():
        if not path.is_file():
            raise FileNotFoundError(f"Brak oczekiwanego pliku NBT: {path}")

    # 1. starter_island.nbt (100% waniliowe bloki dla gwarancji czystego spawnu)
    s_root = decode_nbt_gzip(targets["starter"].read_bytes())
    s_size, s_pal, s_blocks = _index_blocks(s_root, vanilla_only=True)
    s_props = _index_block_props(s_root)
    assert s_size == (15, 13, 15), f"starter_island size mismatch: {s_size}"
    ground_blk = s_blocks.get((7, 6, 7), ("minecraft:air", None))[0]
    spawn_0 = s_blocks.get((7, 7, 7), ("minecraft:air", None))[0]
    spawn_1 = s_blocks.get((7, 8, 7), ("minecraft:air", None))[0]
    assert ground_blk == "minecraft:grass_block", f"Spawn ground must be grass_block, got {ground_blk}"
    assert spawn_0 == "minecraft:air" and spawn_1 == "minecraft:air", (
        f"Spawn headroom must be 2x air, got {spawn_0}, {spawn_1}"
    )
    chest_name, chest_nbt = s_blocks[(6, 7, 5)]
    assert chest_name == "minecraft:chest" and chest_nbt is not None, "Starter chest missing!"
    chest_items = {it.entries["id"].value: it.entries["count"].value for it in chest_nbt.entries["Items"].items}
    for req_item in ("minecraft:lava_bucket", "minecraft:ice", "minecraft:oak_sapling", "minecraft:sugar_cane", "minecraft:cactus", "minecraft:kelp"):
        assert chest_items.get(req_item, 0) >= 1, f"Starter chest missing anti-softlock item: {req_item}"
    assert chest_items.get("minecraft:glass", 0) >= 3, (
        f"Starter chest must contain >= 3x minecraft:glass for Mechanical Extruder, got {chest_items.get('minecraft:glass', 0)}"
    )

    # Asercje wbudowanego generatora bruku (#88)
    def _blk_name(pos: tuple[int, int, int]) -> str:
        return s_blocks.get(pos, ("minecraft:air", None))[0]

    assert _blk_name((3, 6, 10)) == "minecraft:water" and s_props.get((3, 6, 10), {}).get("level") == "0", (
        f"Expected water source (level=0) at (3,6,10), got {_blk_name((3, 6, 10))} {s_props.get((3, 6, 10))}"
    )
    assert _blk_name((4, 6, 10)) == "minecraft:water" and s_props.get((4, 6, 10), {}).get("level") == "1", (
        f"Expected flowing water (level=1) at (4,6,10), got {_blk_name((4, 6, 10))} {s_props.get((4, 6, 10))}"
    )
    assert _blk_name((4, 5, 10)) == "minecraft:water" and s_props.get((4, 5, 10), {}).get("level") == "8", (
        f"Expected falling water (level=8) in pit (4,5,10), got {_blk_name((4, 5, 10))} {s_props.get((4, 5, 10))}"
    )
    assert _blk_name((4, 4, 10)) == "minecraft:stone", (
        f"Expected solid stone bottom under water pit (4,4,10), got {_blk_name((4, 4, 10))}"
    )
    assert _blk_name((5, 6, 10)) == "minecraft:cobblestone", (
        f"Expected cobblestone regen spot at (5,6,10), got {_blk_name((5, 6, 10))}"
    )
    assert _blk_name((5, 7, 10)) == "minecraft:air", (
        f"Space above cobblestone regen spot (5,7,10) must be air, got {_blk_name((5, 7, 10))}"
    )
    lava_pos = (6, 6, 10)
    assert _blk_name(lava_pos) == "minecraft:lava" and s_props.get(lava_pos, {}).get("level") == "0", (
        f"Expected lava source (level=0) at {lava_pos}, got {_blk_name(lava_pos)} {s_props.get(lava_pos)}"
    )
    assert (
        _blk_name((6, 7, 10)) == "minecraft:stone_brick_slab"
        and s_props.get((6, 7, 10), {}).get("type") == "bottom"
        and s_props.get((6, 7, 10), {}).get("waterlogged") == "false"
    ), f"Expected non-flammable stone_brick_slab cover above lava at (6,7,10), got {_blk_name((6, 7, 10))} {s_props.get((6, 7, 10))}"

    # Brak otwartych boków dla wody, dołka, punktu bruku i źródła lawy poza zaplanowanymi połączeniami
    planned_open_neighbors: dict[tuple[int, int, int], set[tuple[int, int, int]]] = {
        (3, 6, 10): {(4, 6, 10), (3, 7, 10)},
        (4, 6, 10): {(3, 6, 10), (5, 6, 10), (4, 5, 10), (4, 7, 10)},
        (4, 5, 10): {(4, 6, 10)},
        (5, 6, 10): {(4, 6, 10), (6, 6, 10), (5, 7, 10)},
        (6, 6, 10): {(5, 6, 10), (6, 7, 10)},
    }
    for cell, allowed in planned_open_neighbors.items():
        cx_c, cy_c, cz_c = cell
        for dx, dy, dz in ((-1, 0, 0), (1, 0, 0), (0, -1, 0), (0, 1, 0), (0, 0, -1), (0, 0, 1)):
            nb = (cx_c + dx, cy_c + dy, cz_c + dz)
            if nb in allowed:
                continue
            nb_name = _blk_name(nb)
            assert _is_solid_nonflammable_containment(nb_name), (
                f"Cobble-gen cell {cell} has open/non-solid/flammable side at {nb}: {nb_name}"
            )
    # Źródło lawy nie może stykać się z wodą w żadnym z 6 kierunków (gwarancja braku obsydianu)
    for dx, dy, dz in ((-1, 0, 0), (1, 0, 0), (0, -1, 0), (0, 1, 0), (0, 0, -1), (0, 0, 1)):
        nb = (lava_pos[0] + dx, lava_pos[1] + dy, lava_pos[2] + dz)
        assert _blk_name(nb) != "minecraft:water", f"Lava source {lava_pos} touches water at {nb} (obsidian risk)!"
    # Brak bloków palnych w promieniu <= 4 bloków od źródła lawy (6, 6, 10)
    for pos, (bname, _) in s_blocks.items():
        if _is_flammable_block(bname):
            euc = math.dist(pos, lava_pos)
            cheb = max(abs(pos[0] - lava_pos[0]), abs(pos[1] - lava_pos[1]), abs(pos[2] - lava_pos[2]))
            assert euc > 4.0 and cheb > 4, (
                f"Flammable block {bname} at {pos} is too close to lava {lava_pos} (dist={euc:.2f}, cheb={cheb} <= 4)"
            )

    # 2. market_island.nbt (45 x 25 x 35, floor_y = 8 -> offset [152, 4, 0])
    m_root = decode_nbt_gzip(targets["market"].read_bytes())
    m_size, m_pal, m_blocks = _index_blocks(m_root, vanilla_only=False)
    assert m_size == (45, 25, 35), f"market_island size mismatch: {m_size}"
    # KRYTYCZNE dla AI NPC Shoppers: ZERO schodów i półpłytek na poziomie chodnika (y=8 oraz y=9)!
    for (bx, by, bz), (nm, _) in m_blocks.items():
        if by in (8, 9) and ("stairs" in nm or "slab" in nm):
            raise AssertionError(
                f"market_island zawiera blok utrudniający pathfinding Shoppers na poziomie chodnika ({bx},{by},{bz}): {nm}"
            )
    # 3 prawdziwe bankomaty ATM + 3 złote cokoły w bezpiecznym odstępie >= 6 bloków
    atm_plinths = [pos for pos, (nm, _) in m_blocks.items() if nm == "minecraft:gold_block" and pos[1] == 8]
    atm_blocks = [pos for pos, (nm, _) in m_blocks.items() if nm == "lightmanscurrency:atm"]
    term_blocks = [pos for pos, (nm, _) in m_blocks.items() if nm == "lightmanscurrency:terminal"]
    assert len(atm_plinths) == 3, f"market_island musi mieć dokładnie 3 cokoły ATM, znaleziono {len(atm_plinths)}"
    assert len(atm_blocks) == 6, f"market_island musi mieć 3 dwublokowe lightmanscurrency:atm (6 części), znaleziono {len(atm_blocks)}"
    assert len(term_blocks) == 1, f"market_island musi mieć 1 centralny lightmanscurrency:terminal, znaleziono {len(term_blocks)}"
    for i in range(len(atm_plinths)):
        for j in range(i + 1, len(atm_plinths)):
            d = math.dist(atm_plinths[i], atm_plinths[j])
            assert d >= 6.0, f"Pady ATM za blisko siebie ({d:.2f} < 6.0): {atm_plinths[i]} vs {atm_plinths[j]}"
    # Otwarty wjazd kolejowy (x=0, z=13..21, y=9..15)
    for z_chk in range(13, 22):
        for y_chk in range(9, 15):
            assert (0, y_chk, z_chk) not in m_blocks, f"Zachodni wjazd stacji zablokowany na (0,{y_chk},{z_chk})!"

    # 3. industrial_island.nbt (33 x 21 x 33, floor_y = 6 -> offset [0, 4, 152])
    i_root = decode_nbt_gzip(targets["industrial"].read_bytes())
    i_size, i_pal, i_blocks = _index_blocks(i_root, vanilla_only=False)
    assert i_size == (33, 21, 33), f"industrial_island size mismatch: {i_size}"
    for x_chk in range(14, 19):
        for y_chk in range(7, 13):
            assert (x_chk, y_chk, 0) not in i_blocks, f"Północny Dok Kolejowy zablokowany na ({x_chk},{y_chk},0)!"
    ind_terms = [pos for pos, (nm, _) in i_blocks.items() if nm == "lightmanscurrency:terminal"]
    assert len(ind_terms) == 1, f"industrial_island dyspozytornia powinna mieć 1 terminal LC, znaleziono {len(ind_terms)}"

    # Cross-check z config/skyblockbuilder/templates.json5 (wyrównanie do świata Y = 64!)
    tpl_path = repo_root / "config/skyblockbuilder/templates.json5"
    if tpl_path.is_file():
        tpl_txt = tpl_path.read_text(encoding="utf-8")
        if not re.search(r"\[\s*7\s*,\s*7\s*,\s*7\s*\]", tpl_txt):
            raise AssertionError("templates.json5 nie zawiera oczekiwanego spawnu [7, 7, 7]!")
        if not re.search(r"\[\s*152\s*,\s*4\s*,\s*0\s*\]", tpl_txt):
            raise AssertionError("templates.json5 musi mieć offset [152, 4, 0] dla market_island (45x25x35, floor_y=8 -> Y=64)!")
        if not re.search(r"\[\s*0\s*,\s*4\s*,\s*152\s*\]", tpl_txt):
            raise AssertionError("templates.json5 musi mieć offset [0, 4, 152] dla industrial_island (33x21x33, floor_y=6 -> Y=64)!")

    print(
        f"✅ starter_island.nbt OK: size={s_size}, blocks={len(s_blocks)}, palette={len(s_pal)}, "
        f"DataVersion={MC_1_21_1_DATA_VERSION}, spawn=(7,7,7) na {ground_blk}, skrzynia={len(chest_items)} pozycji."
    )
    print(
        f"✅ market_island.nbt OK: size={m_size}, blocks={len(m_blocks)}, palette={len(m_pal)}, "
        f"DataVersion={MC_1_21_1_DATA_VERSION}, płaski plac y=8 (Y=64), 3x ATM + 1x Terminal + 8 dwupiętrowych butików."
    )
    print(
        f"✅ industrial_island.nbt OK: size={i_size}, blocks={len(i_blocks)}, palette={len(i_pal)}, "
        f"DataVersion={MC_1_21_1_DATA_VERSION}, 4 hale 11x11 (Y=64), suwnica + komin + dyspozytornia z Terminalem."
    )


def generate_all(repo_root: Path) -> None:
    outputs = [
        (
            repo_root / "config/skyblockbuilder/templates/islands/starter_island.nbt",
            build_starter_island(),
        ),
        (
            repo_root / "config/skyblockbuilder/templates/spreads/market_island.nbt",
            build_market_island(),
        ),
        (
            repo_root / "config/skyblockbuilder/templates/spreads/industrial_island.nbt",
            build_industrial_island(),
        ),
    ]
    for path, builder in outputs:
        path.parent.mkdir(parents=True, exist_ok=True)
        raw = encode_nbt_gzip(builder.to_nbt())
        path.write_bytes(raw)
        print(f"📝 Wygenerowano {path.relative_to(repo_root)} ({len(raw)} bajtów GZip NBT)")


def main() -> int:
    parser = argparse.ArgumentParser(description="Generator i walidator wysp .nbt dla HalucynacjeGTP2")
    parser.add_argument(
        "--verify",
        action="store_true",
        help="Tylko zweryfikuj istniejące pliki .nbt na dysku (bez nadpisywania).",
    )
    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parent.parent

    if not args.verify:
        generate_all(repo_root)
    verify_all(repo_root)
    return 0


if __name__ == "__main__":
    sys.exit(main())
