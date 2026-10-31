# Öffentlicher Quellcode und Desktop-Pakete

## Quellcode

Resonanz wird unter [pixel-brewery/resonanz](https://github.com/pixel-brewery/resonanz)
öffentlich entwickelt. Eigene Quellen stehen unter der [MIT-Lizenz](../../LICENSE);
übernommenes Material behält die [vollständigen Hinweise](../../THIRD_PARTY_NOTICES.md).
Bildheader, echte App-Abbildung, Produkt- und Architekturführung sowie Vorlagen für
Beiträge gehören zum Repository.

Ein Checkout benötigt keinen persönlichen Paketregistry-Zugang für die gepinnten
Mosaik-/Synapse-Archive. Native Assistenten werden getrennt installiert und in der
App bewusst mit einem Konto verbunden. Der Root-Workspace bleibt in
`package.json` als `private: true` markiert, um eine versehentliche npm-Publikation
zu verhindern. Das ändert weder die öffentliche GitHub-Sichtbarkeit noch die
Quellcodelizenz.

## Pakete bauen und prüfen

```sh
yarn install --immutable
yarn verify
yarn format:check
yarn package
yarn verify:package
yarn test:e2e --packaged
```

`yarn make` erzeugt die für das ausführende System konfigurierten Installer und
Archive. Die aktuelle Forge-Konfiguration ist maßgeblich. Ein eigener lokaler
Ausgabeordner lässt sich über `RESONANZ_OUTPUT_DIR` festlegen, um ein bereits
geöffnetes App-Paket zu erhalten. Eigene MIT-Lizenz und Drittanbieterhinweise
werden mit dem Programm ausgeliefert und vom Paketprüfer verglichen.

Die [Desktop-CI](https://github.com/pixel-brewery/resonanz/actions/workflows/ci.yml)
prüft macOS und Windows separat. Sie startet keine persönliche Anmeldung und
verwendet kontrollierte Gesprächsinhalte. Die Prüfbelege dokumentieren ihre
jeweilige Reichweite; tatsächliche Account-Inferenz, physische Mikrofone und
Sprachpakete bleiben gesonderte Nachweise.

## Installer veröffentlichen

Ein grüner Build und öffentlich sichtbarer Quellcode erzeugen noch keine
Installationsfreigabe. Vor dem ersten Installerrelease gehören mindestens dazu:

1. Eine festgelegte Version und ein dazu passender Changelog-Stand.
2. Geprüfte Pakete für die angekündigten Architekturen, mit vollständigen Lizenzen.
3. Eine bewusste Entscheidung zu macOS-Developer-ID/Notarisierung und
   Windows-Signierung sowie den dazugehörigen Zugangsdaten.
4. Tatsächlicher Download- und Installationstest der vorgesehenen Artefakte.
5. Erst danach ein veröffentlichter Release mit nachvollziehbaren Prüfsummen.

Aktuell ist kein automatischer Release- oder Updatefeed eingerichtet. Ein Push
auf `main` startet Qualitätsprüfungen und veröffentlicht keine Pakete. Separate
Releasezugänge, Berechtigungen und Kanäle werden erst für diesen Arbeitsschritt
konfiguriert. Die aktuelle Produkt- und Plattformabnahme steht unter
[Abnahme und Nachweise](abnahme.md).
