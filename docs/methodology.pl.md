# Metoda GameWeld

Jak małe zespoły budują grę, która działa przez cały czas, warstwa po warstwie.

GameWeld to narzędzie produkcyjne zbudowane wokół pewnego sposobu pracy. Ten dokument opisuje ten sposób pracy: jego założenia, podział decyzji i drogę, jaką praca przechodzi od pomysłu do zaakceptowanej części gry. Jest przeznaczony dla zespołów, które rozważają użycie GameWeld, i dla wszystkich, którzy chcą zrozumieć, dlaczego narzędzie działa tak, a nie inaczej.

## 1. Dla kogo jest metoda

Metoda powstała z myślą o małych projektach: niezależnych grach tworzonych przez zespoły kilkuosobowe, zwykle mniejsze niż dziesięć osób. Zakłada zespół, który zarządza się sam. Ludzie sami wybierają zadania, rozmawiają ze sobą bezpośrednio i nie potrzebują kierownika, który rozdziela pracę.

Czerpie z metod zwinnych, przede wszystkim z priorytetyzowanego backlogu znanego ze Scruma i z przepływu pracy przez tablicę znanego z Kanbana. Pomija większość ich rytuałów. Nie wymaga sprintów, iteracji o stałej długości, estymacji, codziennych spotkań ani retrospektyw. Zespół może z nich korzystać, ale żadne z nich nie jest częścią metody.

## 2. Główna idea: gra, która działa przez cały czas

**Gra rośnie z działającego rdzenia przez dodawanie warstw i po każdej warstwie nadaje się do grania.**

Zespół zaczyna od najmniejszej wersji gry, która się uruchamia, i stale ją rozbudowuje. Każdy dodatek, nazywany **warstwą**, to nowa funkcjonalność albo nowa treść w grze, która już istnieje. Warstwa nie powinna psuć tego, co już jest. Powinna zostawić po sobie nową, lepszą wersję gry, w którą ktoś może zagrać.

Pierwsze warstwy to głównie systemy: ruch, główna pętla rozgrywki, zapis stanu, pierwszy przeciwnik. W miarę postępu produkcji praca przesuwa się w stronę treści (poziomy, postacie, questy, dialogi, muzyka), a potem w stronę ukończenia gry (szlif, balans, wydajność, menu i ekrany).

Wynikają z tego pewne konsekwencje:

- **Grę można w każdej chwili zobaczyć i ocenić.** Ponieważ zawsze istnieje działająca wersja, zespół i Dyrektor gry mogą w nią zagrać, kiedy tylko chcą. Mogą sprawdzić założenia gry, jej planowany zakres i dalsze plany na czymś rzeczywistym, a nie na dokumencie.
- **Kamienie milowe to obserwacje, a nie fazy.** Metoda nie ma ustalonych etapów. Prototyp, vertical slice, alfa i beta to nie fazy, przez które przechodzi zespół. To opisy bieżącej wersji gry, a Dyrektor gry decyduje, kiedy któryś z nich pasuje. W dowolnej chwili Dyrektor gry może zapytać, czego brakuje obecnej wersji, żeby była, powiedzmy, vertical slice'em, i umieścić te warstwy na szczycie Backlogu. Zespół, który musi dostarczać kamienie milowe wydawcy, robi to tak samo: kamień milowy to zestaw warstw, które muszą zostać zaakceptowane do określonej daty.
- **Praca nie jest odkładana na później.** Warstwa powinna wzbogacać bieżącą wersję gry. Nie powinna być fragmentem pracy, który zostanie użyty dopiero kiedyś w przyszłości. Nie zawsze jest to możliwe, bo niektóre prace potrzebują kilku warstw, zanim będą widoczne w grze. Mimo to jest to cel każdej warstwy i Dyrektor gry powinien wybierać warstwy, które go spełniają.

Niektóre warstwy nie zmieniają samej gry. Warstwa, która buduje edytor poziomów, proces importu albo narzędzie do debugowania, zostawia grę taką, jaka była. Gra musi potem nadal działać, a nowe narzędzie musi działać również.

Metoda nie określa, jak sprawdzać, czy gra działa. Jeden zespół gra w build po każdej warstwie, drugi uruchamia testy automatyczne, a w trzecim Dyrektor gry sprawdza grę w piątki. Ważne jest, żeby zespół traktował zepsutą grę jako coś do naprawienia teraz, a nie później.

## 3. Warstwy

Warstwa to jednostka planowanej produkcji. W GameWeld jest nią **element Backlogu** i oba określenia znaczą to samo: ten dokument mówi „warstwa”, gdy chodzi o metodę, a „element Backlogu”, gdy chodzi o narzędzie.

Inne metody dzielą tę ideę na epiki, funkcjonalności, historyjki użytkownika i tak dalej, każde z własnym rozmiarem i formatem. Metoda GameWeld ma jeden rodzaj warstwy. Nie narzuca zasad dotyczących:

- **Rozmiaru.** „Przeciwnik strzelający”, „Rozdział 2” i „Popraw łuk skoku” to wszystko warstwy.
- **Formatu.** Opis warstwy to dowolny tekst. Może to być jedna linijka, krótka notatka projektowa albo link do dłuższego dokumentu. Dostępne są podpowiedzi nagłówków (jaki ma być wynik, jak zostanie sprawdzony), ale nie są obowiązkowe.
- **Nazewnictwa.** Zespół może nazywać swoje warstwy funkcjonalnościami, historyjkami albo jakkolwiek inaczej.

Rozmiar warstwy widać po liczbie jej zadań. Metoda nie używa estymacji ani story pointów. Warstwa z dwudziestoma zadaniami to większa praca niż warstwa z trzema, i dla małego zespołu to zwykle wystarcza. Liczniki zadań w GameWeld pokazują, jaka część pracy nad warstwą jest ukończona. Nie pokazują, ile wysiłku zostało, ani jak daleko zaszła cała gra.

## 4. Backlog i jego priorytety

Wszystkie zaplanowane warstwy są w jednym **Backlogu**, uporządkowanym metodą MoSCoW:

| Kategoria | Znaczenie |
| --- | --- |
| **Must Have** | Warstwy, bez których gry nie da się wydać. Szczyt tej listy to to, czym zespół powinien zająć się w następnej kolejności. |
| **Should Have** | Warstwy ważne i zaplanowane, ale gra mogłaby się bez nich ukazać, gdyby było trzeba. |
| **Could Have** | Warstwy, które uczyniłyby grę lepszą, realizowane, jeśli starczy czasu. |
| **Won't Have** | Warstwy, które wypadły, przynajmniej na razie. |

Priorytety działają na dwóch poziomach:

1. **Kategoria** to priorytet zgrubny. Mówi, mniej więcej, jak ważna jest warstwa.
2. **Pozycja w kategorii** to priorytet dokładny. Warstwa na szczycie Must Have to najważniejsza nieukończona warstwa w grze. Ta pod nią jest następna i tak dalej.

Metoda nie określa, jaki horyzont planowania obejmuje kategoria. Dla większości zespołów Must Have oznacza „potrzebne do wydania”, ale zespół może równie dobrze używać jej dla najbliższego kamienia milowego. Warto zapisać wybór zespołu w opisie projektu.

**Won't Have** to coś więcej niż kosz. To miejsce, w którym Dyrektor gry:

- **tnie zakres**: odsuwa warstwy, których gra nie dostanie, tak żeby wszyscy widzieli tę decyzję;
- **wcześnie wyznacza zakres**: ustala, czym gra nie jest, zanim ktokolwiek poświęci na to czas;
- **przechowuje odrzucone pomysły**: zachowuje pomysły, które rozważono i odrzucono, razem z uzasadnieniem, żeby ta sama dyskusja nie wracała.

Obok czterech kategorii planowania Backlog pokazuje warstwy **Do przeglądu** i warstwy **Gotowe**. Warstwa zachowuje swoją kategorię, gdy tam trafia. Jeśli zostanie ponownie otwarta, wraca tam, gdzie była zaplanowana.

### Planowanie jest ciągłe

Planowanie na poziomie warstw nigdy się nie kończy. Nie ma fazy planowania ani ustalonego momentu na nie. Dyrektor gry dba o porządek w Backlogu: dodaje nowe warstwy, przenosi warstwy między kategoriami i zmienia ich kolejność w kategorii. Zwykle dzieje się to w odpowiedzi na granie w bieżącą wersję gry, na playtesty, które Dyrektor gry przeprowadził lub zlecił, albo na to, czego zespół dowiedział się w trakcie pracy.

Zmiana priorytetów nie zaburza pracy, która już się zaczęła. Warstwy, nad którymi zespół pracuje, zostają tam, gdzie są. Nowa kolejność decyduje o tym, co będzie dalej. Dyrektor gry, który woli pracować w cyklach, takich jak sprinty czy kamienie milowe, może poczekać ze zmianami do końca cyklu. Metoda dopuszcza oba podejścia.

## 5. Kod, Assety i Treść

Warstwa powstaje przez wykonanie zestawu **zadań**. Każde zadanie to jedna porcja pracy, którą może podjąć jedna osoba. Każde zadanie należy do dokładnie jednej z trzech kategorii:

| Kategoria | Co obejmuje | Przykłady |
| --- | --- | --- |
| **Kod** | Funkcjonalność gry albo narzędzi zespołu. | Celowanie przeciwnika, system zapisu, skrypt importu poziomów, shader. |
| **Assety** | Surowy materiał: grafika, animacje, dźwięk, muzyka, modele, fonty. | Model i animacja ataku przeciwnika, odgłosy kroków, tileset poziomu. |
| **Treść** | To, czego gracze faktycznie doświadczają, powstające z połączenia kodu i assetów w grze. | Rozmieszczenie i dostrojenie przeciwników na poziomie, zbudowanie poziomu z tilesetu, napisanie questa, ustawienie dialogu, zbalansowanie broni. |

Od tego modelu pochodzi nazwa GameWeld: **kod i assety są spawane w treść.**

Warstwa może mieć zadania w dowolnym połączeniu kategorii. Nowa mechanika może być głównie Kodem. Nowy poziom może być głównie Treścią z odrobiną Assetów. Warstwa, która wymienia efekty dźwiękowe, może składać się z samych Assetów. Żadna kategoria nie jest wymagana i nie ma oczekiwanych proporcji. W niektórych okresach produkcji jakaś kategoria może w ogóle się nie pojawiać, na przykład Treść na samym początku albo Kod pod koniec.

Zadanie zachowuje swoją kategorię od początku do końca. Kategoria opisuje rodzaj pracy. Nie mówi nic o tym, jak daleko zadanie jest zaawansowane.

### Gdzie trafia design

Design nie jest czwartą kategorią. Należy do tego, co jest projektowane:

- **Design gry jako całości** (jej wizja, filary, główna pętla rozgrywki i ogólna struktura) to osobna warstwa złożona z zadań Treści. Opisuje to, czego doświadczą gracze, a to właśnie oznacza Treść.
- **Design pojedynczej funkcjonalności** należy do warstwy tej funkcjonalności, jako zadanie w kategorii tego, co kształtuje. Zaprojektowanie nowej mechaniki walki przed jej implementacją to zadanie Kodu. Ustalenie wyglądu postaci przed jej modelowaniem to zadanie Assetów. Rozrysowanie poziomu na papierze przed jego zbudowaniem to zadanie Treści.

Praktyczna zasada: zapytaj, czym stanie się ten design. Zadanie projektowe dostaje kategorię tego wyniku.

## 6. Role i podział decyzji

GameWeld ma trzy role. Jedna osoba może mieć więcej niż jedną z nich, co w małych zespołach jest częste: Dyrektor gry, który też programuje, albo projektant, który też testuje.

| Rola | Odpowiedzialność |
| --- | --- |
| **Dyrektor gry** | Odpowiada za Backlog: jakie warstwy istnieją, jaki mają priorytet i nad którymi zespół teraz pracuje. Akceptuje ukończone warstwy. |
| **Deweloper** | Buduje grę. Programiści, graficy, projektanci, scenarzyści, dźwiękowcy i wszyscy inni, którzy wytwarzają pracę, są Deweloperami. |
| **Tester** | Sprawdza, czy praca jest naprawdę wykonana. Rola opcjonalna, potrzebna tylko wtedy, gdy zespół chce, żeby zadania były weryfikowane, zanim zostaną uznane za ukończone. |

Metoda rozdziela dwa rodzaje decyzji.

**Co budować i w jakiej kolejności, decyduje Dyrektor gry.** Tylko Dyrektor gry dodaje warstwy do Backlogu, zmienia ich priorytet i decyduje, nad którymi zespół teraz pracuje.

**Jak to zbudować, decyduje zespół.** Każdy w projekcie może:

- dodawać zadania do dowolnej warstwy, w dowolnym momencie;
- komentować wszystko;
- podjąć dowolne zadanie, które jest otwarte do pracy;
- zaproponować pracę spoza bieżącego planu (rozdział 8).

Przypisanie zadania jest opcjonalne. Przypisanie zrobione z wyprzedzeniem sygnalizuje, kto ma się daną pracą zająć. Nie rezerwuje zadania i każdy może je nadal podjąć. Kiedy ktoś zaczyna pracę nad zadaniem, powinien przypisać je do siebie, żeby cały zespół widział, kto nad czym pracuje.

## 7. Podział: zamiana warstwy w zadania

Zadania warstwy, pogrupowane na Kod, Assety i Treść, nazywamy jej **Podziałem**. W GameWeld Podział to widok warstwy, a nie etap, przez który musi przejść.

Dyrektor gry i reszta zespołu wspólnie rozpisują zadania warstwy. Może to nastąpić w dowolnym momencie:

- zaraz po zdefiniowaniu warstwy, jako pierwszy szkic pracy;
- tuż przed rozpoczęciem pracy, kiedy osoby, które ją wykonają, wiedzą najwięcej;
- w trakcie pracy, gdy okazuje się, czego jeszcze potrzeba.

Warstwa może zacząć bez żadnych zadań. Zespół nie musi rozpisać wszystkich zadań, zanim zacznie. Warstwa jest ukończona dopiero wtedy, gdy ukończone są jej zadania, więc lista zadań jest roboczą definicją warstwy i może się zmieniać w miarę, jak zespół się uczy.

**Każde zadanie należy do dokładnie jednej warstwy.** Zadanie nie może istnieć samodzielnie i jedno zadanie nigdy nie należy do dwóch warstw. Gdy jakaś praca służy kilku warstwom (na przykład wspólny rig animacji), należy do warstwy, która potrzebuje jej pierwsza, a pozostałe warstwy wskazują tę warstwę jako zależność. Zależności między warstwami mają charakter wyłącznie informacyjny. Pokazują, że jedna warstwa opiera się na drugiej, ale nikogo nie blokują.

## 8. Wykonywanie pracy: Tablica

Praca odbywa się na **Tablicy**, tablicy kanbanowej.

### Wybór warstw do pracy

Dyrektor gry wybiera, nad którymi warstwami pracuje zespół. Te warstwy tworzą **zakres** Tablicy, a ich zadania stają się kartami na tablicy. Dyrektor gry szanuje priorytety i zwykle bierze warstwy ze szczytu Backlogu, czyli ze szczytu Must Have, dopóki coś tam jest. Ma jednak pewną swobodę: warstwa położona niżej może lepiej pasować do tego, kto w zespole ma wolne ręce, albo opierać się na pracy, która właśnie się skończyła. GameWeld podpowiada następną warstwę według priorytetu, ale jej nie narzuca. Jedyne warstwy, które nigdy nie wchodzą do zakresu, to te w Won't Have. Kiedy warstwa staje się ważniejsza, niż wskazuje jej miejsce, Dyrektor gry przesuwa ją w górę Backlogu, żeby kolejność nadal mówiła zespołowi, co jest ważne.

Zespół zwykle pracuje nad kilkoma warstwami naraz. Warstwy nie dzielą pracy równo: grafik może mieć już wszystko w danej warstwie zrobione, podczas gdy programistom zostały jeszcze dni pracy. Gdy w zakresie jest kilka warstw, każdy ma coś pożytecznego do zrobienia, a o tym, które to warstwy, nadal decyduje kolejność w Backlogu. Projekt ustala limit liczby warstw w zakresie, żeby zespół kończył warstwy, zamiast zaczynać ich zbyt wiele.

### Praca poza zakresem

Czasem członek zespołu ma czas na zadanie, którego warstwa nie jest w zakresie. Na przykład grafik, któremu skończyła się praca, może chcieć zacząć animacje następnego przeciwnika. Prosi o to Dyrektora gry, który może zatwierdzić to jedno zadanie bez wprowadzania całej warstwy do zakresu. Takie zadanie jest oznaczone na tablicy jako **Poza zakresem** i liczy się do swojej warstwy jak każde inne. Zespół zyskuje elastyczność, a Dyrektor gry zachowuje kontrolę nad tym, nad czym zespół pracuje.

### Przepływ zadania

Tablica ma:

- trzy kolumny **To Do**, po jednej dla Kodu, Assetów i Treści, w których zadania czekają na podjęcie;
- dowolną liczbę kolumn pośrednich, nazwanych i ułożonych przez zespół;
- końcową kolumnę **Gotowe**.

Najprostszy sposób pracy nie potrzebuje kolumn pośrednich. Ktoś bierze zadanie z To Do, wykonuje je i przesuwa do Gotowe. Zespół, który chce więcej kroków, dodaje je, na przykład *W toku*, *Do sprawdzenia* i *Sprawdź w grze*. Te kolumny znaczą to, co zespół postanowi. GameWeld nie wiąże z nimi żadnych zasad.

Zespół, który chce, żeby każde zadanie zostało sprawdzone, zanim zostanie uznane za ukończone, może ustalić, że tylko Testerzy przesuwają zadania do Gotowe. Osoba, która wykonała pracę, zostawia wtedy zadanie w kolumnie przed Gotowe, a Tester przesuwa je dalej po sprawdzeniu. Takie sprawdzenie zadania to coś innego niż akceptacja warstwy (rozdział 9).

### Rytm

Tablica może oznaczać sprint, tydzień, kamień milowy albo po prostu bieżącą pracę zespołu bez daty końcowej. Metoda nie opowiada się za żadną z tych opcji. Zespół pracujący w sposób ciągły ma jedną tablicę i wprowadza nowe warstwy do jej zakresu, gdy inne zostaną ukończone. Zespół pracujący w cyklach archiwizuje tablicę na koniec każdego cyklu i zaczyna nową. Codzienne spotkania, przeglądy i retrospektywy to wybór samego zespołu.

## 9. Kończenie warstwy

Ukończenie warstwy odbywa się w dwóch krokach, które celowo są rozdzielone.

1. **Zadania są wykonane.** Gdy każde zadanie warstwy jest w Gotowe, warstwa sama przechodzi do **Do przeglądu**. Oznacza to, że praca jest skończona. Nie oznacza jeszcze, że warstwa jest zaakceptowana.
2. **Dyrektor gry akceptuje warstwę.** Dyrektor gry sprawdza wynik w sposób, który pasuje do warstwy (grając w build, oglądając nagranie, przeglądając to, co tworzy narzędzie), i akceptuje ją jako **Gotowe**. Zaakceptowana warstwa opuszcza Tablicę, a jej miejsce w zakresie zwalnia się dla następnej warstwy.

Metoda nie określa, jak sprawdzać warstwę. Zadaje tylko jedno pytanie: czy gra jest teraz lepsza w sposób, który ta warstwa obiecywała, i czy nadal działa?

### Gdy warstwa nie przejdzie przeglądu

Jeśli wynik nie jest wystarczająco dobry, Dyrektor gry odsyła warstwę z notatką, dlaczego. Następnie dopisuje brakujące zadania albo ponownie otwiera i zmienia istniejące, a warstwa wraca do pracy. Nie ma osobnej listy „odrzuconych”. Odesłana warstwa jest po prostu znowu otwarta i ma więcej do zrobienia.

Prawo do akceptowania i odsyłania warstw można też dać głównemu testerowi. To uprawnienie nadane tej osobie, a nie dodatkowa rola ani dodatkowa lista.

### Ponowne otwieranie zaakceptowanej pracy

Zaakceptowane warstwy nie są zamknięte na zawsze. Jeśli do zaakceptowanej warstwy zostanie dodane nowe zadanie albo ukończone zadanie zostanie ponownie otwarte, warstwa znowu staje się otwarta i musi zostać zaakceptowana od nowa. Wcześniejsza akceptacja zostaje w historii. Zmiana opisu ani dodanie komentarza nie otwiera warstwy ponownie.

## 10. Zmiana kursu

Metoda zakłada, że plany się zmieniają, i każdemu rodzajowi zmiany daje zwykłe miejsce:

- **Nowe pomysły** stają się nowymi warstwami w Backlogu, w kategorii, którą Dyrektor gry uzna za właściwą, także w Won't Have.
- **Wycięte funkcjonalności** trafiają do Won't Have, gdzie decyzja pozostaje widoczna.
- **Praca, której nikt nie zaplanował**, jest obsługiwana zwykłymi warstwami i zadaniami. Jeśli wspiera istniejącą warstwę, staje się zadaniem tej warstwy. Jeśli ma własny cel, na przykład „Przyspiesz wczytywanie poziomów” albo „Usprawnij proces budowania”, staje się nową warstwą. Na drobne, różne prace zespół może prowadzić ogólną warstwę, na przykład „Wsparcie produkcji: wrzesień”. To konwencja, którą zespół może przyjąć. GameWeld jej nie wymaga.
- **Bugi** zostają w bug trackerze zespołu. GameWeld celowo nie śledzi bugów, żeby zespoły nie musiały prowadzić dwóch list. Zadanie albo warstwa może linkować do buga, gdy to pomaga, a naprawa grupy bugów może być osobną warstwą.

## 11. Czego metoda świadomie nie obejmuje

To przemyślane wybory, a nie brakujące funkcje:

- **Bez estymacji i story pointów.** O złożoności warstwy świadczy liczba jej zadań. Estymacje mogą zostać kiedyś dodane jako opcja, ale metoda od nich nie zależy.
- **Bez ustalonych faz i kamieni milowych.** Etap gry odczytuje się z samej gry (rozdział 2).
- **Bez obowiązkowych rytuałów** i długości iteracji.
- **Bez wymaganego formatu warstw** i bez wymaganych kryteriów akceptacji.
- **Bez bazy bugów.**
- **Bez znaczeń przypisanych własnym kolumnom zespołu.** Znaczenie ma tylko Gotowe.

## 12. Kiedy metoda pasuje, a kiedy nie

Metoda sprawdza się najlepiej, gdy:

- zespół jest na tyle mały, że każdy wie, co robią pozostali;
- jedna osoba, Dyrektor gry, ma zaufanie do decydowania o zakresie i priorytetach;
- grę da się od wczesnego etapu utrzymywać w stanie grywalnym.

Pasuje gorzej, gdy duży zespół potrzebuje wielu podzespołów, formalnych planów i harmonogramowania zasobów, albo gdy umowa wymaga szczegółowych estymacji z góry. Takie projekty mogą nadal używać GameWeld do codziennej pracy, ale brakujące elementy muszą wziąć skądinąd.

## 13. Przykład

1. Dyrektor gry dodaje warstwę **Przeciwnik strzelający** wysoko w Must Have. Opis ma dwie linijki: „Przeciwnik, który trzyma dystans i strzela. Powinien zmusić gracza do korzystania z osłon”.
2. W Podziale zespół dodaje zadanie Kodu na celowanie i utrzymywanie dystansu, zadanie Assetów na model i animację ataku oraz zadanie Treści na rozmieszczenie i dostrojenie przeciwnika na pierwszych dwóch poziomach.
3. Dyrektor gry wprowadza Przeciwnika strzelającego do zakresu Tablicy. Jego zadania pojawiają się w swoich kolumnach To Do.
4. Programista i grafik przypisują się każdy do swojego zadania i przesuwają je przez kolumny zespołu, *W pracy* i *Sprawdź w grze*.
5. Grafik kończy wcześniej. Zauważa zadanie animacji w warstwie **Przeciwnik latający**, której nie ma jeszcze w zakresie, i prosi o możliwość zajęcia się nim. Dyrektor gry się zgadza i zadanie pojawia się na tablicy z oznaczeniem Poza zakresem.
6. Wszystkie zadania Przeciwnika strzelającego trafiają do Gotowe i warstwa jest Do przeglądu.
7. Dyrektor gry gra w build i stwierdza, że przeciwnik strzela zbyt szybko, żeby dało się zareagować. Odsyła warstwę z notatką i dodaje zadanie Treści: „Wydłuż przygotowanie do ataku i przetestuj ponownie”. Przeciwnik strzelający jest znowu otwarty.
8. Projektant kończy zadanie. Warstwa znowu jest Do przeglądu i Dyrektor gry ją akceptuje. Gra ma teraz przeciwnika strzelającego na dwóch poziomach. To lepsza gra niż poprzednia i nadal działa.

Nikt w tym czasie nie estymował pracy, nie ustalał długości sprintu, nie wypełniał listy kryteriów akceptacji ani nie zapisywał buga w GameWeld.
