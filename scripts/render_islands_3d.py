#!/usr/bin/env python3
"""
HalucynacjeGTP2 — Renderer 3D (izometryczne arkusze PNG + interaktywny podgląd 3D HTML)
bezpośrednio z binarnych plików struktur `.nbt` (Minecraft 1.21.1, DataVersion 3955).

Pozwala wizualnie zatwierdzić wszystkie 3 wyspy (`starter_island.nbt`, `market_island.nbt`,
`industrial_island.nbt`) bezpośrednio na GitHubie (`docs/ISLAND_PREVIEWS.md`) lub w
interaktywnym pliku 3D HTML (`docs/renders/island_viewer_3d.html`) bez uruchamiania
i restartowania serwera Minecraft.

Wymagania: Python 3 + Pillow (`PIL`).
Użycie:
  python3 scripts/render_islands_3d.py
"""

from __future__ import annotations

import json
import math
import sys
from pathlib import Path
from typing import Any

from PIL import Image, ImageDraw, ImageFont

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "scripts"))
from generate_island_nbt import decode_nbt_gzip, _index_blocks  # noqa: E402


# ---------------------------------------------------------------------------
# Paleta materiałów (RGBA) dla bloków Vanilla 1.21.1 + Create 6 + Deco + LC
# Format: (R, G, B, A, emissive_boost)
# ---------------------------------------------------------------------------
BLOCK_COLORS: dict[str, tuple[int, int, int, int, float]] = {
    # Natura i skała
    "minecraft:grass_block": (98, 158, 66, 255, 0.0),
    "minecraft:dirt": (134, 96, 67, 255, 0.0),
    "minecraft:moss_block": (94, 128, 52, 255, 0.0),
    "minecraft:stone": (132, 134, 138, 255, 0.0),
    "minecraft:cobblestone": (118, 120, 124, 255, 0.0),
    "minecraft:andesite": (140, 142, 144, 255, 0.0),
    "minecraft:polished_andesite": (152, 154, 156, 255, 0.0),
    "minecraft:tuff": (108, 109, 102, 255, 0.0),
    "minecraft:chiseled_tuff_bricks": (116, 118, 110, 255, 0.0),
    "minecraft:smooth_stone": (162, 164, 166, 255, 0.0),
    "minecraft:stone_bricks": (126, 128, 132, 255, 0.0),
    "minecraft:chiseled_stone_bricks": (142, 144, 148, 255, 0.0),
    "minecraft:stone_brick_wall": (122, 124, 128, 255, 0.0),
    "minecraft:deepslate": (78, 80, 86, 255, 0.0),
    "minecraft:cobbled_deepslate": (72, 74, 80, 255, 0.0),
    "minecraft:deepslate_bricks": (70, 72, 78, 255, 0.0),
    "minecraft:deepslate_brick_wall": (66, 68, 74, 255, 0.0),
    "minecraft:deepslate_tiles": (56, 58, 64, 255, 0.0),
    "minecraft:deepslate_tile_stairs": (56, 58, 64, 255, 0.0),
    "minecraft:deepslate_tile_slab": (56, 58, 64, 255, 0.0),
    "minecraft:polished_deepslate": (86, 88, 94, 255, 0.0),
    "minecraft:bedrock": (52, 52, 56, 255, 0.0),
    "minecraft:coal_ore": (96, 98, 102, 255, 0.0),
    "minecraft:iron_ore": (154, 138, 126, 255, 0.0),
    "minecraft:magma_block": (214, 92, 34, 255, 0.45),
    "minecraft:ice": (144, 194, 245, 210, 0.0),
    "minecraft:water": (52, 132, 224, 185, 0.0),
    # Drewno, liście, cegły, wełna
    "minecraft:oak_log": (112, 86, 56, 255, 0.0),
    "minecraft:stripped_oak_log": (176, 144, 92, 255, 0.0),
    "minecraft:stripped_spruce_log": (118, 88, 54, 255, 0.0),
    "minecraft:oak_planks": (172, 138, 86, 255, 0.0),
    "minecraft:spruce_planks": (122, 88, 56, 255, 0.0),
    "minecraft:dark_oak_planks": (74, 48, 28, 255, 0.0),
    "minecraft:oak_leaves": (74, 134, 52, 235, 0.0),
    "minecraft:azalea_leaves": (86, 142, 58, 240, 0.0),
    "minecraft:flowering_azalea_leaves": (154, 114, 142, 245, 0.0),
    "minecraft:bricks": (158, 92, 74, 255, 0.0),
    "minecraft:white_terracotta": (214, 184, 166, 255, 0.0),
    "minecraft:hay_block": (188, 152, 48, 255, 0.0),
    "minecraft:white_wool": (238, 240, 242, 255, 0.0),
    "minecraft:orange_wool": (236, 126, 36, 255, 0.0),
    "minecraft:green_wool": (86, 134, 48, 255, 0.0),
    "minecraft:pink_wool": (238, 138, 168, 255, 0.0),
    "minecraft:yellow_wool": (244, 206, 52, 255, 0.0),
    "minecraft:red_wool": (186, 46, 42, 255, 0.0),
    "minecraft:cyan_wool": (32, 156, 166, 255, 0.0),
    "minecraft:blue_wool": (56, 78, 178, 255, 0.0),
    "minecraft:purple_wool": (136, 56, 178, 255, 0.0),
    "minecraft:yellow_concrete": (238, 182, 34, 255, 0.0),
    "minecraft:black_concrete": (28, 30, 36, 255, 0.0),
    # Funkcyjne i oświetlenie
    "minecraft:chest": (166, 114, 52, 255, 0.0),
    "minecraft:barrel": (136, 98, 62, 255, 0.0),
    "minecraft:crafting_table": (146, 102, 64, 255, 0.0),
    "minecraft:smithing_table": (62, 64, 78, 255, 0.0),
    "minecraft:anvil": (76, 78, 84, 255, 0.0),
    "minecraft:smoker": (144, 112, 74, 255, 0.25),
    "minecraft:blast_furnace": (108, 110, 116, 255, 0.3),
    "minecraft:honeycomb_block": (244, 184, 48, 255, 0.1),
    "minecraft:coal_block": (34, 36, 42, 255, 0.0),
    "minecraft:emerald_block": (54, 214, 104, 255, 0.2),
    "minecraft:potted_poppy": (214, 58, 52, 255, 0.1),
    "minecraft:potted_dandelion": (248, 222, 64, 255, 0.1),
    "minecraft:potted_blue_orchid": (62, 186, 232, 255, 0.1),
    "minecraft:potted_orange_tulip": (242, 134, 44, 255, 0.1),
    "minecraft:potted_pink_tulip": (242, 148, 184, 255, 0.1),
    "minecraft:potted_fern": (76, 152, 62, 255, 0.0),
    "minecraft:potted_azalea_bush": (146, 114, 144, 255, 0.05),
    "minecraft:potted_oak_sapling": (92, 148, 56, 255, 0.0),
    "minecraft:potted_cactus": (68, 134, 52, 255, 0.0),
    "minecraft:oak_wall_sign": (186, 148, 92, 255, 0.1),
    "minecraft:gold_block": (246, 206, 62, 255, 0.15),
    "minecraft:torch": (255, 214, 96, 255, 0.6),
    "minecraft:lantern": (255, 198, 86, 255, 0.7),
    "minecraft:sea_lantern": (176, 232, 224, 255, 0.65),
    "minecraft:ochre_froglight": (252, 232, 152, 255, 0.7),
    "minecraft:copper_bulb": (248, 178, 84, 255, 0.75),
    "minecraft:campfire": (248, 134, 42, 255, 0.7),
    "minecraft:chain": (78, 84, 94, 255, 0.0),
    "minecraft:lightning_rod": (212, 128, 88, 255, 0.1),
    # Create 6
    "create:cut_limestone_bricks": (222, 212, 184, 255, 0.0),
    "create:small_limestone_bricks": (212, 202, 174, 255, 0.0),
    "create:polished_cut_limestone": (232, 224, 198, 255, 0.0),
    "create:cut_limestone_brick_wall": (216, 206, 178, 255, 0.0),
    "create:cut_ochrum_bricks": (208, 172, 92, 255, 0.0),
    "create:cut_asurine_bricks": (74, 114, 132, 255, 0.0),
    "create:brass_casing": (184, 142, 62, 255, 0.05),
    "create:brass_block": (228, 188, 78, 255, 0.12),
    "create:brass_bars": (204, 166, 72, 255, 0.05),
    "create:andesite_casing": (134, 132, 122, 255, 0.0),
    "create:copper_casing": (196, 116, 74, 255, 0.0),
    "create:railway_casing": (84, 72, 86, 255, 0.0),
    "create:industrial_iron_block": (64, 68, 74, 255, 0.0),
    "create:metal_girder": (72, 76, 84, 255, 0.0),
    "create:framed_glass": (184, 216, 232, 130, 0.05),
    "create:horizontal_framed_glass": (192, 222, 238, 135, 0.05),
    "create:tiled_glass": (176, 212, 232, 135, 0.05),
    "create:copper_shingles": (202, 114, 76, 255, 0.0),
    "create:copper_shingle_stairs": (202, 114, 76, 255, 0.0),
    "create:copper_shingle_slab": (202, 114, 76, 255, 0.0),
    "create:exposed_copper_shingles": (152, 132, 108, 255, 0.0),
    "create:exposed_copper_shingle_stairs": (152, 132, 108, 255, 0.0),
    "create:exposed_copper_shingle_slab": (152, 132, 108, 255, 0.0),
    "create:weathered_copper_shingles": (98, 158, 134, 255, 0.0),
    "create:weathered_copper_shingle_stairs": (98, 158, 134, 255, 0.0),
    "create:weathered_copper_shingle_slab": (98, 158, 134, 255, 0.0),
    # Create Deco
    "createdeco:brass_catwalk": (194, 156, 72, 255, 0.0),
    "createdeco:industrial_iron_catwalk": (78, 82, 90, 255, 0.0),
    # Lightman's Currency
    "lightmanscurrency:atm": (44, 186, 158, 255, 0.35),
    "lightmanscurrency:terminal": (56, 212, 242, 255, 0.45),
    "lightmanscurrency:coinblock_gold": (252, 214, 68, 255, 0.25),
    "lightmanscurrency:coinpile_gold": (252, 214, 68, 255, 0.25),
}


def get_block_style(name: str) -> tuple[int, int, int, int, float]:
    if name in BLOCK_COLORS:
        return BLOCK_COLORS[name]
    if "wool" in name:
        return (220, 220, 220, 255, 0.0)
    if "glass" in name:
        return (180, 215, 232, 130, 0.0)
    if "copper" in name:
        return (180, 120, 90, 255, 0.0)
    return (160, 160, 168, 255, 0.0)


def _shade(rgb: tuple[int, int, int], factor: float, emissive: float = 0.0) -> tuple[int, int, int]:
    eff = factor + (1.0 - factor) * emissive
    return (
        max(0, min(255, int(rgb[0] * eff))),
        max(0, min(255, int(rgb[1] * eff))),
        max(0, min(255, int(rgb[2] * eff))),
    )


def _get_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for p in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    ]:
        if Path(p).is_file():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def _get_font_regular(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    for p in [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    ]:
        if Path(p).is_file():
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def _draw_sky_bg(width: int, height: int) -> Image.Image:
    """Tworzy delikatne, profesjonalne tło nieba Skyblocka."""
    img = Image.new("RGBA", (width, height))
    draw = ImageDraw.Draw(img)
    top = (22, 32, 54)
    mid = (36, 56, 86)
    bot = (56, 82, 114)
    for y in range(height):
        t = y / max(1, height - 1)
        if t < 0.55:
            k = t / 0.55
            c = tuple(int(top[i] + (mid[i] - top[i]) * k) for i in range(3))
        else:
            k = (t - 0.55) / 0.45
            c = tuple(int(mid[i] + (bot[i] - mid[i]) * k) for i in range(3))
        draw.line([(0, y), (width, y)], fill=(*c, 255))
    return img


def _rotate_pos(x: int, y: int, z: int, sx: int, sz: int, rot_idx: int) -> tuple[int, int, int, int, int]:
    """Obraca współrzędne (x, z) o 0/90/180/270° do 4 widoków izometrycznych."""
    if rot_idx == 0:  # Widok SE (patrzymy na południe-wschód; zachód po lewej-górze)
        return x, y, z, sx, sz
    if rot_idx == 1:  # +90°
        return sz - 1 - z, y, x, sz, sx
    if rot_idx == 2:  # +180° (Widok NW — pokazuje tylne aleje, kopułę i ogród)
        return sx - 1 - x, y, sz - 1 - z, sx, sz
    # +270°
    return z, y, sx - 1 - x, sz, sx


def render_isometric_panel(
    blocks: dict[tuple[int, int, int], tuple[str, Any]],
    size: tuple[int, int, int],
    rot_idx: int,
    panel_w: int,
    panel_h: int,
    label: str,
    compass_hint: str,
) -> Image.Image:
    """Renderuje jeden wysokiej jakości panel 3D izometryczny z 2x supersamplingiem."""
    sx, sy, sz = size
    # Obrócona mapa bloków (pomijamy minecraft:air)
    rblocks: dict[tuple[int, int, int], str] = {}
    rsx, rsz = (sx, sz) if rot_idx in (0, 2) else (sz, sx)
    for (x, y, z), (nm, _) in blocks.items():
        if nm == "minecraft:air":
            continue
        rx, ry, rz, _, _ = _rotate_pos(x, y, z, sx, sz, rot_idx)
        rblocks[(rx, ry, rz)] = nm

    # Supersampling 2x dla gładkich krawędzi bez poszarpania
    ss = 2
    W, H = panel_w * ss, panel_h * ss
    img = _draw_sky_bg(W, H)
    draw = ImageDraw.Draw(img, "RGBA")

    # Wyznacz idealną skalę izometryczną mieszczącą bryłę z marginesem
    # W izometrii: u = (x - z) * tw, v = (x + z) * th - y * vh
    # Dla klasycznego 2:1 izometrycznego voxela: tw = s, th = 0.5*s, vh = 1.12*s
    span_u = (rsx + rsz)
    span_v = (rsx + rsz) * 0.5 + sy * 1.15
    margin_w = W * 0.94
    margin_h = (H - 84) * 0.92
    s = min(margin_w / max(1, span_u), margin_h / max(1, span_v))
    tw = s
    th = s * 0.5
    vh = s * 1.12

    # Oblicz bounding box rzutowanych punktów, aby idealnie wyśrodkować wyspę
    min_u, max_u = 1e9, -1e9
    min_v, max_v = 1e9, -1e9
    for (rx, ry, rz) in rblocks.keys():
        u = (rx - rz) * tw
        v = (rx + rz) * th - ry * vh
        if u < min_u:
            min_u = u
        if u > max_u:
            max_u = u
        if v < min_v:
            min_v = v
        if v > max_v:
            max_v = v

    off_x = W * 0.5 - (min_u + max_u) * 0.5
    off_y = (H + 64) * 0.5 - (min_v + max_v) * 0.5

    # Painter's algorithm: od tyłu (najmniejsze x+z, potem najmniejsze y) do przodu
    ordered = sorted(rblocks.items(), key=lambda kv: (kv[0][0] + kv[0][2], kv[0][1], kv[0][0]))

    def is_opaque(pos: tuple[int, int, int]) -> bool:
        nm = rblocks.get(pos)
        if not nm:
            return False
        if any(k in nm for k in ("glass", "water", "lantern", "torch", "chain", "bars", "wall_sign", "lightning_rod", "slab", "stairs", "wall", "fence")):
            return False
        return True

    for (rx, ry, rz), nm in ordered:
        # Culling niewidocznych bloków całkowicie zakrytych z 3 widocznych stron (+x, +y, +z)
        if is_opaque((rx + 1, ry, rz)) and is_opaque((rx, ry + 1, rz)) and is_opaque((rx, ry, rz + 1)):
            continue

        r, g, b, alpha, emissive = get_block_style(nm)
        cx = off_x + (rx - rz) * tw
        cy = off_y + (rx + rz) * th - ry * vh

        # Subtelna okluzja otoczenia (AO) na górnej ściance
        ao = 1.0
        for dx, dz in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            if is_opaque((rx + dx, ry + 1, rz + dz)):
                ao -= 0.06
        ao = max(0.76, ao)

        # Kształty specjalne (smukłe latarnie/słupki/półpłytki/schody/znaki)
        h_scale = 1.0
        w_scale = 1.0
        y_shift = 0.0
        if "slab" in nm or "catwalk" in nm:
            h_scale = 0.5
        elif "lantern" in nm or "torch" in nm or "lightning_rod" in nm or "chain" in nm or "bars" in nm:
            w_scale = 0.42
            h_scale = 0.72
            y_shift = 0.14 * vh
        elif "wall_sign" in nm:
            w_scale = 0.65
            h_scale = 0.55
            y_shift = 0.2 * vh
        elif "wall" in nm or "girder" in nm:
            w_scale = 0.72
        elif "coinpile" in nm:
            w_scale = 0.75
            h_scale = 0.35

        btw = tw * w_scale
        bth = th * w_scale
        bvh = vh * h_scale
        base_y = cy + (vh - bvh) - y_shift

        # 6 wierzchołków kostki izometrycznej
        p_top = (cx, base_y - bvh)
        p_tr = (cx + btw, base_y - bvh + bth)
        p_tc = (cx, base_y - bvh + 2 * bth)
        p_tl = (cx - btw, base_y - bvh + bth)
        p_br = (cx + btw, base_y + bth)
        p_bc = (cx, base_y + 2 * bth)
        p_bl = (cx - btw, base_y + bth)

        # Kolory 3 ścian: góra (jasna), lewa (średnia), prawa (cień)
        if nm == "minecraft:grass_block":
            top_c = (*_shade((98, 164, 66), 1.06 * ao, emissive), alpha)
            left_c = (*_shade((134, 96, 67), 0.86, 0.0), alpha)
            right_c = (*_shade((134, 96, 67), 0.70, 0.0), alpha)
        elif nm == "lightmanscurrency:terminal":
            top_c = (*_shade((74, 86, 102), 1.05, 0.1), alpha)
            left_c = (*_shade((52, 224, 248), 1.0, 0.65), alpha)
            right_c = (*_shade((62, 74, 90), 0.78, 0.1), alpha)
        elif nm == "lightmanscurrency:atm":
            top_c = (*_shade((58, 72, 82), 1.05, 0.1), alpha)
            left_c = (*_shade((56, 214, 178), 1.0, 0.55), alpha)
            right_c = (*_shade((48, 64, 72), 0.82, 0.1), alpha)
        else:
            top_c = (*_shade((r, g, b), 1.06 * ao, emissive), alpha)
            left_c = (*_shade((r, g, b), 0.84, emissive), alpha)
            right_c = (*_shade((r, g, b), 0.68, emissive), alpha)

        outline = (*_shade((r, g, b), 0.46, 0.0), min(220, alpha)) if s >= 10 else None

        # Rysowanie ścian (góra, lewa, prawa)
        draw.polygon([p_top, p_tr, p_tc, p_tl], fill=top_c, outline=outline)
        draw.polygon([p_tl, p_tc, p_bc, p_bl], fill=left_c, outline=outline)
        draw.polygon([p_tc, p_tr, p_br, p_bc], fill=right_c, outline=outline)

        # Delikatna zielona krawędź darni na grass_block
        if nm == "minecraft:grass_block":
            strip_h = bvh * 0.26
            draw.polygon(
                [p_tl, p_tc, (p_tc[0], p_tc[1] + strip_h), (p_tl[0], p_tl[1] + strip_h)],
                fill=(*_shade((98, 164, 66), 0.90), 255),
            )
            draw.polygon(
                [p_tc, p_tr, (p_tr[0], p_tr[1] + strip_h), (p_tc[0], p_tc[1] + strip_h)],
                fill=(*_shade((98, 164, 66), 0.74), 255),
            )

    # Downsample 2x -> 1x (LANCZOS antyaliasing)
    out = img.resize((panel_w, panel_h), Image.Resampling.LANCZOS)
    odraw = ImageDraw.Draw(out, "RGBA")
    # Pasek etykiety u góry panelu
    odraw.rectangle([0, 0, panel_w, 34], fill=(12, 18, 30, 195))
    odraw.text((14, 8), label, fill=(242, 246, 255, 255), font=_get_font(15))
    odraw.text((panel_w - 230, 10), compass_hint, fill=(182, 204, 232, 255), font=_get_font_regular(12))
    odraw.rectangle([0, 0, panel_w - 1, panel_h - 1], outline=(78, 106, 146, 180), width=1)
    return out


def render_topdown_panel(
    blocks: dict[tuple[int, int, int], tuple[str, Any]],
    size: tuple[int, int, int],
    panel_w: int,
    panel_h: int,
    label: str,
) -> Image.Image:
    """Renderuje wyraźny rzut z góry (plan architektoniczny) z cieniami wysokości."""
    sx, sy, sz = size
    img = _draw_sky_bg(panel_w, panel_h)
    draw = ImageDraw.Draw(img, "RGBA")

    # Najwyższy niepowietrzny blok w każdej kolumnie (x, z)
    top_map: dict[tuple[int, int], tuple[int, str]] = {}
    for (x, y, z), (nm, _) in blocks.items():
        if nm == "minecraft:air":
            continue
        prev = top_map.get((x, z))
        if prev is None or y > prev[0]:
            top_map[(x, z)] = (y, nm)

    cell = min((panel_w - 80) / max(1, sx), (panel_h - 90) / max(1, sz))
    ox = (panel_w - sx * cell) * 0.5
    oy = 46 + (panel_h - 62 - sz * cell) * 0.5

    for (x, z), (y, nm) in top_map.items():
        r, g, b, _, em = get_block_style(nm)
        # Delikatne cieniowanie wg wysokości y (wyższe dachy jaśniejsze)
        hf = 0.78 + 0.30 * (y / max(1, sy - 1))
        # Cień od wyższego sąsiada na NW
        nw = top_map.get((x - 1, z - 1))
        if nw and nw[0] > y:
            hf *= 0.82
        col = (*_shade((r, g, b), hf, em), 255)
        x0 = ox + x * cell
        y0 = oy + z * cell
        draw.rectangle([x0, y0, x0 + cell, y0 + cell], fill=col, outline=(24, 30, 42, 60))

    # Kierunki świata (N/E/S/W)
    f_comp = _get_font(13)
    draw.text((panel_w // 2 - 22, 38), "▲ N (-Z)", fill=(230, 238, 250, 230), font=f_comp)
    draw.text((panel_w // 2 - 22, panel_h - 22), "▼ S (+Z)", fill=(230, 238, 250, 230), font=f_comp)
    draw.text((10, panel_h // 2 - 6), "◀ W (-X)", fill=(230, 238, 250, 230), font=f_comp)
    draw.text((panel_w - 68, panel_h // 2 - 6), "E (+X) ▶", fill=(230, 238, 250, 230), font=f_comp)

    draw.rectangle([0, 0, panel_w, 34], fill=(12, 18, 30, 195))
    draw.text((14, 8), label, fill=(242, 246, 255, 255), font=_get_font(15))
    draw.rectangle([0, 0, panel_w - 1, panel_h - 1], outline=(78, 106, 146, 180), width=1)
    return img


def render_island_sheet(
    nbt_path: Path,
    out_png: Path,
    title: str,
    subtitle: str,
) -> dict[str, Any]:
    """Tworzy arkusz 2x2 (1800x1260 px) z 3 kątami izometrycznymi 3D + rzutem z góry."""
    root = decode_nbt_gzip(nbt_path.read_bytes())
    size, pal, blocks = _index_blocks(root, vanilla_only=False)

    pw, ph = 880, 580
    header_h = 74
    gap = 12
    sheet_w = pw * 2 + gap * 3
    sheet_h = ph * 2 + gap * 3 + header_h

    sheet = Image.new("RGBA", (sheet_w, sheet_h), (14, 20, 32, 255))
    sdraw = ImageDraw.Draw(sheet)

    # Nagłówek arkusza
    sdraw.rectangle([0, 0, sheet_w, header_h], fill=(18, 26, 42, 255))
    sdraw.line([(0, header_h - 1), (sheet_w, header_h - 1)], fill=(214, 172, 74, 255), width=2)
    sdraw.text((22, 12), title, fill=(250, 224, 134, 255), font=_get_font(22))
    stats = f"{subtitle}   |   Wymiary: {size[0]}×{size[1]}×{size[2]}   |   Bloki: {len(blocks):,}   |   Paleta: {len(pal)}"
    sdraw.text((22, 44), stats, fill=(196, 212, 234, 255), font=_get_font_regular(14))

    p0 = render_isometric_panel(blocks, size, 0, pw, ph, "1. Widok 3D — Południowo-Wschodni (Hero)", "Kąt główny 0°")
    p1 = render_isometric_panel(blocks, size, 1, pw, ph, "2. Widok 3D — Południowo-Zachodni", "Obrót +90°")
    p2 = render_isometric_panel(blocks, size, 2, pw, ph, "3. Widok 3D — Północno-Zachodni", "Obrót +180° (tył / boki)")
    p3 = render_topdown_panel(blocks, size, pw, ph, "4. Rzut z góry — Plan Architektoniczny (N/E/S/W)")

    sheet.paste(p0, (gap, header_h + gap))
    sheet.paste(p1, (gap * 2 + pw, header_h + gap))
    sheet.paste(p2, (gap, header_h + gap * 2 + ph))
    sheet.paste(p3, (gap * 2 + pw, header_h + gap * 2 + ph))

    out_png.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(out_png, format="PNG", optimize=True)
    print(f"🖼️  Wyrenderowano {out_png.relative_to(REPO_ROOT)} ({sheet_w}×{sheet_h}, {out_png.stat().st_size // 1024} KB)")

    # Przygotuj kompaktowe dane wokselowe (tylko widoczne bloki!) pod interaktywny viewer 3D HTML
    opaque_set = {
        pos
        for pos, (nm, _) in blocks.items()
        if nm != "minecraft:air"
        and not any(k in nm for k in ("glass", "water", "lantern", "torch", "chain", "bars", "wall_sign", "lightning_rod", "slab", "stairs", "wall", "fence"))
    }
    palette_colors: list[list[int]] = []
    color_idx: dict[tuple[int, int, int, int], int] = {}
    voxels: list[list[int]] = []
    for (x, y, z), (nm, _) in blocks.items():
        if nm == "minecraft:air":
            continue
        # Pomiń całkowicie zakryte wnętrze skały (6 sąsiadów nieprzezroczystych)
        if (
            (x + 1, y, z) in opaque_set
            and (x - 1, y, z) in opaque_set
            and (x, y + 1, z) in opaque_set
            and (x, y - 1, z) in opaque_set
            and (x, y, z + 1) in opaque_set
            and (x, y, z - 1) in opaque_set
        ):
            continue
        r, g, b, a, _ = get_block_style(nm)
        key = (r, g, b, a)
        if key not in color_idx:
            color_idx[key] = len(palette_colors)
            palette_colors.append([r, g, b, a])
        voxels.append([x, y, z, color_idx[key]])

    return {
        "title": title,
        "subtitle": subtitle,
        "size": list(size),
        "totalBlocks": len(blocks),
        "palette": palette_colors,
        "voxels": voxels,
    }


def write_interactive_html(islands_payload: dict[str, Any], out_html: Path) -> None:
    """Generuje samodzielny (zero CDN!) interaktywny viewer 3D HTML z obrotem 360° i suwakiem Y."""
    data_json = json.dumps(islands_payload, separators=(",", ":"), ensure_ascii=False)
    html = f"""<!DOCTYPE html>
<html lang="pl">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>HalucynacjeGTP2 — Interaktywny Podgląd 3D Wysp (.nbt)</title>
<style>
  :root {{ --bg:#0d1422; --panel:#152036; --border:#2b3e62; --gold:#f5cf6b; --text:#e8effa; --muted:#9ab0d0; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif; background:var(--bg); color:var(--text); height:100vh; display:flex; flex-direction:column; overflow:hidden; }}
  header {{ display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:10px; padding:10px 16px; background:var(--panel); border-bottom:1px solid var(--border); }}
  .brand {{ font-weight:700; color:var(--gold); font-size:15px; }}
  .tabs {{ display:flex; gap:6px; flex-wrap:wrap; }}
  button {{ background:#1d2c4a; color:var(--text); border:1px solid var(--border); padding:6px 12px; border-radius:6px; cursor:pointer; font-weight:600; font-size:13px; }}
  button.active {{ background:var(--gold); color:#111827; border-color:var(--gold); }}
  button:hover:not(.active) {{ background:#263a60; }}
  .controls {{ display:flex; align-items:center; gap:12px; font-size:12px; color:var(--muted); flex-wrap:wrap; }}
  label {{ display:flex; align-items:center; gap:6px; }}
  input[type=range] {{ accent-color:var(--gold); }}
  main {{ flex:1; position:relative; }}
  canvas {{ width:100%; height:100%; display:block; cursor:grab; }}
  canvas:active {{ cursor:grabbing; }}
  .hud {{ position:absolute; left:14px; bottom:14px; background:rgba(13,20,34,.85); border:1px solid var(--border); border-radius:8px; padding:10px 12px; font-size:12px; line-height:1.45; max-width:420px; pointer-events:none; }}
  .hud b {{ color:var(--gold); }}
</style>
</head>
<body>
<header>
  <div class="brand">HalucynacjeGTP2 — Podgląd 3D Wysp (.nbt)</div>
  <div class="tabs">
    <button id="btn-market" class="active">Wielka Wyspa-Rynek (45×25×35)</button>
    <button id="btn-industrial">Huta Południowa (33×21×33)</button>
    <button id="btn-starter">Wyspa Startowa (15×13×15)</button>
  </div>
  <div class="controls">
    <label>Przekrój Y: <input id="sliceY" type="range" min="1" max="25" value="25" /><span id="sliceYVal">25</span></label>
    <label>Zoom: <input id="zoom" type="range" min="40" max="220" value="100" /></label>
    <button id="btn-reset">Reset kamery</button>
  </div>
</header>
<main>
  <canvas id="cv"></canvas>
  <div class="hud" id="hud"></div>
</main>
<script>
const ISLANDS = {data_json};
const cv = document.getElementById('cv');
const ctx = cv.getContext('2d');
const hud = document.getElementById('hud');
const sliceInput = document.getElementById('sliceY');
const sliceVal = document.getElementById('sliceYVal');
const zoomInput = document.getElementById('zoom');

let currentKey = 'market';
let yaw = -0.68;
let pitch = 0.56;
let zoom = 1.0;
let dragging = false, lx = 0, ly = 0;

function selectIsland(key) {{
  currentKey = key;
  document.querySelectorAll('.tabs button').forEach(b => b.classList.remove('active'));
  document.getElementById('btn-' + key).classList.add('active');
  const isl = ISLANDS[key];
  sliceInput.max = isl.size[1];
  sliceInput.value = isl.size[1];
  sliceVal.textContent = isl.size[1];
  draw();
}}

document.getElementById('btn-market').onclick = () => selectIsland('market');
document.getElementById('btn-industrial').onclick = () => selectIsland('industrial');
document.getElementById('btn-starter').onclick = () => selectIsland('starter');
document.getElementById('btn-reset').onclick = () => {{ yaw = -0.68; pitch = 0.56; zoom = 1.0; zoomInput.value = 100; draw(); }};
sliceInput.oninput = () => {{ sliceVal.textContent = sliceInput.value; draw(); }};
zoomInput.oninput = () => {{ zoom = Number(zoomInput.value) / 100; draw(); }};

cv.addEventListener('pointerdown', e => {{ dragging = true; lx = e.clientX; ly = e.clientY; cv.setPointerCapture(e.pointerId); }});
cv.addEventListener('pointerup', () => {{ dragging = false; }});
cv.addEventListener('pointermove', e => {{
  if (!dragging) return;
  yaw += (e.clientX - lx) * 0.008;
  pitch = Math.max(0.12, Math.min(1.42, pitch + (e.clientY - ly) * 0.006));
  lx = e.clientX; ly = e.clientY;
  draw();
}});
cv.addEventListener('wheel', e => {{
  e.preventDefault();
  zoom = Math.max(0.4, Math.min(2.4, zoom * (e.deltaY > 0 ? 0.92 : 1.08)));
  zoomInput.value = Math.round(zoom * 100);
  draw();
}}, {{ passive: false }});

function resize() {{
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cv.width = Math.floor(cv.clientWidth * dpr);
  cv.height = Math.floor(cv.clientHeight * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  draw();
}}
window.addEventListener('resize', resize);

function shade(c, f) {{
  return `rgba(${{Math.min(255,Math.round(c[0]*f))}},${{Math.min(255,Math.round(c[1]*f))}},${{Math.min(255,Math.round(c[2]*f))}},${{(c[3]/255).toFixed(2)}})`;
}}

function draw() {{
  const W = cv.clientWidth, H = cv.clientHeight;
  if (!W || !H) return;
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#131d33'); g.addColorStop(1, '#2b4266');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  const isl = ISLANDS[currentKey];
  const [sx, sy, sz] = isl.size;
  const cx = sx / 2, cy = sy / 2, cz = sz / 2;
  const maxY = Number(sliceInput.value);
  const cyaw = Math.cos(yaw), syaw = Math.sin(yaw);
  const cp = Math.cos(pitch), sp = Math.sin(pitch);
  const scale = (Math.min(W, H) / (Math.max(sx, sz) * 1.45)) * zoom;

  const projected = [];
  for (let i = 0; i < isl.voxels.length; i++) {{
    const v = isl.voxels[i];
    if (v[1] >= maxY) continue;
    const dx = v[0] - cx, dy = v[1] - cy, dz = v[2] - cz;
    const rx = dx * cyaw - dz * syaw;
    const rz = dx * syaw + dz * cyaw;
    const ry = dy * cp - rz * sp;
    const depth = dy * sp + rz * cp;
    projected.push([depth, W * 0.5 + rx * scale, H * 0.54 - ry * scale, v[3]]);
  }}
  projected.sort((a, b) => a[0] - b[0]);

  const r = Math.max(1.5, scale * 0.62);
  const h = r * 1.05;
  for (let i = 0; i < projected.length; i++) {{
    const [, px, py, ci] = projected[i];
    const col = isl.palette[ci];
    // Top face
    ctx.fillStyle = shade(col, 1.06);
    ctx.beginPath();
    ctx.moveTo(px, py - h);
    ctx.lineTo(px + r, py - h * 0.45);
    ctx.lineTo(px, py + h * 0.1);
    ctx.lineTo(px - r, py - h * 0.45);
    ctx.closePath();
    ctx.fill();
    // Left face
    ctx.fillStyle = shade(col, 0.82);
    ctx.beginPath();
    ctx.moveTo(px - r, py - h * 0.45);
    ctx.lineTo(px, py + h * 0.1);
    ctx.lineTo(px, py + h * 0.95);
    ctx.lineTo(px - r, py + h * 0.4);
    ctx.closePath();
    ctx.fill();
    // Right face
    ctx.fillStyle = shade(col, 0.65);
    ctx.beginPath();
    ctx.moveTo(px + r, py - h * 0.45);
    ctx.lineTo(px, py + h * 0.1);
    ctx.lineTo(px, py + h * 0.95);
    ctx.lineTo(px + r, py + h * 0.4);
    ctx.closePath();
    ctx.fill();
  }}

  hud.innerHTML = `<b>${{isl.title}}</b><br>${{isl.subtitle}}<br>Wymiary: <b>${{sx}}×${{sy}}×${{sz}}</b> | Bloki: <b>${{isl.totalBlocks.toLocaleString('pl-PL')}}</b> | Sterowanie: przeciągnij myszką (obrót 360°), scroll (zoom), suwak Y (przekrój wnętrza).`;
}}

resize();
selectIsland('market');
</script>
</body>
</html>
"""
    out_html.parent.mkdir(parents=True, exist_ok=True)
    out_html.write_text(html, encoding="utf-8")
    print(f"🌐 Wygenerowano interaktywny podgląd 3D: {out_html.relative_to(REPO_ROOT)} ({out_html.stat().st_size // 1024} KB)")


def _crop_blocks(
    blocks: dict[tuple[int, int, int], tuple[str, Any]],
    x0: int,
    x1: int,
    y0: int,
    y1: int,
    z0: int,
    z1: int,
) -> tuple[dict[tuple[int, int, int], tuple[str, Any]], tuple[int, int, int]]:
    """Wycina fragment bryły (zbliżenie lub przekrój wnętrza) i przesuwa do (0,0,0)."""
    out: dict[tuple[int, int, int], tuple[str, Any]] = {}
    for (x, y, z), val in blocks.items():
        if x0 <= x <= x1 and y0 <= y <= y1 and z0 <= z <= z1:
            out[(x - x0, y - y0, z - z0)] = val
    return out, (x1 - x0 + 1, y1 - y0 + 1, z1 - z0 + 1)


def render_closeup_sheet(
    out_png: Path,
    title: str,
    subtitle: str,
    panels: list[Image.Image],
) -> None:
    """Składa 4 panele zbliżeń/przekrojów w jeden arkusz 2x2 (1796x1270)."""
    pw, ph = 880, 580
    header_h = 74
    gap = 12
    sheet_w = pw * 2 + gap * 3
    sheet_h = ph * 2 + gap * 3 + header_h

    sheet = Image.new("RGBA", (sheet_w, sheet_h), (14, 20, 32, 255))
    sdraw = ImageDraw.Draw(sheet)
    sdraw.rectangle([0, 0, sheet_w, header_h], fill=(18, 26, 42, 255))
    sdraw.line([(0, header_h - 1), (sheet_w, header_h - 1)], fill=(214, 172, 74, 255), width=2)
    sdraw.text((22, 12), title, fill=(250, 224, 134, 255), font=_get_font(22))
    sdraw.text((22, 44), subtitle, fill=(196, 212, 234, 255), font=_get_font_regular(14))

    positions = [
        (gap, header_h + gap),
        (gap * 2 + pw, header_h + gap),
        (gap, header_h + gap * 2 + ph),
        (gap * 2 + pw, header_h + gap * 2 + ph),
    ]
    for img, pos in zip(panels, positions):
        sheet.paste(img, pos)

    out_png.parent.mkdir(parents=True, exist_ok=True)
    sheet.convert("RGB").save(out_png, format="PNG", optimize=True)
    print(f"🔍 Wyrenderowano zbliżenia/wnętrza {out_png.relative_to(REPO_ROOT)} ({sheet_w}×{sheet_h}, {out_png.stat().st_size // 1024} KB)")


def main() -> int:
    renders_dir = REPO_ROOT / "docs/renders"
    payload = {}

    starter_path = REPO_ROOT / "config/skyblockbuilder/templates/islands/starter_island.nbt"
    market_path = REPO_ROOT / "config/skyblockbuilder/templates/spreads/market_island.nbt"
    industrial_path = REPO_ROOT / "config/skyblockbuilder/templates/spreads/industrial_island.nbt"

    payload["starter"] = render_island_sheet(
        starter_path,
        renders_dir / "starter_island_3d.png",
        "Wyspa Startowa (starter_island.nbt)",
        "Spawn (0, 65, 0) patrząc na Wschód • Pirs Wschodni • Skrzynia anty-softlock • Cobble-Gen",
    )
    payload["market"] = render_island_sheet(
        market_path,
        renders_dir / "market_island_3d.png",
        "Wielka Wyspa-Rynek (market_island.nbt)",
        "Środek (152, 64, 0) • Hala Dworca • Rotunda z Terminalem LC • 8 Butików • 3 ATM • Ogród",
    )
    payload["industrial"] = render_island_sheet(
        industrial_path,
        renders_dir / "industrial_island_3d.png",
        "Huta Południowa (industrial_island.nbt)",
        "Środek (0, 64, 152) • 4 Hale 11×11 • Suwnica Bramowa • Komin • Dyspozytornia z Terminalem",
    )

    # Arkusze zbliżeń i przekrojów wnętrz (Issue #35 — feedback użytkownika)
    m_size, _, m_blocks = _index_blocks(decode_nbt_gzip(market_path.read_bytes()), vanilla_only=False)
    i_size, _, i_blocks = _index_blocks(decode_nbt_gzip(industrial_path.read_bytes()), vanilla_only=False)

    pw, ph = 880, 580

    # 1. Zbliżenia i wnętrza Wielkiej Wyspy-Rynku
    m_station_b, m_station_s = _crop_blocks(m_blocks, 0, 14, 6, 22, 6, 28)
    m_rotunda_b, m_rotunda_s = _crop_blocks(m_blocks, 10, 35, 8, 13, 10, 24)
    m_boutiques_n_b, m_boutiques_n_s = _crop_blocks(m_blocks, 8, 37, 8, 11, 1, 12)
    m_garden_s_b, m_garden_s_s = _crop_blocks(m_blocks, 22, 44, 7, 17, 13, 34)

    render_closeup_sheet(
        renders_dir / "market_island_closeups_3d.png",
        "Wielka Wyspa-Rynek — Zbliżenia i Przekroje Wnętrz (market_island.nbt)",
        "Dworzec Kolejowy • Przekrój Rotundy (Terminal LC + 3 ATM) • Wnętrza Butików #1–#4 + Estakada • Ogród i Butiki #5–#8",
        [
            render_isometric_panel(m_station_b, m_station_s, 2, pw, ph, "1. Zbliżenie: Hala Dworca Zachodniego + Hypertube & Waystone", "Wjazd kolejowy (oś Z=0)"),
            render_isometric_panel(m_rotunda_b, m_rotunda_s, 0, pw, ph, "2. Przekrój wnętrza: Centralna Rotunda (Terminal LC) & Kioski ATM", "Dach zdjęty (y <= 13)"),
            render_isometric_panel(m_boutiques_n_b, m_boutiques_n_s, 0, pw, ph, "3. Przekrój wnętrz: Butiki #1–#4 (Piekarnia–Mechanika) + Aleja Create", "Parter bez piętra (y <= 11)"),
            render_isometric_panel(m_garden_s_b, m_garden_s_s, 1, pw, ph, "4. Zbliżenie: Fontanna, Ogród Azalii & Południowe Butiki #5–#8", "Widok SE z tarasem"),
        ],
    )

    # 2. Zbliżenia i wnętrza Huty Południowej + Plan parteru Rynku
    i_dock_b, i_dock_s = _crop_blocks(i_blocks, 6, 23, 5, 19, 0, 12)
    i_cabin_b, i_cabin_s = _crop_blocks(i_blocks, 22, 31, 6, 9, 1, 11)
    i_ne_b, i_ne_s = _crop_blocks(i_blocks, 11, 32, 5, 20, 0, 15)
    m_floor_b, m_floor_s = _crop_blocks(m_blocks, 0, m_size[0] - 1, 8, 10, 0, m_size[2] - 1)

    render_closeup_sheet(
        renders_dir / "industrial_island_closeups_3d.png",
        "Huta Południowa — Zbliżenia i Wnętrza + Plan Parteru Rynku",
        "Suwnica i Plac Kontenerów • Przekrój Dyspozytorni (Terminal LC + Zbiornik) • Komin z Dymem • Plan Wnętrz Parteru Rynku",
        [
            render_isometric_panel(i_dock_b, i_dock_s, 2, pw, ph, "1. Zbliżenie: Północny Dok Kolejowy, Suwnica & Kontenery", "Wjazd kolejowy (oś X=0)"),
            render_isometric_panel(i_cabin_b, i_cabin_s, 0, pw, ph, "2. Przekrój wnętrza: Dyspozytornia (Terminal LC) + Zbiornik + Komin", "Dach zdjęty (y <= 9)"),
            render_isometric_panel(i_ne_b, i_ne_s, 1, pw, ph, "3. Zbliżenie: Pełna sylwetka Komina, Zbiornika i Suwnicy Bramowej", "Widok przemysłowy NE"),
            render_topdown_panel(m_floor_b, m_floor_s, pw, ph, "4. Rzut wnętrz parteru Wielkiej Wyspy-Rynku (przekrój Y = 64..66)"),
        ],
    )

    write_interactive_html(payload, renders_dir / "island_viewer_3d.html")
    return 0


if __name__ == "__main__":
    sys.exit(main())
