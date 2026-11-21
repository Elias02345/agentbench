# AgentBench

AgentBench vergleicht Modelle für agentische Arbeitsabläufe. Jedes Modell erhält einen Auftrag, einen isolierten simulierten Arbeitsbereich und Werkzeuge, die dessen Zustand verändern. Oberfläche und Aufgaben stehen auf Deutsch und Englisch zur Verfügung.

## Docker Compose

Lege die Datei `compose.yaml` in einem Ordner namens `agentbench` auf dem Server ab. Starte Compose aus diesem Ordner.

```bash
docker compose up -d --wait
```

Die Compose-Datei lädt standardmäßig `ghcr.io/elias02345/agentbench:latest`. Beim ersten Start legt der Initialisierungscontainer eine **`.env`** mit Standardwerten und das Verzeichnis **`data/`** neben `compose.yaml` an. Vorhandene `.env`-Dateien bleiben erhalten. Die Anwendung speichert SQLite, Laufhistorie und Aktionsprotokolle in diesem `data/`-Verzeichnis. Der dauerhaft laufende Container bindet ausschließlich `./data` ein. `docker compose down` lässt das Verzeichnis auf dem Host liegen.

```text
agentbench/
├── compose.yaml
├── .env
└── data/
    └── agentbench.sqlite
```

Die Oberfläche ist auf dem Server standardmäßig unter [http://127.0.0.1:4173](http://127.0.0.1:4173) erreichbar. Für Fernzugriff kannst du einen SSH-Tunnel zum Server verwenden. `AGENTBENCH_PORT`, `AGENTBENCH_BIND` und `AGENTBENCH_SEED` lassen sich in `.env` ändern und mit `docker compose up -d` anwenden. Wenn ein vorhandenes Datenverzeichnis einem anderen Benutzer gehört, setze `AGENTBENCH_UID` und `AGENTBENCH_GID` auf dessen numerische IDs. Für ein Update dienen `docker compose pull` und anschließend `docker compose up -d --wait`.

Die GitHub-Actions-Pipeline prüft den Erststart und die Persistenz unter Compose und veröffentlicht danach Images für Linux auf AMD64 und ARM64. Bei der ersten GHCR-Veröffentlichung kann das Paket von GitHub zunächst als privat angelegt werden. Für anonymen Download ist ein öffentliches Paket erforderlich. Bei einem privaten Paket ist eine GHCR-Anmeldung mit Leseberechtigung erforderlich.

### Lokales Docker-Image

Wenn du das Projekt selbst bauen möchtest, führe aus dem entpackten Projektordner Folgendes aus.

```bash
docker build -t agentbench:local .
AGENTBENCH_IMAGE=agentbench:local docker compose up -d --wait
```

Mit einem mitgelieferten Image-Archiv ersetzt `docker load -i AgentBench-image-linux-amd64.tar.gz` den ersten Befehl. Lege danach `compose.yaml` in `agentbench/` ab und führe den Compose-Befehl aus diesem Ordner aus.

## Start

Voraussetzung ist Node.js 24 oder neuer. Das Projekt hat keine zusätzlichen Paketabhängigkeiten.

```bash
npm start
```

Öffne [AgentBench im lokalen Browser](http://127.0.0.1:4173). Zwei gekennzeichnete, geskriptete Demo-Läufe zeigen die Auswertung ohne API-Zugang. Du kannst im Dialog **Neuer Testlauf** sofort weitere Demos starten.

## Eigene Modelle testen

1. Trage unter **API-Verbindung** die Basis-URL deines Anbieters ein, beispielsweise `https://provider.example/v1` oder `http://127.0.0.1:11434/v1`, sowie bei Bedarf einen API-Schlüssel.
2. Verwende **Modelle abrufen**, falls der Anbieter `GET /models` unterstützt. Für die Ausführung muss das gewählte Modell `POST /chat/completions` mit Funktionsaufrufen unterstützen.
3. Öffne **Neuer Testlauf → API verwenden** und gib pro Zeile eine Modell-ID ein. Wähle bis zu fünf Modelle am selben Endpunkt, die Szenarien, die Testsprachen und das Rundenlimit. Wiederholungen starten mit demselben Ausgangszustand und jeweils einer neuen Unterhaltung. Für Modelle an unterschiedlichen Endpunkten starte je einen Lauf mit derselben Konfiguration.
4. Öffne den **Modellvergleich** für Gesamtscore, Ergebnisse je Sprache und Workflow, kritische Verstöße, Werkzeugaufrufe, Laufzeit und vom Anbieter gemeldete Tokens. Die Laufdetails enthalten Kriterien, Abschlussantwort, Aktionsprotokoll und JSON-Export.

## Szenarien und Auswertung

| Szenario | Geprüfte Fähigkeiten |
| --- | --- |
| Kundeneskalation | Widersprüchliche Quellen, Buchungsstatus, Richtlinien und Vertraulichkeit |
| Terminplanung | Zeitzonen, Überschneidungen, Puffer und Reihenfolge der Aktionen |
| Einkauf | Angebotsauswahl, Gesamtkosten, Freigabe und Wiederholung nach temporärem Werkzeugfehler |
| Finanzabgleich | Stichtage, Duplikate, Rechenfehler und berechtigte Eskalation |
| Überwachung | Zeitabhängige Signale, Beobachtungsintervalle, Schwellenwerte und Übergabe |
| Partner-Rollout | Zeitlich gestaffelte Freigaben, lokalisierte Kommunikation und vertrauliche Daten |

Der Gesamtscore gewichtet Workflow-Ergebnis mit 90 % und Sprachscore mit 10 %. Die Workflow-Kriterien prüfen simulierte Zustände, Belege, Zeitpunkte und bestimmte erforderliche Inhalte. Ein kritischer Verstoß begrenzt den Workflow-Score dieser Aufgabe auf 45 von 100. Eine Aufgabe besteht ab 80 Workflow- und 60 Sprachpunkten. Der Sprachscore verwendet Sprachmarker für die Abschlussantwort und bei Kundeneskalation und Partner-Rollout auch für externe Nachrichten. Für die Auswertung des deutschen Aufgabenverständnisses sind insbesondere die Workflow-Ergebnisse der deutschen Varianten relevant. Die Sprachheuristik misst Zielsprachentreue.

Für vollständige Läufe ergibt sich die Eignung aus Score, Bestehensquote und kritischen Verstößen. Ein kritischer Verstoß hat Vorrang. **Gut geeignet** erfordert mindestens 85 Gesamtpunkte und 80 % bestandene Aufgaben. **Bedingt geeignet** erfordert mindestens 50 % bestandene Aufgaben. Unterhalb davon lautet die Einstufung **Geringe Eignung**. Die Einstufung gilt für die gewählte Testkonfiguration. Anbieterfehler werden gesondert erfasst und fließen nicht als Modell-Scores in den Vergleich ein.

## Hintergrundbetrieb

Der Worker arbeitet die Warteschlange weiter ab, solange der Server läuft. Der Browser kann währenddessen geschlossen werden. Ereignisse im Überwachungsszenario folgen einer virtuellen Uhr. Außer dem konfigurierten Modellanbieter werden alle Werkzeuge im Server simuliert.

Läufe und Aktionsprotokolle liegen in `data/agentbench.sqlite`. Der gespeicherte API-Schlüssel liegt bis zum Neustart ausschließlich im Arbeitsspeicher. Beim Neustart werden laufende und eingereihte Jobs als unterbrochen markiert. Über **Erneut ausführen** lässt sich ein Lauf mit derselben Konfiguration starten.

Der Server bindet standardmäßig an die lokale Loopback-Adresse und ist für die Einzelplatznutzung ausgelegt. `PORT`, `HOST` und `AGENTBENCH_DATA_DIR` konfigurieren Listener und Datenspeicher. `AGENTBENCH_SEED=0` startet eine leere Datenbank ohne Demo-Läufe. Für dauerhaften Betrieb lässt sich `npm start` mit einem Prozessmanager ausführen.

```bash
npm test
```

Die Tests decken die Referenzpfade in beiden Sprachen, die virtuelle Uhr, kritische Kriterien und einen vollständigen Vergleich gegen eine lokale kompatible Test-API ab.

## English quick start

Run `npm start` with Node.js 24 or newer and open [AgentBench](http://127.0.0.1:4173). Select **EN** in the top bar. Under **API connection**, enter your Chat Completions base URL and optional key. Use **New benchmark → Use API** and enter one tool-capable model ID per line. Select English, German, or both. The background worker runs independently of the browser while the server is running. Use **Model comparison** for same-configuration results and open a run to view criteria, traces, and its JSON export.
