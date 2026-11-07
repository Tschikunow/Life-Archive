# LIFEARCHIVE

Privates, online erreichbares Lebensarchiv für persönliche Ereignisse, Personen, Kapitel, Tagebuch, Fotos und Zeitkapseln.

## Architektur

- **Frontend:** `index.html`, `enhancements.js`, `security.js`, über GitHub Pages.
- **Datenbank & Benutzerkonto:** Supabase Auth + PostgreSQL.
- **Privater Dateispeicher:** Supabase Storage, Bucket `lifearchive-private`.
- **Zugang:** Anmeldung mit E-Mail und Passwort **und** ein weiterer, serverseitig geprüfter Archivcode.
- **Bereitgestellte Supabase-URL und Publishable Key im Browser sind keine Geheimnisse.** Es darf niemals ein Secret/Service-Role-Key im Repository stehen.

## Zugriffsschutz

Die Archivdaten sind durch Row-Level Security (RLS) an den jeweiligen Benutzer gebunden. Zusätzlich gelten serverseitig **restriktive Zugriffsregeln** auf allen 14 LIFEARCHIVE-Tabellen sowie auf den privaten Storage-Buckets.

Der Archivcode wird **ausschließlich serverseitig** als gesalzener bcrypt-Hash verwaltet (`life_guard.vaults`). Es gibt keine zugängliche Tabelle mit dem Passwort-Hash. Die öffentlichen RPCs `archive_vault_status`, `archive_set_code`, `archive_unlock`, `archive_lock` und `archive_change_code` sind `SECURITY INVOKER`-Weiterleitungen auf geschützte Funktionen im nicht exponierten Schema `life_guard`. Nur authentifizierte Konten dürfen sie aufrufen. Die echte Berechtigung wird anhand der Supabase-Sitzung verifiziert.

- Beim Öffnen/Neuladen der Web-App wird das Archiv erneut gesperrt.
- Die Serversitzung wird beim richtigen Code für **maximal 8 Stunden** freigeschaltet.
- Nach fünf falschen Codeversuchen gibt es **15 Minuten** Sperrzeit.
- Ein erneuter Codewechsel hebt die Freigabe anderer Sitzungen auf.
- Die Browser-Oberfläche allein **ist kein Sicherheitsmechanismus**. Sicherheitsentscheidungen finden in PostgreSQL statt.

## Einrichten

1. In Supabase Auth einen eigenen Benutzer registrieren und die **E-Mail bestätigen**.
2. In GitHub: `Settings → Pages → Deploy from a branch → main → /(root)`.
3. Danach die GitHub-Pages-URL aufrufen. Nach der Anmeldung einen eigenen, sicheren Archivcode mit mindestens 12 Zeichen festlegen. **Keine Passwörter im Chat teilen.**
4. Als erster Test einen harmlosen Beispiel-Eintrag erstellen, speichern und die Seite neu laden. Nach Eingabe des Codes muss der gespeicherte Eintrag wieder erscheinen.
5. Teste bei gesperrtem Archiv, ob ein direkter Datenbank-API-Zugriff ohne Freigabe nichts auslesen kann.
6. Überprüfe vor dem Speichern persönlicher Informationen im Browser die Anmeldung, das Entsperren, Speichern, Bearbeiten, Löschen, den Datei-Upload sowie den Export.

**Hinweis:** GitHub Pages hostet nur die öffentlich ausgelieferten Programmdateien. Die **privaten Daten dürfen niemals** in HTML, JavaScript oder dem Repository selbst landen.

## Prüfstatus

- Supabase-Tabellen und RLS-Regeln geprüft; Daten ohne gültige Sitzung nicht freigegeben.
- Öffentliche RPCs für anonyme Benutzer gesperrt.
- Die JavaScript-Dateien wurden auf Syntax geprüft.
- Noch ausstehend: kompletter Browsertest mit einem bestätigten Benutzerkonto, richtige Medien-Uploads im Livebetrieb, Wiederherstellung von großen Archiven.

## Bekannte Einschränkungen

- JSON-Export enthält derzeit **keine Original-Foto- und Video-Dateien**, sondern nur deren Metadaten. Medien unbedingt separat sichern.
- JSON-Import ist derzeit nicht atomar; ein Fehler kann bereits eingefügte Datensätze zurücklassen.
- Bei der derzeitigen Übersicht werden nur bis zu 5.000 Einträge geladen. Für langfristige Archive wird eine paginierte Darstellung benötigt.
- „Besonders sensibel“ ist aktuell eine Kennzeichnung, **keine eigene Ende-zu-Ende-Verschlüsselung**.
- Die Supabase-Option „Prüfung auf kompromittierte Passwörter“ muss bei unterstütztem Bezahlplan separat in Supabase Auth aktiviert werden.
- GitHub Pages schützt keine öffentlich bereitgestellten Dateien; nur die Daten-API und privaten Buckets sind zugriffsgeschützt.

## Sicherheit / Datenerhalt

Dieses Projekt soll Jahrzehnte halten. Dafür sind regelmäßige, **unabhängige und überprüfte Backups** der Datenbank und der Mediendateien nötig. Ein einzelnes Cloud-Projekt oder eine einzelne JSON-Datei ist keine dauerhafte Sicherungsstrategie.
