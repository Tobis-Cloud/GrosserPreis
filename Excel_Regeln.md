# Excel Regeln


Die Excel-Datei besteht aus zwei Tabellenblättern (Sheets):
- Sheet 1 ("Fragen"): Enthält die Quiz-Fragen.
- Sheet 2 ("Antworten"): Enthält die Antworten. Die Formatierung der Antworten steuert im Spiel automatisch den Fragentyp.

Halte dich strikt an folgende Strukturierung für die beiden Tabellen:

### 1. Struktur der Tabellenblätter
Beide Tabellenblätter müssen exakt dieselbe Spalten- und Zeilenstruktur aufweisen:
- Zeile 1 (Kopfzeile): Spalte A enthält das Label "Punkte". Die Spalten B, C, D... enthalten die Kategorienamen (z. B. "Geographie", "Bibel", "Sport").
- Spalten A (Zeilen 2-6): Enthält die Punktstufen absteigend (z. B. 100, 80, 60, 40, 20).
- Zellen (Schnittpunkt Kategorie/Punkte): Enthält in Sheet 1 die Frage und in Sheet 2 die Antwort.

### 2. Formatierungsregeln für Antworten (Sheet 2)
Der Typ der Frage wird im Spiel anhand der Formatierung der Antwort in Sheet 2 bestimmt. Nutze die folgenden 5 Formatierungsvarianten:

#### Typ A: Normale Frage (Standard)
- Format: Einfacher, freier Antworttext.
- Beispiel für Zelle in Sheet 2:
  Berlin

#### Typ B: Joker-Feld
- Format: Der Inhalt der Zelle muss exakt lauten: "Joker-Feld".
- Beispiel für Zelle in Sheet 2:
  Joker-Feld

#### Typ C: Schätzfrage
- Format: Der Text MUSS mit "Zielwert: " beginnen, gefolgt von der korrekten Zahl.
- Beispiel für Zelle in Sheet 2:
  Zielwert: 206

#### Typ D: Multiple Choice (MC)
- Format: Mehrere Optionen, jede in einer neuen Zeile, beginnend mit einem Buchstaben und Klammer (A), B), C)...). Die korrekte Antwort MUSS am Ende der Zeile mit "[KORREKT]" oder "[v]" markiert sein.
- Beispiel für Zelle in Sheet 2:
  A) Afrika
  B) Asien [KORREKT]
  C) Europa
  D) Nordamerika

#### Typ E: Listen-Frage (Aufzählung)
- Format: Eine nummerierte Liste, bei der jeder Punkt in einer neuen Zeile beginnt (1., 2., 3...). Im Spiel werden diese Punkte einzeln nacheinander aufgedeckt.
- Beispiel für Zelle in Sheet 2:
  1. Simon Petrus
  2. Andreas
  3. Jakobus (Sohn des Zebedäus)
  4. Johannes

---
