# CCL Cup — Tournament Management & Competition Platform

[![React](https://img.shields.io/badge/React-18-blue.svg)](https://reactjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue.svg)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-5.0-purple.svg)](https://vitejs.dev/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-green.svg)](https://supabase.com/)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

A modern, full-featured football tournament management platform and public portal. Built with **React**, **TypeScript**, **Vite**, and **Supabase (PostgreSQL + Auth + Row Level Security)**.

---

## 🌟 Key Features

### 🏆 Competition & Tournament Systems
- **Multi-Format Tournament Support**:
  - 🏆 **Single-Elimination Knockout Brackets** (4, 8, or 16 teams with interactive drag-and-drop seeding).
  - 📋 **Single-Table Leagues** (Dynamic table standings, head-to-head records, goal difference).
  - 👥 **Multi-Group Leagues** (UEFA Champions League / World Cup format with group tables and knockout stages).
- **Interactive Visual Canvases**:
  - **Tactical Pitch & Formation Squad Canvas**: Interactive stadium football pitch (`4-3-3`, `4-4-2`, `3-5-2`, `7v7`, `5v5`) with drag-and-drop roster assignments.
  - **Knockout Bracket Canvas**: Visual tournament bracket builder with match progression.
  - **League & Group Stage Canvases**: Visual team seeding and live standing configuration.

### 👥 Teams & Global Player Pool Hub
- **Club Management**: Team branding, dynamic country flag resolution, custom primary/secondary kit colors, crest management, and staff rosters.
- **Global Player Pool & Transfers**: Transfer players freely between clubs, assign to squads, or register free agents (`team_id: null`).
- **Detailed Player Profiles**: Positions (`GK`, `DEF`, `MID`, `FWD`), squad numbers, matchday statistics (goals, assists), active season tags, and captaincy badges.

### ⏱️ Live Match Center & Event Timeline
- **Scorekeeping & Match States**: Scheduled, Live (In-Progress), Completed (Final), and Postponed match statuses.
- **Match Events Timeline**: Real-time event logging for goals, penalties, yellow cards, red cards, and substitutions with player attribution.

### 🔒 Enterprise Security & Roles
- **Supabase Authentication & Row-Level Security (RLS)**:
  - `super_admin`: Full system control and permission delegation.
  - `admin`: Competition, squad, and content management.
  - `editor`: Editorial stories, media assets, and news.
  - `match_operator`: Fixtures, scores, and matchday events.
  - `viewer`: Public read-only access.
- **Strict Client-Side Security**: Only the public anonymous key is exposed to the frontend; all modifications are enforced at the PostgreSQL database level via RLS policies.

---

## 🚀 Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/Aryazaeri/ccl-cup.git
cd ccl-cup
```

### 2. Install dependencies
```bash
npm install
```

### 3. Configure environment variables
Copy `.env.example` to `.env.local`:
```bash
cp .env.example .env.local
```

Fill in your Supabase project credentials in `.env.local`:
```env
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here
```

### 4. Run database migrations
Apply the SQL migration scripts in `supabase/migrations/` in your Supabase SQL Editor:
1. `supabase/migrations/202608150001_initial_schema.sql`
2. `supabase/migrations/202608170001_update_players_table.sql`

### 5. Launch development server
```bash
npm run dev
```

- **Public Tournament Portal**: `http://localhost:5173/#site`
- **Admin Management Panel**: `http://localhost:5173/#admin`

---

## 📦 Production Deployment

### Build for Production
```bash
npm run build
```

### Deploy to Vercel / Netlify
The repository includes pre-configured single-page application (SPA) routing manifests:
- [`vercel.json`](vercel.json)
- [`netlify.toml`](netlify.toml)

Set the following build settings in your hosting dashboard:
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Environment Variables**: Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.

---

## 🛠️ Tech Stack

- **Frontend**: React 18, TypeScript, Vite
- **Styling**: Modern CSS3 Custom Properties, Responsive Grid & Flexbox
- **Icons**: Lucide React
- **Backend & Database**: Supabase (PostgreSQL 15), Supabase Auth, Row Level Security (RLS)
- **Deployment**: Vercel / Netlify

---

## 📄 License

This project is licensed under the MIT License.
