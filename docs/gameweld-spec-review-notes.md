# GameWeld — uwagi do specyfikacji v0.1

Data: 16 września 2026
Dotyczy: `docs/gameweld-production-specification-v0.2.md`

## Ocena ogólna

Dokument jest wewnętrznie spójny, a podział na Confirmed / Proposed / Open jest czytelny. Reguła jednego rodzica, rozdzielenie członkostwa w zakresie boardu od umieszczenia zadania oraz rozdzielenie ukończenia zadania od akceptacji elementu backlogu trzymają się razem we wszystkich sekcjach.

## Luki do dodania do Sekcji 16

### 1. Ukończenie zadania powinno być stanem zadania, nie tylko „jest w kolumnie Done”

Sekcja 11 definiuje ukończenie przez umieszczenie w kolumnie Done. Jednak zadania na zarchiwizowanych boardach zachowują swoje umieszczenie, a zadania mogą wracać do Breakdown. Przechowywanie flagi ukończenia na zadaniu, ustawianej przy wejściu do Done, usuwa niejednoznaczność przy archiwizacji boardów lub zmianie umieszczenia.

### 2. Ponowne otwieranie zadania przy włączonym ograniczeniu Done jest nieokreślone

Sekcja 16 mówi, że edytorzy zadań mogą je ponownie otwierać. Jeśli jednak Done jest ograniczone do Testerów, nie wiadomo, czy Developer może przeciągnąć zadanie z powrotem z Done. Wyjście z Done powinno prawdopodobnie wymagać tego samego uprawnienia co wejście.

### 3. Zaakceptowane elementy nadal liczą się do limitu zakresu

Sekcja 8 mówi, że Done nie zmienia listy zakresu, więc board zapełnia się zaakceptowaną pracą, dopóki Director ręcznie jej nie usunie. To do obrony, ale powinno być jawną decyzją, bo zaskoczy użytkowników.

### 4. Limit zakresu i zadania out-of-scope razem pozwalają na nieograniczoną pracę na boardzie

Sekcja 9 mówi, że osobny limit wyjątków nie jest potrzebny. W MVP to w porządku, ale Workboard powinien pokazywać liczbę zadań out-of-scope obok liczby elementów, aby limit pozostał znaczący.

### 5. Usunięcie elementu z zakresu, gdy zadanie jest w kolumnie pośredniej

Sekcja 12 oferuje „powrót do Breakdown lub pozostawienie jako wyjątek”, ale powrót zadania z kolumny pośredniej gubi jego pozycję w kolumnie. Należy określić, czy kolumna jest zachowywana do ponownego umieszczenia, czy resetowana do To Do.

### 6. Aktywacja umieszcza zadania automatycznie, późniejsze tworzenie nie

Sekcje 7 i 8 różnią się celowo, ale ta asymetria powinna być zaznaczona w UI, aby Director aktywujący element nie był zaskoczony, że zadania utworzone później w Breakdown pozostają nieumieszczone.

## Drobne

- Tabela uprawnień (Sekcja 4) oznacza zatwierdzanie pracy out-of-scope przez Directora jako „Yes, proposed”, podczas gdy Sekcja 16 wymienia to jako decyzję o priorytecie High. Warto wskazać, które miejsce jest źródłem prawdy.
