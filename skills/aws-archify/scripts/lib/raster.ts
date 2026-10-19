// Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: MIT-0
// Helpers shared by the PNG tools: Python-style rounding, white canvases and image loading.
import { createCanvas, loadImage } from "@napi-rs/canvas";
import type { Canvas, Image, SKRSContext2D } from "@napi-rs/canvas";

// Python's round(): a value halfway between two neighbours goes to the even one. These tools began as Python
// scripts, and their sizes and scores still follow Python's rounding.
export function roundHalfEven(value: number, digits = 0): number {
  const scale = Math.pow(10, digits);
  const scaled = value * scale;
  const below = Math.floor(scaled);
  const isHalf = Math.abs(scaled - below - 0.5) < 1e-9;
  const rounded = isHalf ? (below % 2 === 0 ? below : below + 1) : Math.round(scaled);
  return rounded / scale;
}

export function whiteCanvas(width: number, height: number): { canvas: Canvas; ctx: SKRSContext2D } {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, width, height);
  return { canvas, ctx };
}

export interface ScaledImage {
  image: Image;
  width: number;
  height: number;
}

// The image with the size it takes when scaled to `width`, keeping its aspect ratio.
export async function loadAtWidth(path: string, width: number): Promise<ScaledImage> {
  const image = await loadImage(path);
  return { image, width, height: roundHalfEven((image.height * width) / image.width) };
}

export interface RgbImage {
  rgb: Buffer;
  width: number;
  height: number;
}

// Three bytes per pixel. The image is drawn onto white first, so transparent pixels read as white rather than
// as whatever colour they carry underneath (PIL's convert("RGB") would keep that colour).
export async function loadRgb(path: string): Promise<RgbImage> {
  const image = await loadImage(path);
  const { width, height } = image;
  const { ctx } = whiteCanvas(width, height);
  ctx.drawImage(image, 0, 0);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  const rgb = Buffer.alloc(width * height * 3);
  for (let from = 0, to = 0; from < rgba.length; from += 4, to += 3) {
    rgb[to] = rgba[from];
    rgb[to + 1] = rgba[from + 1];
    rgb[to + 2] = rgba[from + 2];
  }
  return { rgb, width, height };
}
