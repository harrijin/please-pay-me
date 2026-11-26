# PleasePayMe

A zero-backend, zero-database, privacy-first receipt-splitting Progressive Web App (PWA) built with Vite, React, TypeScript, and Vanilla CSS — hosted for **$0** on GitHub Pages.

**Live App:** [https://harrijin.github.io/please-pay-me/](https://harrijin.github.io/please-pay-me/)

## Features

1. **Capture, Upload, Sample, or Manual Entry**
   - Snap a receipt directly with your phone's rear camera, upload from your gallery, try the built-in *Marigold Bistro* sample receipt, or enter items manually.
   - Recent splits are automatically saved locally in `localStorage`.
2. **Privacy Crop & Blackout (Always Before Scanning)**
   - Touch- and mouse-friendly draggable crop handles, **Rotate 90°**, **Reset**, and opaque **Blackout** redaction rectangles with **Undo**.
   - Only the cropped, redacted JPEG (max `1600px`, quality `0.88`) is sent to Gemini — the original photo never leaves your device.
3. **Free Gemini Receipt Scanner**
   - Bring your own free [Google AI Studio](https://aistudio.google.com/apikey) API key (stored exclusively in `localStorage`, never included in shared links).
   - Defaults to `gemini-3.5-flash-lite` with options for `gemini-3.6-flash`, `gemini-2.5-flash-lite`, or any custom model ID, plus a **Test Key** button.
4. **Exact-Cent Item Splitting**
   - Multi-way person pills, **All** split toggle, **Split ×N** helper for multi-quantity lines, custom share weights, tax/tip presets (15/18/20/25%), extra fees, discounts, and proportional vs. even tax/tip allocation.
   - Uses largest-remainder (Hamilton) integer-cent rounding so shares always sum to the exact penny.
5. **Zero-DB Shareable Breakdowns & Table-Side QR Codes**
   - Compresses each friend's itemized breakdown into a URL hash (`#s=<lz-string>`) so opening the link shows a clean receipt ticket with one-tap payment buttons — no database required.
   - Supports **Venmo** (`pay` and host `charge` links), **Cash App**, **PayPal.Me**, and **Zelle** (one-tap copy handle & amount).
   - Toggle QR & Share destination between the **Breakdown Page** and **Direct to Venmo / Cash App / PayPal**, cycle across friends in a high-contrast **QR Modal**, or hand off via **Quick Share / AirDrop** (`navigator.share`).

## Development

```bash
npm install
npm run dev
npm test
npm run build
```
