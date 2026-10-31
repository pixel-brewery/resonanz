# Mit dem lokalen Assistenten sprechen

Resonanz verbindet das Mikrofon, die systemeigene Spracherkennung, den über
Synapse angemeldeten Codex-/Claude-Assistenten und native Sprachausgabe. Es wird
kein zusätzlicher Sprachprovider und kein API-Key eingerichtet.

## Voraussetzungen

- Installierte, in Resonanz angemeldete Codex- oder Claude-Code-CLI.
- Verfügbare systemeigene Spracherkennung und Stimme für die gewählte Sprache.
- Freigegebenes Systemstandardmikrofon und funktionierende Audioausgabe.

## Gesprächsablauf

1. Eine Live-Unterhaltung starten.
2. Einen Beitrag sprechen; erkannte Textfragmente erscheinen in derselben Session.
3. Nach dem Ende des Beitrags antwortet der ausgewählte Assistent über Synapse.
4. Seine Antwort wird fortlaufend in sprechbare Abschnitte überführt und hörbar
   wiedergegeben. Der Verlauf bleibt als Text mit Sprecherzuordnung erhalten.
5. Die Antwort bei Bedarf unterbrechen, das Mikrofon stummschalten oder pausieren.
6. Fortsetzen oder beenden und die gespeicherte Session erneut öffnen.

Während der Sprachausgabe darf der Assistent nicht auf seine eigene Stimme
antworten. Erkennung, Stummschaltung, Unterbrechung und Ausgabe sind daher
koordinierte Lebenszyklen. Späte Antworten oder Sprachclips eines abgebrochenen
Turns dürfen nicht in einem neuen Turn abgespielt werden.

Pause gibt Erkennung und Mikrofon frei. Fortsetzen arbeitet mit derselben
logischen Session und deren bisherigem Kontext. Beenden wartet die letzten
Audioblöcke ab und beendet die zugehörige Spracherkennung und Assistentenarbeit.
Fehlende Sprache, verweigerte Freigaben oder eine nicht verfügbare CLI werden
konkret angezeigt; eine erfolgreiche Unterhaltung wird dann nicht behauptet.

## Gespräch erhalten

Mikrofon und tatsächlich abgespielte Assistentenausgabe werden getrennten
Stereokanälen zugeordnet. Die Transkripte beider Seiten und ihre Zeitmarken
gehören zu derselben Session. Vollständig abgespielte Antwortabschnitte erhalten
einen Transkripteintrag. Bei einer Unterbrechung bleibt der bereits gehörte
Anfang im Audio erhalten; der vollständige Abschnitt wird nicht als gehört
transkribiert. Die vollständige Modellantwort bleibt im Fragenverlauf.

Die Antworten stammen direkt vom gewählten Assistenten. Eine separate
Providerdelegation ist nicht erforderlich. Derselbe Sessionkontext wird für
spätere Fragen und Zusammenfassungen verwendet.

## Vorlesen gespeicherter Texte

Für das Vorlesen einer gespeicherten Zusammenfassung oder Antwort bleibt der
`TextToSpeechService` aus Flamox unverändert. Die Live-Ausgabe verwendet native,
archivierbare Sprachclips. Das sind getrennte Wiedergabeanlässe mit systemeigenen
Stimmen; beide benötigen keinen zusätzlichen Dienstzugang.

Der implementierte Stand und die tatsächlich ausgeführten Mikrofon-, Sprach-,
Unterbrechungs- und Wiederaufnahmeprüfungen stehen in der [Abnahme](abnahme.md).
