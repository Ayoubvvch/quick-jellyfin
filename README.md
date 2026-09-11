# 🍿 Quick-Jellyfin

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Docker](https://img.shields.io/badge/Docker-Enabled-2496ED?logo=docker&logoColor=white)](https://www.docker.com/)
[![Jellyfin](https://img.shields.io/badge/Jellyfin-10.9+-00A4DC?logo=jellyfin&logoColor=white)](https://jellyfin.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)

> **⚡ 1-Click Jellyfin Media Server & Smart Web Download Manager Suite.**  
> Deploy a production-ready personal streaming server with an automated multi-threaded download manager in seconds.

---

## 🚀 1-Click Installation (Zero Setup)

Run this single command on any clean **Ubuntu / Debian** server or VPS:

```bash
curl -fsSL https://raw.githubusercontent.com/Ayoubvvch/quick-jellyfin/main/install.sh | bash
```

### What does the installer do automatically?
1. ✅ Verifies and installs **Docker** and **Docker Compose** if not present.
2. ✅ Clones Quick-Jellyfin and creates organized media directories (`movies`, `shows`, `anime`).
3. ✅ Configures permissions, timezone, and environment variables.
4. ✅ Launches **Jellyfin** (Port `8096`) and **Smart Download Manager** (Port `5000`).
5. ✅ Displays direct web URLs for your server immediately.

---

## 🌟 Features

### 🎬 Turnkey Jellyfin Streaming Server
- Pre-configured [LinuxServer.io Jellyfin](https://hub.docker.com/r/linuxserver/jellyfin) image.
- Hardware acceleration (VA-API / NVENC) ready.
- Stream your collection across Smart TVs, Android, iOS, Windows, Roku, and Firestick.

### 📥 High-Speed Web Download Manager
- **Aria2 Acceleration**: Multi-threaded parallel downloading (up to 16 connections per file).
- **MediaFire Resolver**: Paste any MediaFire link—the system extracts the high-speed direct download link automatically.
- **Direct Link Support**: Download MP4, MKV, AVI, and all web media files effortlessly.
- **Archive Auto-Extraction**: Automatically extracts `.zip`, `.rar`, and `.7z` archives directly into your library and cleans temporary files.
- **Real-Time WebSockets**: Live progress bar, speed meter, ETA, and pause/resume controls.

### 📁 Smart Media Organization
Download directly into organized categories matching Jellyfin standards:
- **Movies**: `/media/movies`
- **TV Shows**: `/media/shows/<Show Name>/Season 01`
- **Anime**: `/media/anime/<Anime Name>/Season 01`

### 🎛️ Built-in File & System Manager
- Browse and organize downloaded media files directly from the browser.
- Create show/season folders on the fly.
- Live server telemetry: Disk storage usage & RAM consumption monitors.

---

## 🖥️ Manual Docker Compose Deployment

If you prefer deploying manually via Git and Docker Compose:

```bash
# 1. Clone repository
git clone https://github.com/Ayoubvvch/quick-jellyfin.git
cd quick-jellyfin

# 2. Start services
docker compose up -d --build
```

### Access Services:
- **Jellyfin Web App**: `http://YOUR_SERVER_IP:8096`
- **Download Manager**: `http://YOUR_SERVER_IP:5000`

---

## ⚙️ Configuration & Ports

Copy `.env.example` to `.env` to customize settings:

| Variable | Default | Description |
|---|---|---|
| `JELLYFIN_PORT` | `8096` | Port for Jellyfin web interface |
| `DOWNLOADER_PORT` | `5000` | Port for Download Manager web GUI |
| `PUID` | `1000` | User ID for volume file ownership |
| `PGID` | `1000` | Group ID for volume file ownership |
| `TZ` | `Africa/Casablanca` | Timezone for logs and scheduling |

### Firewall (UFW)
Open the required TCP ports:
```bash
sudo ufw allow 8096/tcp
sudo ufw allow 5000/tcp
sudo ufw reload
```

---

## 🛠️ Management Commands

| Action | Command |
|---|---|
| **View live logs** | `docker compose logs -f` |
| **Restart services** | `docker compose restart` |
| **Stop services** | `docker compose down` |
| **Update to latest version** | `git pull && docker compose up -d --build` |

---

## 🌍 الدليل السريع بالعربية

**Quick-Jellyfin** هو حل سحابي متكامل يجمع بين سيرفر بث الوسائط **Jellyfin** ومدير تحميل ويب ذكي **Jellyfin Downloader** لتثبيتهما معاً بضغطة زر واحدة على أي سيرفر VPS.

### ⚡ التثبيت بأمر واحد:
```bash
curl -fsSL https://raw.githubusercontent.com/Ayoubvvch/quick-jellyfin/main/install.sh | bash
```

### 🎯 ما يميز المنظومة:
- **بث احترافي**: سيرفر Jellyfin جاهز فورياً مع واجهة عربية ودعم الترجمات والتطبيقات.
- **تحميل فائق السرعة**: استخدام محرك `aria2` بـ 16 اتصال متزامن لتنزيل الأفلام والمسلسلات في ثوانٍ.
- **فك الروابط التلقائي**: دعم روابط ميديا فاير والروابط المباشرة بدون إعلانات أو كابتشا.
- **فك الضغط الآلي**: فك ملفات ZIP و RAR و 7z تلقائياً فور اكتمال التنزيل وحذف الأرشيف المضغوط لتوفير المساحة.
- **ترتيب المكتبة**: تصنيف تلقائي في مجلدات الأفلام، المسلسلات، والأنمي لتظهر مباشرة داخل Jellyfin.

---

## 📄 License
This project is open-source under the [MIT License](LICENSE).
