# 🏆 Großer Preis

Ein browserbasiertes Quizspiel im Stil von „Der Große Preis" – vollständig konfigurierbar, keine Serverinstallation nötig.

**→ [Live spielen auf GitHub Pages](https://tobiasayen.github.io/GrosserPreis/)**

---

## Features

- **Bis zu 8 Kategorien** mit konfigurierbaren Punktestufen
- **Excel / CSV Import** – Fragen aus `.xlsx` oder `.csv` laden
- **Manuell konfigurierbar** – Fragen, Antworten, Bilder und YouTube-Videos direkt im Browser eintragen
- **JSON Export / Import** – Konfigurationen speichern und wiederverwenden
- **Beliebig viele Teams** mit eigenen Farben
- **Joker-Felder** (⭐) konfigurierbar
- **Spielleiter-Modus** – Antwort erst nach Klick sichtbar (ideal für Beamer)
- **Minuspunkte** optional aktivierbar
- **Timer** pro Frage (optional)
- **Punkteverlauf** – klicke auf ein Team im Spielstand, um den Verlauf zu sehen
- **Auswertungsseite** mit Sieger, Podium, Diagramm und vollständigem Log
- **Alle Daten im localStorage** gespeichert – kein Server, kein Login

---

## Schnellstart

1. Öffne `index.html` im Browser (oder besuche die GitHub-Pages-URL)
2. Konfiguriere Teams und Fragen (oder lade eine Excel-Datei hoch)
3. Klicke auf **SPIEL STARTEN**
4. Nach allen Fragen → automatisch zur Auswertungsseite

---

## Excel-Format

### Sheet 1: Fragen
| Kategorie 1 | Kategorie 2 | Kategorie 3 |
|---|---|---|
| Frage 100 Pkt. | Frage 100 Pkt. | Frage 100 Pkt. |
| Frage 200 Pkt. | Frage 200 Pkt. | Frage 200 Pkt. |
| … | … | … |

### Sheet 2: Antworten (selbe Struktur)
| Kategorie 1 | Kategorie 2 | Kategorie 3 |
|---|---|---|
| Antwort 100 Pkt. | Antwort 100 Pkt. | Antwort 100 Pkt. |
| … | … | … |

---

## GitHub Pages aktivieren

1. Gehe zu `Settings` → `Pages`
2. Branch: `main`, Ordner: `/ (root)`
3. Speichern → nach ~1 Minute erreichbar unter `https://<username>.github.io/GrosserPreis/`

---

## Technologien

- **HTML5 + Vanilla CSS + Vanilla JavaScript** (kein Framework)
- **SheetJS** – Excel-Parsing (CDN)
- **Chart.js** – Punkteverlauf-Diagramm (CDN)
- **localStorage** – Persistenz
