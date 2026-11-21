#!/usr/bin/env python3
"""
HalucynacjeGTP2 — Deterministyczny generator i walidator 3 binarnych szablonów
wysp `.nbt` dla Skyblock Builder (Minecraft 1.21.1, DataVersion 3955).

Zero zewnętrznych zależności (wyłącznie Python 3 stdlib: struct, gzip, pathlib).
Generuje wyłącznie waniliowe bloki Minecraft 1.21.1 — zero ryzyka brakujących
bloków z modów podczas pierwszego uruchomienia serwera Exaroton.

Docelowe pliki (zgodne z `MelanX/SkyblockBuilder` 1.21.x `SkyPaths.java`):
  1. config/skyblockbuilder/templates/islands/starter_island.nbt     (15 x 13 x 15)
  2. config/skyblockbuilder/templates/spreads/market_island.nbt      (29 x 9 x 25)
  3. config/skyblockbuilder/templates/spreads/industrial_island.nbt  (21 x 7 x 21)

Użycie:
  python3 scripts/generate_island_nbt.py            # generuje 3 pliki .nbt i weryfikuje je
  python3 scripts/generate_island_nbt.py --verify   # parsuje i weryfikuje istniejące .nbt na dysku
"""

from __future__ import annotations

import argparse
import gzip
import io
import math
import re
import struct
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Any

# Minecraft 1.21.1 DataVersion
MC_1_21_1_DATA_VERSION = 3955

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

    # Bezpieczna wnęka pod generator bruku (SW: x=3..5, z=9..10) — bez rozlanej lawy,
    # z blokiem `minecraft:ice` do rozbicia i solidną niecką z stone_bricks
    for x in (3, 4, 5):
        for z in (9, 10):
            sb.set(x, 5, z, "minecraft:stone_bricks")
    sb.set(3, 6, 10, "minecraft:ice")
    sb.set(4, 6, 10, "minecraft:cobblestone")
    sb.set(5, 6, 10, "minecraft:stone_bricks")
    sb.set(3, 6, 9, "minecraft:stone_bricks")
    sb.set(4, 6, 9, "minecraft:stone_bricks")
    sb.set(5, 6, 9, "minecraft:stone_bricks")

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

    # Dąb startowy w narożniku NW (pień na (3, 7..10, 3), liście z dokładnym distance)
    trunk_coords = [(3, y, 3) for y in range(7, 11)]
    for tx, ty, tz in trunk_coords:
        sb.set(tx, ty, tz, "minecraft:oak_log", {"axis": "y"})

    leaf_positions: list[tuple[int, int, int]] = []
    # Warstwy y=9 i y=10: 5x5 bez narożników
    for y in (9, 10):
        for dx in range(-2, 3):
            for dz in range(-2, 3):
                if abs(dx) == 2 and abs(dz) == 2:
                    continue
                if dx == 0 and dz == 0:
                    continue
                leaf_positions.append((3 + dx, y, 3 + dz))
    # Warstwa y=11: 3x3 pełne
    for dx in range(-1, 2):
        for dz in range(-1, 2):
            leaf_positions.append((3 + dx, 11, 3 + dz))
    # Warstwa y=12: krzyżyk na szczycie korony
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

    # Oświetlenie anty-spawn (pochodnie w bezpiecznych miejscach z dala od spawnu)
    for tx, tz in [(5, 7), (9, 5), (9, 9), (6, 9)]:
        sb.set(tx, 7, tz, "minecraft:torch")

    # Gwarantowane 2 bloki powietrza na punkcie spawnu (7, 7, 7) i (7, 8, 7)
    sb.set(7, 7, 7, "minecraft:air")
    sb.set(7, 8, 7, "minecraft:air")

    return sb


# ---------------------------------------------------------------------------
# 2. Wyspa-Rynek: market_island.nbt (29 x 9 x 25)
#    Środek powierzchni: (14, 4, 12) -> świat (152, 64, 0) przy offset [152, 0, 0], origin "center"
#    100% płaski plac Y=64 pod AI NPC `Shoppers`, 3 pady ATM (>= 6 bloków),
#    8 stoisk handlowych z 2-blokowymi tylnymi korytarzami pod logistykę Create,
#    Pawilon Centralny, Stacja Kolejowa Zachodnia i pełne oświetlenie anty-spawn.
# ---------------------------------------------------------------------------

def build_market_island() -> StructureBuilder:
    sb = StructureBuilder(29, 9, 25)

    # Podbudowa kadłuba (y = 0..3)
    sb.fill(9, 0, 8, 19, 0, 16, "minecraft:deepslate_bricks")
    sb.fill(5, 1, 5, 23, 1, 19, "minecraft:stone")
    sb.fill(2, 2, 2, 26, 2, 22, "minecraft:cobblestone")
    sb.fill(0, 3, 0, 28, 3, 24, "minecraft:stone")

    # 100% PŁASKA płyta placu na y = 4 (ZERO schodów i półpłytek dla AI Shoppers!)
    sb.fill(0, 4, 0, 28, 4, 24, "minecraft:stone_bricks")

    # Aleje główne (Wschód-Zachód z=10..14 oraz Północ-Południe x=12..16)
    sb.fill(0, 4, 10, 28, 4, 14, "minecraft:polished_andesite")
    sb.fill(12, 4, 0, 16, 4, 24, "minecraft:polished_andesite")
    sb.fill(0, 4, 12, 27, 4, 12, "minecraft:chiseled_stone_bricks")

    # Tylne korytarze logistyczne (2 bloki szerokości!) za rzędami stoisk:
    # Północny: z=1..2, Południowy: z=22..23 — płaska nawierzchnia pod taśmy i Packagery
    sb.fill(5, 4, 1, 25, 4, 2, "minecraft:polished_deepslate")
    sb.fill(5, 4, 22, 25, 4, 23, "minecraft:polished_deepslate")

    # Stacja Kolejowa Zachodnia (x=0..4, z=8..16, naprzeciwko Wyspy Startowej!)
    sb.fill(0, 4, 8, 4, 4, 16, "minecraft:smooth_stone")
    sb.fill(0, 4, 12, 4, 4, 12, "minecraft:chiseled_stone_bricks")
    for z in (8, 16):
        sb.fill(0, 4, z, 4, 4, z, "minecraft:deepslate_tiles")
    # Zadaszenie wjazdu stacji (otwarte na pełną szerokość z=9..15 i wysokość y=5..7)
    for z in (8, 16):
        for y in (5, 6, 7):
            sb.set(1, y, z, "minecraft:stone_brick_wall", {"up": "true", "waterlogged": "false"})
    sb.fill(1, 8, 8, 1, 8, 16, "minecraft:stone_bricks")
    for z in (10, 12, 14):
        sb.set(1, 7, z, "minecraft:lantern", {"hanging": "true", "waterlogged": "false"})

    # Pawilon Centralny pod Trading Terminal (x=12..16, z=10..14)
    for px, pz in [(12, 10), (16, 10), (12, 14), (16, 14)]:
        for y in (5, 6, 7):
            sb.set(px, y, pz, "minecraft:oak_fence", {"waterlogged": "false"})
    sb.fill(12, 8, 10, 16, 8, 14, "minecraft:oak_planks")
    sb.set(14, 8, 12, "minecraft:glowstone")
    sb.set(14, 4, 12, "minecraft:chiseled_stone_bricks")

    # 8 modułowych stoisk handlowych (4 północne z=4..6 + 4 południowe z=18..20)
    # Każde stoisko: szerokość 4, głębokość 3, otwarty przód do placu i otwarty tył do alei!
    stall_x_ranges = [(6, 9), (11, 14), (16, 19), (21, 24)]
    stall_wool_colors = [
        "minecraft:red_wool",
        "minecraft:orange_wool",
        "minecraft:green_wool",
        "minecraft:blue_wool",
    ]
    for idx, (x0, x1) in enumerate(stall_x_ranges):
        wool = stall_wool_colors[idx]
        # Rząd Północny (z=4..6, front przy z=6, tylna aleja przy z=1..2)
        sb.fill(x0, 4, 4, x1, 4, 6, "minecraft:oak_planks")
        sb.fill(x0, 4, 6, x1, 4, 6, "minecraft:stripped_oak_log", {"axis": "x"})
        for cx in (x0, x1):
            for cz in (4, 6):
                for y in (5, 6, 7):
                    sb.set(cx, y, cz, "minecraft:oak_fence", {"waterlogged": "false"})
        sb.fill(x0, 8, 4, x1, 8, 6, wool)

        # Rząd Południowy (z=18..20, front przy z=18, tylna aleja przy z=22..23)
        sb.fill(x0, 4, 18, x1, 4, 20, "minecraft:oak_planks")
        sb.fill(x0, 4, 18, x1, 4, 18, "minecraft:stripped_oak_log", {"axis": "x"})
        for cx in (x0, x1):
            for cz in (18, 20):
                for y in (5, 6, 7):
                    sb.set(cx, y, cz, "minecraft:oak_fence", {"waterlogged": "false"})
        sb.fill(x0, 8, 18, x1, 8, 20, wool)

    # Siatka wpuszczonego oświetlenia `minecraft:sea_lantern` w podłodze y=4 (anty-spawn)
    for x in range(2, 27, 5):
        for z in range(2, 23, 5):
            if (x, z) != (14, 12):
                sb.set(x, 4, z, "minecraft:sea_lantern")

    # 3 oznaczone pady pod bankomaty ATM (`minecraft:gold_block`), wzajemny odstęp >= 8 bloków!
    # ATM 1: (7, 4, 12), ATM 2: (21, 4, 8), ATM 3: (21, 4, 16)
    atm_pads = [(7, 12), (21, 8), (21, 16)]
    for ax, az in atm_pads:
        sb.set(ax, 4, az, "minecraft:gold_block")
        for dx, dz in [(1, 0), (-1, 0), (0, 1), (0, -1)]:
            sb.set(ax + dx, 4, az + dz, "minecraft:chiseled_stone_bricks")

    # Murki ochronne po obwodzie (z pełnym prześwitem na Stację Zachodnią x=0, z=9..15)
    for x in range(0, 29):
        sb.set(x, 5, 0, "minecraft:stone_brick_wall", {"up": "true", "waterlogged": "false"})
        sb.set(x, 5, 24, "minecraft:stone_brick_wall", {"up": "true", "waterlogged": "false"})
    for z in range(1, 24):
        sb.set(28, 5, z, "minecraft:stone_brick_wall", {"up": "true", "waterlogged": "false"})
        if not (8 <= z <= 16):
            sb.set(0, 5, z, "minecraft:stone_brick_wall", {"up": "true", "waterlogged": "false"})

    # Latarnie co 6 bloków na obwodzie
    for x in range(0, 29, 7):
        sb.set(x, 6, 0, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})
        sb.set(x, 6, 24, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})
    for z in (0, 6, 12, 18, 24):
        sb.set(28, 6, z, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})

    return sb


# ---------------------------------------------------------------------------
# 3. Wyspa Przemysłowa / Huta Południowa: industrial_island.nbt (21 x 7 x 21)
#    Środek powierzchni: (10, 3, 10) -> świat (0, 64, 152) przy offset [0, 0, 152], origin "center"
#    Ciężka płyta przemysłowa z łupka (deepslate), Północny Dok Kolejowy wskazujący
#    prosto na Wyspę Startową (X=0) i pełne oświetlenie anty-spawn.
# ---------------------------------------------------------------------------

def build_industrial_island() -> StructureBuilder:
    sb = StructureBuilder(21, 7, 21)

    # Podbudowa kadłuba (y = 0..2)
    sb.fill(7, 0, 7, 13, 0, 13, "minecraft:deepslate_tiles")
    sb.fill(4, 1, 4, 16, 1, 16, "minecraft:deepslate", {"axis": "y"})
    sb.fill(1, 2, 1, 19, 2, 19, "minecraft:cobbled_deepslate")

    # Płaska płyta robocza 21x21 na y = 3 (świat Y = 64!)
    sb.fill(0, 3, 0, 20, 3, 20, "minecraft:deepslate_bricks")

    # Centralny krzyż technologiczny z polerowanego łupka + pas bezpieczeństwa z smooth_stone
    sb.fill(8, 3, 0, 12, 3, 20, "minecraft:polished_deepslate")
    sb.fill(0, 3, 8, 20, 3, 12, "minecraft:polished_deepslate")
    for i in range(1, 20):
        sb.set(i, 3, 1, "minecraft:smooth_stone")
        sb.set(i, 3, 19, "minecraft:smooth_stone")
        sb.set(1, 3, i, "minecraft:smooth_stone")
        sb.set(19, 3, i, "minecraft:smooth_stone")

    # Oś toru wjazdowego Doku Północnego (x=10, z=0..6)
    sb.fill(10, 3, 0, 10, 3, 6, "minecraft:chiseled_deepslate")
    sb.set(10, 3, 10, "minecraft:chiseled_deepslate")

    # Siatka wpuszczonego oświetlenia `minecraft:sea_lantern` w podłodze y=3 (anty-spawn)
    for x in (3, 8, 12, 17):
        for z in (3, 8, 12, 17):
            sb.set(x, 3, z, "minecraft:sea_lantern")

    # Murki ochronne po obwodzie (z pełnym otwarciem Doku Północnego x=8..12, z=0)
    for x in range(0, 21):
        sb.set(x, 4, 20, "minecraft:deepslate_brick_wall", {"up": "true", "waterlogged": "false"})
        if not (8 <= x <= 12):
            sb.set(x, 4, 0, "minecraft:deepslate_brick_wall", {"up": "true", "waterlogged": "false"})
    for z in range(1, 20):
        sb.set(0, 4, z, "minecraft:deepslate_brick_wall", {"up": "true", "waterlogged": "false"})
        sb.set(20, 4, z, "minecraft:deepslate_brick_wall", {"up": "true", "waterlogged": "false"})

    # Bramka wjazdowa Doku Północnego (filary na x=7 i x=13, z=0)
    for gx in (7, 13):
        sb.set(gx, 4, 0, "minecraft:polished_deepslate_wall", {"up": "true", "waterlogged": "false"})
        sb.set(gx, 5, 0, "minecraft:polished_deepslate_wall", {"up": "true", "waterlogged": "false"})
        sb.set(gx, 6, 0, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})

    # Latarnie narożne i środkowe na obwodzie
    for lx, lz in [(0, 0), (20, 0), (0, 20), (20, 20), (0, 10), (20, 10), (10, 20)]:
        sb.set(lx, 5, lz, "minecraft:lantern", {"hanging": "false", "waterlogged": "false"})

    return sb


# ---------------------------------------------------------------------------
# Weryfikator round-trip binarnych plików `.nbt` + cross-check z templates.json5
# ---------------------------------------------------------------------------

def _index_blocks(root: NbtCompound) -> tuple[tuple[int, int, int], list[NbtCompound], dict[tuple[int, int, int], tuple[str, NbtCompound | None]]]:
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
        if not name.startswith("minecraft:"):
            raise AssertionError(f"Non-vanilla block in palette[{idx}]: {name}")
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


def verify_all(repo_root: Path) -> None:
    targets = {
        "starter": repo_root / "config/skyblockbuilder/templates/islands/starter_island.nbt",
        "market": repo_root / "config/skyblockbuilder/templates/spreads/market_island.nbt",
        "industrial": repo_root / "config/skyblockbuilder/templates/spreads/industrial_island.nbt",
    }

    for key, path in targets.items():
        if not path.is_file():
            raise FileNotFoundError(f"Brak oczekiwanego pliku NBT: {path}")

    # 1. starter_island.nbt
    s_root = decode_nbt_gzip(targets["starter"].read_bytes())
    s_size, s_pal, s_blocks = _index_blocks(s_root)
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

    # Cross-check z config/skyblockbuilder/templates.json5
    tpl_path = repo_root / "config/skyblockbuilder/templates.json5"
    if tpl_path.is_file():
        tpl_txt = tpl_path.read_text(encoding="utf-8")
        if not re.search(r"\[\s*7\s*,\s*7\s*,\s*7\s*\]", tpl_txt):
            raise AssertionError("templates.json5 nie zawiera oczekiwanego spawnu [7, 7, 7]!")

    # 2. market_island.nbt
    m_root = decode_nbt_gzip(targets["market"].read_bytes())
    m_size, m_pal, m_blocks = _index_blocks(m_root)
    assert m_size == (29, 9, 25), f"market_island size mismatch: {m_size}"
    for p in m_pal:
        nm = p.entries["Name"].value
        if "stairs" in nm or "slab" in nm:
            raise AssertionError(f"market_island zawiera blok utrudniający pathfinding Shoppers: {nm}")
    atm_positions = [pos for pos, (nm, _) in m_blocks.items() if nm == "minecraft:gold_block"]
    assert len(atm_positions) == 3, f"market_island musi mieć dokładnie 3 pady ATM, znaleziono {len(atm_positions)}"
    for i in range(len(atm_positions)):
        for j in range(i + 1, len(atm_positions)):
            d = math.dist(atm_positions[i], atm_positions[j])
            assert d >= 6.0, f"Pady ATM za blisko siebie ({d:.2f} < 6.0): {atm_positions[i]} vs {atm_positions[j]}"
    assert (0, 5, 12) not in m_blocks, "Zachodni wjazd stacji na market_island jest zablokowany!"

    # 3. industrial_island.nbt
    i_root = decode_nbt_gzip(targets["industrial"].read_bytes())
    i_size, i_pal, i_blocks = _index_blocks(i_root)
    assert i_size == (21, 7, 21), f"industrial_island size mismatch: {i_size}"
    assert (10, 4, 0) not in i_blocks, "Północny Dok Kolejowy na industrial_island jest zablokowany!"

    print(
        f"✅ starter_island.nbt OK: size={s_size}, blocks={len(s_blocks)}, palette={len(s_pal)}, "
        f"DataVersion={MC_1_21_1_DATA_VERSION}, spawn=(7,7,7) na {ground_blk}, skrzynia={len(chest_items)} pozycji."
    )
    print(
        f"✅ market_island.nbt OK: size={m_size}, blocks={len(m_blocks)}, palette={len(m_pal)}, "
        f"DataVersion={MC_1_21_1_DATA_VERSION}, 100% płaski plac y=4, 3 pady ATM (min odstęp >= 6)."
    )
    print(
        f"✅ industrial_island.nbt OK: size={i_size}, blocks={len(i_blocks)}, palette={len(i_pal)}, "
        f"DataVersion={MC_1_21_1_DATA_VERSION}, płyta 21x21 y=3 + otwarty Dok Północny."
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
