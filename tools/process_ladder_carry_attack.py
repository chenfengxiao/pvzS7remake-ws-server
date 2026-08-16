#!/usr/bin/env python3
"""
Process ladder_carry_attack user-drawn sprite sheet using pure Python (no PIL/sharp):
1. Remove white background (make transparent)
2. Align/stabilize each frame's zombie position by centroid
3. Output PNG sprite sheet (will be converted to webp by build script)

Uses png reader/writer from zlib + struct only.
"""
import struct, zlib, os, sys

SRC = '/Users/chenfengxiao/.qwen/tmp/clipboard/clipboard-1785671444901-0.png'
DST_DIR = '/Users/chenfengxiao/OpenClawShare/chenxiling/PVZ-TS/S7/S7_气球仙人掌向日葵猫尾草修复_多文件可读版/S7_气球仙人掌向日葵猫尾草修复_多文件可读版/assets/final_runtime'

COLS = 5
ROWS = 4
TOTAL_FRAMES = 20
WHITE_THRESH = 240

def read_png(path):
    """Read RGBA PNG, return (width, height, pixels) where pixels is list of (r,g,b,a) tuples row-major"""
    with open(path, 'rb') as f:
        sig = f.read(8)
        assert sig == b'\x89PNG\r\n\x1a\n', "Not a PNG file"
        
        chunks = []
        while True:
            length_bytes = f.read(4)
            if len(length_bytes) < 4:
                break
            length = struct.unpack('>I', length_bytes)[0]
            ctype = f.read(4)
            data = f.read(length)
            crc = f.read(4)
            chunks.append((ctype, data))
            if ctype == b'IEND':
                break
        
        # Parse IHDR
        ihdr = [c for c in chunks if c[0] == b'IHDR'][0][1]
        w, h, bitdepth, colortype = struct.unpack('>IIBB', ihdr[:10])
        print(f"PNG: {w}x{h}, bitdepth={bitdepth}, colortype={colortype}")
        
        # Collect IDAT chunks
        idat_data = b''.join(c[1] for c in chunks if c[0] == b'IDAT')
        raw = zlib.decompress(idat_data)
        
        # Parse raw scanlines (filter byte + pixel data per row)
        bpp = 4 if colortype == 6 else 3  # RGBA or RGB
        stride = w * bpp
        
        pixels = []
        prev_line = bytes(stride)
        
        for y in range(h):
            filter_type = raw[y * (stride + 1)]
            scanline = bytearray(raw[y * (stride + 1) + 1: y * (stride + 1) + 1 + stride])
            
            # Undo filter
            if filter_type == 0:  # None
                pass
            elif filter_type == 1:  # Sub
                for i in range(bpp, stride):
                    scanline[i] = (scanline[i] + scanline[i - bpp]) & 0xFF
            elif filter_type == 2:  # Up
                for i in range(stride):
                    scanline[i] = (scanline[i] + prev_line[i]) & 0xFF
            elif filter_type == 3:  # Average
                for i in range(stride):
                    a = scanline[i - bpp] if i >= bpp else 0
                    b = prev_line[i]
                    scanline[i] = (scanline[i] + (a + b) // 2) & 0xFF
            elif filter_type == 4:  # Paeth
                for i in range(stride):
                    a = scanline[i - bpp] if i >= bpp else 0
                    b = prev_line[i]
                    c = prev_line[i - bpp] if i >= bpp else 0
                    p = a + b - c
                    pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                    if pa <= pb and pa <= pc:
                        pr = a
                    elif pb <= pc:
                        pr = b
                    else:
                        pr = c
                    scanline[i] = (scanline[i] + pr) & 0xFF
            
            prev_line = bytes(scanline)
            
            for x in range(w):
                off = x * bpp
                r, g, b = scanline[off], scanline[off+1], scanline[off+2]
                a = scanline[off+3] if bpp == 4 else 255
                pixels.append((r, g, b, a))
        
        return w, h, pixels

def write_png(path, w, h, pixels):
    """Write RGBA PNG from pixel list"""
    def make_chunk(ctype, data):
        c = ctype + data
        crc = struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)
        return struct.pack('>I', len(data)) + c + crc
    
    raw_rows = []
    for y in range(h):
        row = bytearray([0])  # filter type 0 (None)
        for x in range(w):
            r, g, b, a = pixels[y * w + x]
            row.extend([r, g, b, a])
        raw_rows.append(bytes(row))
    
    raw_data = b''.join(raw_rows)
    compressed = zlib.compress(raw_data)
    
    with open(path, 'wb') as f:
        f.write(b'\x89PNG\r\n\x1a\n')
        ihdr = struct.pack('>IIBBBB', w, h, 8, 6, 0, 0)  # 8-bit RGBA, deflate, filter adaptive
        f.write(make_chunk(b'IHDR', ihdr))
        f.write(make_chunk(b'IDAT', compressed))
        f.write(make_chunk(b'IEND', b''))

def main():
    print("Reading source PNG...")
    srcW, srcH, srcPixels = read_png(SRC)
    
    frameW = srcW // COLS
    frameH = srcH // ROWS
    print(f"Frame size: {frameW}x{frameH}")
    
    # Extract frames, remove white bg, find centroids
    frames = []  # each frame: list of (r,g,b,a) in frameW*frameH
    centroids = []
    
    for idx in range(TOTAL_FRAMES):
        row = idx // COLS
        col = idx % COLS
        
        frame_pixels = []
        sum_x, sum_y, count = 0, 0, 0
        
        for fy in range(frameH):
            for fx in range(frameW):
                sx = col * frameW + fx
                sy = row * frameH + fy
                r, g, b, a = srcPixels[sy * srcW + sx]
                
                # Remove white background
                if r >= WHITE_THRESH and g >= WHITE_THRESH and b >= WHITE_THRESH:
                    frame_pixels.append((0, 0, 0, 0))
                else:
                    frame_pixels.append((r, g, b, 255))
                    sum_x += fx
                    sum_y += fy
                    count += 1
        
        frames.append(frame_pixels)
        
        if count > 0:
            cx = sum_x / count
            cy = sum_y / count
        else:
            cx = frameW / 2
            cy = frameH / 2
        centroids.append((cx, cy, count))
        print(f"  Frame {idx}: centroid=({cx:.1f}, {cy:.1f}), pixels={count}")
    
    # Calculate reference centroid (average of valid frames)
    valid = [(c[0], c[1]) for c in centroids if c[2] > 0]
    ref_cx = sum(v[0] for v in valid) / len(valid)
    ref_cy = sum(v[1] for v in valid) / len(valid)
    print(f"\nReference centroid: ({ref_cx:.1f}, {ref_cy:.1f})")
    
    # Calculate offsets
    offsets = []
    for cx, cy, cnt in centroids:
        dx = round(ref_cx - cx)
        dy = round(ref_cy - cy)
        offsets.append((dx, dy))
        print(f"  Offset: ({dx}, {dy})")
    
    # Build output sprite sheet
    outW = frameW
    outH = frameH
    outSheetW = outW * COLS
    outSheetH = outH * ROWS
    outPixels = [(0, 0, 0, 0)] * (outSheetW * outSheetH)
    
    for idx in range(TOTAL_FRAMES):
        col = idx % COLS
        row = idx // COLS
        dx, dy = offsets[idx]
        
        for fy in range(outH):
            for fx in range(outW):
                src_fx = fx - dx
                src_fy = fy - dy
                
                dst_x = col * outW + fx
                dst_y = row * outH + fy
                dst_off = dst_y * outSheetW + dst_x
                
                if 0 <= src_fx < frameW and 0 <= src_fy < frameH:
                    outPixels[dst_off] = frames[idx][src_fy * frameW + src_fx]
                else:
                    outPixels[dst_off] = (0, 0, 0, 0)
    
    # Write PNG
    out_path = os.path.join(DST_DIR, 'ladder_carry_attack.png')
    print(f"\nWriting {outSheetW}x{outSheetH} to {out_path}...")
    write_png(out_path, outSheetW, outSheetH, outPixels)
    print("Done!")

if __name__ == '__main__':
    main()
