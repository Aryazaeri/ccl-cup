# CCL Cup - Future Requirements & Roadmap Notes

**Document Status:** Saved for Future Implementation Phases  
**Date:** 16 August 2026  
**Language Scope:** Phase 1 Default: English

---

## 🎯 Strategic Decisions & Clarifications

1. **Multi-Championship Hierarchy (Item 8):**
   * **Decision:** Yes. Support concurrent sub-tournaments within the same season (e.g., *Main Champions Cup*, *Challenge/Consolation Cup*, *Silver League*), each having its own distinct groups and knockout brackets.
2. **Live Streaming (Item 5):**
   * **Decision:** Link directly to external YouTube / broadcast link with a prominent **🔴 LIVE** badge/indicator (no need for embedded player).
3. **Player Photo & Flag Backdrop (Item 21):**
   * **Decision:** UI/CSS layered presentation placing the transparent/cutout player photograph over an aesthetic country/team flag backdrop on squad and player profile cards.

---

## 📋 Comprehensive Requirements Checklist

### 1. Public Portal & Showcase
- [ ] **Participant Country Flags & Information (Homepage):**
  * Display participating teams/companies along with their country/city flags and club details on the homepage.
- [ ] **Editable Participant Grid (Euro Business Cup Style):**
  * Reference: [eurobusinesscup.com/home-en](https://eurobusinesscup.com/home-en)
  * Visual interactive grid of participating clubs/countries with flags, company badges, and clickable squad profiles.
- [ ] **Tournament Architecture & Layout (Euro Business Cup Style):**
  * Reference: [eurobusinesscup.com/season-2353/home-en](https://eurobusinesscup.com/season-2353/home-en)
  * Season switcher, multi-tier tournament header, group tables, knockout brackets, top scorers list, and match center.
- [ ] **About Us Section:**
  * Dedicated section for tournament history, organization background, tournament rules, venue details, and vision.
- [ ] **Social Media & WhatsApp Contact:**
  * Floating WhatsApp direct-chat button and links to official channels (Instagram, YouTube, LinkedIn, X).
- [ ] **Live Match Outbound Links:**
  * Match operators/admins can enter a live stream URL; matches in progress show a pulsing **🔴 LIVE** badge that routes users directly to YouTube.
- [ ] **Featured Headline News / Lead Story Format:**
  * High-impact hero editorial layout with cover photography and match highlights.
- [ ] **Public Feedback & Comments:**
  * Public comment/feedback submission with administrative moderation (approve, reject, delete).

---

### 2. Competition & Tournament Engine
- [ ] **Multi-Format / Multi-Championship Concurrency:**
  * Run different tournament formats concurrently in the same season (e.g., *Champions Cup*, *Challenge Cup*, *Knockout Brackets*).
- [ ] **Dynamic League / Multi-Group Tables:**
  * If a competition has only **1 group**, render it as a single standard **League Table**.
  * If **2+ groups** exist, automatically generate and organize them as **Group A, Group B, Group C...**
- [ ] **Automatic Standings Calculation (Tie-Breaker Engine):**
  * Reference: [meinturnierplan.de](https://www.meinturnierplan.de/)
  * Automatically calculate Played, Won, Drawn, Lost, Goals For (GF), Goals Against (GA), Goal Difference (GD), and Points as match scores are entered.
  * Tie-breaker logic: Points > Goal Difference > Goals Scored > Head-to-Head.
- [ ] **Automatic Team & Player Statistics Aggregation:**
  * Match events automatically update team goal tallies (GF/GA) and increment player individual leaderboards (Top Scorers, Assists, Yellow/Red Cards).

---

### 3. Administrative Workflows (CRUD)
- [ ] **Team CRUD (Mandatory Logo & Country Flag):**
  * Admin interface where both the **Team Logo** and **Country/City Flag** are required fields.
- [ ] **Participating Team List Management:**
  * Assign, reassign, or remove clubs from specific tournament tiers and groups.
- [ ] **Match Fixture & Schedule CRUD:**
  * Schedule fixtures, assign venues/referees, reschedule, and set publication states.
- [ ] **News & Stories CRUD:**
  * Full editorial create, read, update, delete, publish, and schedule management for articles.
- [ ] **Season-Specific Player Rosters (Historical Validity):**
  * Player active/inactive status tied to specific seasons (e.g., Active in 2026, Inactive in 2025, Active in 2024) preserving career historical statistics.
- [ ] **Feedback & Comment Moderation CRUD:**
  * Review, approve, reject, or delete submitted user comments and feedback.

---

### 4. Player Presentation
- [ ] **Player Cutout Photo with Flag Backdrop:**
  * Dynamic CSS layer placing the cutout player photograph in front of their country/team flag graphic on roster cards and match lineups.

---

## 🗂️ Turkish Original Reference (for traceability)
- Katılımcı bayrak vs bilgi ana sayfada
- Hakkımızda 
- Haber bölümü
- Sosyal medya WhatsApp iletişim
- Canlı yayın link gönderme live icon 
- `https://eurobusinesscup.com/season-2353/home-en` bu yapı güzel kullanılsın
- `https://eurobusinesscup.com/home-en` particip kısmı aynen alınabilir editlenebilir
- Farklı format şampiyona vs aynı anda
- Giriş haber format
- Haber crud
- Takım crud logo bayrak must
- Listedeki takımlarla crud
- Maç programı crud
- Skor puan durumu otomatik hesaplama
- `https://www.meinturnierplan.de/` averaj vs
- Takımların gol sayısı takımlara işlensin oyuncuların gol sayısı oyunculara işlensin
- Feedback yorum kısmı crud 
- İlk phase ing
- Tek grup varsa lig birden fazla varsa otomatik a,b,c
- Oyuncu aktif deactiv sezona göre (25 var 24 yok 26 var)
- Oyuncu resim arkaplan remove sistem arkaya bayrak ekleme
