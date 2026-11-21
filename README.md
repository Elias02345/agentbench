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

Die Oberfläche ist auf dem Server standardmäßig unter [http://127.0.0.1:4173](http://127.0.0.1:4173) erreichbar. Für Fernzugriff kannst du einen SSH-Tunnel zum Server verwenden. `AGENTBENCH_PORT` und `AGENTBENCH_BIND` lassen sich in `.env` ändern und mit `docker compose up -d` anwenden. Für LAN-Zugriff setze `AGENTBENCH_BIND=0.0.0.0` und begrenze den Zugriff per Firewall auf das LAN, da die Oberfläche keine Anmeldung hat. Wenn ein vorhandenes Datenverzeichnis einem anderen Benutzer gehört, setze `AGENTBENCH_UID` und `AGENTBENCH_GID` auf dessen numerische IDs. Aktualisiere im bestehenden Ordner `agentbench` die Compose-Datei und das Image. Die vorhandene `.env` und der Ordner `data/` bleiben erhalten.

```bash
curl -fsSL https://raw.githubusercontent.com/Elias02345/agentbench/main/compose.yaml -o compose.yaml.new && mv compose.yaml.new compose.yaml && docker compose pull && docker compose up -d --wait
```

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

Öffne [AgentBench im lokalen Browser](http://127.0.0.1:4173) und füge dein erstes Modell hinzu.

## Eigene Modelle testen

1. Öffne **Modelle & API** und gib die Basis-URL, die genaue Modell-ID und bei Bedarf einen API-Schlüssel ein. Die URL kann zum Beispiel `https://provider.example/v1` sein.
2. Mit **Modelle abrufen** kannst du IDs aus `GET /models` übernehmen. **Verbindung prüfen** führt über `POST /chat/completions` einen Funktionsaufruf samt Werkzeugantwort aus. Die Prüfung verwendet das gewählte Modell und zeigt bei einem Fehler die Antwort des Anbieters.
3. Speichere das Modell und wähle unter **Neuer Testlauf** bis zu fünf gespeicherte Modelle, Szenarien und Sprachen aus. Der Worker arbeitet alle Läufe, Wiederholungen und Aufgaben nacheinander ab. Jedes Szenario startet mit einer neuen Unterhaltung und demselben Ausgangszustand.
4. Öffne den **Modellvergleich** für Ergebnisse je Sprache und Workflow, kritische Verstöße, Werkzeugaufrufe, Laufzeit und vom Anbieter gemeldete Tokens. Die Laufdetails enthalten Kriterien, Anbieterfehler, Abschlussantwort, Aktionsprotokoll und JSON-Export.

Wenn der Modellanbieter auf demselben Docker-Host läuft, verwende beispielsweise `http://host.docker.internal:11434/v1` für Ollama. Der Modellserver muss die Verbindung vom Container-Netz annehmen. Eine API in einem anderen Container kann in einem gemeinsamen Docker-Netz ihren Dienstnamen als Host verwenden.

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

Modelle, Läufe und Aktionsprotokolle liegen in `data/agentbench.sqlite`. Ein API-Schlüssel bleibt standardmäßig bis zum Neustart im Arbeitsspeicher. Die Option zum Speichern hinterlegt ihn in der lokalen Datenbank, auf die nur der Dateieigentümer zugreifen kann. Sichere den Datenordner entsprechend, wenn du diese Option verwendest. Beim Neustart werden laufende und eingereihte Jobs als unterbrochen markiert. Über **Erneut ausführen** lässt sich ein Lauf mit derselben Konfiguration starten.

Der Server bindet standardmäßig an die lokale Loopback-Adresse und ist für die Einzelplatznutzung ausgelegt. `PORT`, `HOST` und `AGENTBENCH_DATA_DIR` konfigurieren Listener und Datenspeicher. Für dauerhaften Betrieb lässt sich `npm start` mit einem Prozessmanager ausführen.

```bash
npm test
```

Die Tests decken die Referenzpfade in beiden Sprachen, die virtuelle Uhr, kritische Kriterien und einen vollständigen Vergleich gegen eine lokale kompatible Test-API ab.

## English quick start

Run `npm start` with Node.js 24 or newer, open [AgentBench](http://127.0.0.1:4173), and select **EN**. Under **Models & API**, enter your Chat Completions base URL, the model ID, and an optional key. Use **Check connection** to verify function tools. Save the model and select it under **New benchmark**. The worker processes models and scenarios one at a time even after the browser closes.
