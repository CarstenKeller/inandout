# CLAUDE.md – Projektleitfaden

## Entwicklungsumgebung

### Termux + Expo Go (Android)

Die App wird lokal in Termux auf einem Android-Gerät entwickelt und über Expo Go getestet.

**Entwicklungsserver starten:**
```bash
npx expo start
```

**Mit Cache-Reset (bei Anzeigeproblemen oder nach größeren Änderungen):**
```bash
npx expo start --clear
```

Nach dem Start im Expo Go die App schütteln → **Reload**, um Änderungen zu laden.

### Git-Synchronisation mit GitHub

Termux ignoriert manchmal Änderungen im Remote-Repository. Zuverlässige Pull-Strategie:

```bash
# Expo stoppen (Ctrl+C), dann:
git fetch origin
git checkout <branch-name>
git reset --hard origin/<branch-name>

# Danach Expo mit Cache-Reset neu starten:
npx expo start --clear
```

Falls `git reset --hard` wegen lokaler Änderungen scheitert:
```bash
git stash
git reset --hard origin/<branch-name>
```

### Datenschutz

**Hochgeladene Screenshots und Dateien aus `/root/.claude/uploads/` werden niemals ins Repository gepusht.** Sie dienen ausschließlich als Kontextinformation für Claude.

---

## Zusammenarbeits-Modi

Unsere Zusammenarbeit läuft in vier klar definierten Modi ab.

---

### Konzept-Modus

**Ziel:** Gemeinsames Erarbeiten des Plans für die nächste Iteration.

- Wir diskutieren Anforderungen, Architektur und Umsetzungsdetails.
- Claude macht Vorschläge, der Nutzer entscheidet.
- Das Ergebnis wird in einer Plandatei festgehalten:
  - Erste Iteration: `PLAN.md`
  - Folgeiterationen: `PLAN-Iteration_x.md` (x = Iterationsnummer)
- **Die Phase endet, wenn der Nutzer „lets start" sagt.** Erst dann beginnt die Implementierung.

---

### Implementierungs-Modus

**Ziel:** Schrittweise Umsetzung des aktuellen Plans.

- Claude implementiert strikt nach dem Plan.
- Jeder begonnene und abgeschlossene Schritt wird in der Plandatei markiert (`[ ]` → `[x]` bzw. `[~]` für in Arbeit), damit wir nach einer Unterbrechung schnell den Faden wieder aufnehmen können.
- Kein Gold-Plating: nur was im Plan steht wird umgesetzt.
- **Die Phase endet mit einem gemeinsamen Test der Umsetzung.**

---

### Feature-Modus

**Ziel:** Neue Funktionen sammeln und planen.

- Neue Ideen und Feature-Wünsche werden gesammelt.
- Gemeinsam wird `PLAN-Iteration_x.md` für die nächste Iteration erarbeitet.
- Endet ebenfalls mit „lets start".

---

### Fixing-Modus

**Ziel:** Beheben von Bugs und konzeptionellen Fehlern.

- Bugs und Fehler werden analysiert, isoliert und behoben.
- Fixes fließen in den aktuellen Branch.
- Kein Refactoring über den Fix hinaus.

---

## Iterations-Abschluss

Wenn eine Iteration abgeschlossen und getestet ist:

1. `CLAUDE.md` wird bei Bedarf aktualisiert (neue Konventionen, geänderter Stack etc.).
2. Die abgeschlossene Plandatei bleibt als Referenz im Repo.
3. Wir starten mit dem nächsten Plan analog in den Konzept-Modus für die nächste Iteration.

---

## Allgemeine Code-Konventionen

- Sprache in der Zusammenarbeit: **Deutsch**
- Commits immer auf den aktuellen Feature-Branch, nie direkt auf `main`
- Kein `git push --force`, keine destruktiven Git-Operationen ohne explizite Aufforderung
- Keine Kommentare im Code außer wenn das „Warum" nicht offensichtlich ist
- Keine unnötigen Abstraktionen oder Features über den aktuellen Plan hinaus
