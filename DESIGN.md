# Design System - HomeDashboard

## Product Context
- **What this is:** A shared household operations dashboard that tracks recurring bills, monthly and yearly home cost, and home upgrades.
- **Who it's for:** A couple managing their first home together.
- **Space/industry:** Personal finance + home operations.
- **Project type:** Web app dashboard.

## Aesthetic Direction
- **Direction:** Warm editorial control room.
- **Decoration level:** Intentional.
- **Mood:** Calm, trustworthy, and personal. It should feel like a serious money tool that still belongs to a real household, not a corporate portal.
- **Reference sites:** YNAB, Monarch Money, Copilot Money, Rocket Money, HomeZada.

## Typography
- **Display/Hero:** Fraunces, used for section headers and top-level moments.
- **Body:** Instrument Sans, used for all body copy and UI controls.
- **UI/Labels:** Instrument Sans, medium and semibold weights.
- **Data/Tables:** IBM Plex Mono with tabular numerals for stable amounts and dates.
- **Code:** IBM Plex Mono.
- **Loading:** Google Fonts links for Fraunces, Instrument Sans, IBM Plex Mono.
- **Scale:** xs 12px, sm 14px, base 16px, lg 20px, xl 24px, 2xl 32px.

## Color
- **Approach:** Balanced.
- **Primary:** `#C65D3A` (terracotta accent for high-priority actions and highlights).
- **Secondary:** `#2C6E9B` (informational emphasis and supporting highlights).
- **Neutrals:** `#F6F2E9` (app background), `#FFFDF8` (surface), `#1F2430` (text), `#6B7280` (muted text).
- **Semantic:** success `#2F7D5A`, warning `#B7791F`, error `#B23A48`, info `#2C6E9B`.
- **Dark mode:** Shift to deep charcoal surfaces, preserve hierarchy, and reduce saturation by about 10% for comfort.

## Spacing
- **Base unit:** 8px.
- **Density:** Comfortable.
- **Scale:** 2xs(2), xs(4), sm(8), md(16), lg(24), xl(32), 2xl(48), 3xl(64).

## Layout
- **Approach:** Hybrid.
- **Grid:** 12-column desktop, 6-column tablet, 4-column mobile.
- **Max content width:** 1200px.
- **Border radius:** sm 6px, md 10px, lg 14px, full 9999px.

## Motion
- **Approach:** Intentional.
- **Easing:** enter ease-out, exit ease-in, move ease-in-out.
- **Duration:** micro 80ms, short 180ms, medium 280ms, long 480ms.

## Decisions Log
| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-04-18 | Adopt warm editorial dashboard style | Keeps financial clarity while making daily household use feel personal and owned. |
| 2026-04-18 | Use Fraunces + Instrument Sans + IBM Plex Mono | Creates clear hierarchy and better data scan stability. |
| 2026-04-18 | Terracotta accent with warm paper neutrals | Distinguishes from generic fintech blue and reinforces home-oriented tone. |
