import type { PluralForms } from '../index.ts';

/** Polish: the Workboard, its scope and columns, out-of-scope requests, history, and card badges. */
export const texts: Record<string, string> = {
  // The Workboard page
  'That Workboard does not exist.': 'Ta Tablica nie istnieje.',
  'Could not load the Workboard': 'Nie udało się wczytać Tablicy',
  '← The active Workboard': '← Aktywna Tablica',
  'The active Workboard': 'Aktywna Tablica',
  'No active Workboard': 'Brak aktywnej Tablicy',
  'A Game Director creates the Workboard when the team is ready to plan work.':
    'Dyrektor gry tworzy Tablicę, gdy zespół jest gotowy do planowania pracy.',
  'This Workboard was archived on {date}. It is history: it shows the cards as they stood, and nothing on it can be changed.':
    'Ta Tablica została zarchiwizowana {date}. To historia: pokazuje karty w stanie z tamtej chwili i niczego nie można na niej zmienić.',
  'This Workboard was archived. It is history: it shows the cards as they stood, and nothing on it can be changed.':
    'Ta Tablica została zarchiwizowana. To historia: pokazuje karty w stanie z tamtej chwili i niczego nie można na niej zmienić.',
  'Create Workboard': 'Utwórz Tablicę',
  'A Workboard holds the current portion of work: a sprint, a week, a milestone, or a continuous period. The product does not infer deadlines or rules from its name.':
    'Tablica zawiera bieżącą porcję pracy: sprint, tydzień, kamień milowy albo okres ciągły. Produkt nie wyprowadza z jej nazwy żadnych terminów ani reguł.',
  'September production': 'Produkcja wrześniowa',
  'Archived Workboards': 'Zarchiwizowane Tablice',
  'archived {date}': 'zarchiwizowano {date}',

  // The board's header
  'Rename Workboard': 'Zmień nazwę Tablicy',
  'Workboard name': 'Nazwa Tablicy',
  'Click to rename this Workboard': 'Kliknij, aby zmienić nazwę tej Tablicy',
  '{n} accepted': 'zaakceptowane: {n}',
  '{done}/{placed} tasks done': 'ukończone zadania: {done}/{placed}',
  'Workboard actions': 'Działania Tablicy',
  'Archive Workboard': 'Archiwizuj Tablicę',
  '{n} unfinished {tasks} will return to Breakdown. Nothing is marked complete.':
    'Nieukończone zadania, które wrócą do Podziału: {n}. Nic nie zostanie oznaczone jako ukończone.',
  'The board becomes read-only history.': 'Tablica stanie się historią tylko do odczytu.',
  // The note itself is written by the server, in English, and is shown as it was kept.
  'Pending placement requests will be rejected with the note “Workboard archived”.':
    'Oczekujące prośby o pracę poza zakresem zostaną odrzucone z notatką „Workboard archived”.',
  'Return tasks and archive': 'Zwróć zadania i archiwizuj',

  // The end date
  'Set an end date': 'Ustaw datę końca',
  'Ends {day} · {n} {days} ago': 'Koniec {day} · {n} {days} temu',
  'Ends {day} · today': 'Koniec {day} · dzisiaj',
  'Ends {day} · {n} {days} left': 'Koniec {day} · jeszcze {n} {days}',
  'The Workboard ends on': 'Tablica kończy się',
  'Clear the date': 'Wyczyść datę',
  'Only a date for everyone to see; nothing happens on it.':
    'To tylko data widoczna dla wszystkich; nic się tego dnia nie dzieje.',

  // The scope
  Accepted: 'Zaakceptowany',
  '{n}/{limit} items in scope': '{n}/{limit} elementów w zakresie',
  '<1>{n}</1>/{limit} items in scope': '<1>{n}</1>/{limit} elementów w zakresie',
  ', {n} ready for review': ', do przeglądu: {n}',
  Scope: 'Zakres',
  'Scope limit reached. Remove an item to make room.':
    'Osiągnięto limit zakresu. Usuń element, aby zrobić miejsce.',
  'Next in priority: <1>{title}</1>. Add items from their <2>Backlog cards</2>.':
    'Następny według priorytetu: <1>{title}</1>. Dodawaj elementy z ich <2>kart w Backlogu</2>.',
  'No open item is eligible. Add items from the Backlog when there are some.':
    'Żaden otwarty element się nie kwalifikuje. Dodaj elementy z Backlogu, gdy się pojawią.',
  'No items in scope yet. Use “Add to Workboard” on a Backlog card.':
    'W zakresie nie ma jeszcze elementów. Użyj „Dodaj do Tablicy” na karcie w Backlogu.',
  'Open in Breakdown': 'Otwórz w Podziale',
  '{category} · {done}/{total} tasks complete · added {date}':
    '{category} · ukończone zadania: {done}/{total} · dodano {date}',
  'Remove {title} from scope': 'Usuń {title} z zakresu',
  'What happens to its unfinished tasks on this board?':
    'Co zrobić z jego nieukończonymi zadaniami na tej tablicy?',
  'Return them to Breakdown': 'Zwróć je do Podziału',
  'Keep them as out-of-scope work': 'Zostaw je jako pracę poza zakresem',
  'Remove from scope': 'Usuń z zakresu',

  // Cards and columns
  tasks: 'zadań',
  '{title} actions': 'Działania: {title}',
  'Delete {title}': 'Usuń {title}',
  'Delete task': 'Usuń zadanie',
  'Uploading…': 'Przesyłanie…',
  'Confirm deleting {title}': 'Potwierdź usunięcie {title}',
  'Delete this task from “{item}”? It will leave the Workboard and no longer count toward the item’s completion. Its history is kept, and you can restore it.':
    'Usunąć to zadanie z „{item}”? Zniknie z Tablicy i przestanie się liczyć do ukończenia elementu. Jego historia zostanie zachowana i można je przywrócić.',
  '“{title}” deleted from “{item}”.': 'Usunięto „{title}” z „{item}”.',
  'View deleted task': 'Zobacz usunięte zadanie',
  'Click to rename this column': 'Kliknij, aby zmienić nazwę tej kolumny',
  'Rename {name}': 'Zmień nazwę: {name}',
  'Column name': 'Nazwa kolumny',
  '{name} column actions': 'Działania kolumny {name}',
  'Rename column {name}': 'Zmień nazwę kolumny {name}',
  'Move the tasks out first': 'Najpierw przenieś zadania gdzie indziej',
  'Delete column {name}': 'Usuń kolumnę {name}',
  'Add column after {name}': 'Dodaj kolumnę po {name}',
  '+ Column': '+ Kolumna',
  'Add column': 'Dodaj kolumnę',
  'New column name': 'Nazwa nowej kolumny',

  // A new card
  'New {category} task': 'Nowe zadanie: {category}',
  '+ New task': '+ Nowe zadanie',
  'Backlog item': 'Element backlogu',
  'Parent backlog item': 'Nadrzędny element backlogu',
  'Choose an item…': 'Wybierz element…',
  'Choose an item in scope…': 'Wybierz element w zakresie…',
  'Outside scope (placed as an exception)': 'Poza zakresem (umieszczane jako wyjątek)',
  'The only item in scope, selected by default.': 'Jedyny element w zakresie, wybrany domyślnie.',
  'Add to board': 'Dodaj do tablicy',

  // Out-of-scope requests
  'Out-of-scope requests': 'Prośby o pracę poza zakresem',
  '+ Request out-of-scope work': '+ Poproś o pracę poza zakresem',
  'Request out-of-scope work': 'Poproś o pracę poza zakresem',
  "No pending requests. Members ask here, or from a task’s row in the Breakdown, when the task's item is outside the scope.":
    'Brak oczekujących próśb. Członkowie zespołu proszą tutaj albo z wiersza zadania w Podziale, gdy element zadania jest poza zakresem.',
  'under <1>{item}</1> · asked by {name} on {date}':
    'w ramach <1>{item}</1> · prosi {name} · {date}',
  'under {item} · {name}': 'w ramach {item} · {name}',
  '“{text}”': '„{text}”',
  'Approve request for {title}': 'Zatwierdź prośbę: {title}',
  'Reject request for {title}': 'Odrzuć prośbę: {title}',
  'Withdraw request for {title}': 'Wycofaj prośbę: {title}',
  'Note (optional)': 'Notatka (opcjonalnie)',
  'Decision note': 'Notatka do decyzji',
  'Approve and place': 'Zatwierdź i umieść',
  'Hide decided requests': 'Ukryj rozpatrzone prośby',
  'Show {n} decided {requests}': 'Pokaż rozpatrzone prośby ({n})',
  approved: 'zatwierdzona',
  rejected: 'odrzucona',
  withdrawn: 'wycofana',
  'Asks a Game Director to place one task on this Workboard although its backlog item is outside the scope. The task waits in the Breakdown until the request is approved.':
    'Prosi Dyrektora gry o umieszczenie jednego zadania na tej Tablicy, mimo że jego element backlogu jest poza zakresem. Zadanie czeka w Podziale do czasu zatwierdzenia prośby.',
  'Every open backlog item is already in scope.':
    'Każdy otwarty element backlogu jest już w zakresie.',
  'Choose an item outside the scope…': 'Wybierz element spoza zakresu…',
  Task: 'Zadanie',
  'New task…': 'Nowe zadanie…',
  'New task’s title': 'Tytuł nowego zadania',
  'Why now? (optional)': 'Dlaczego teraz? (opcjonalnie)',
  'Send request': 'Wyślij prośbę',

  // History. A line reads "who: what was done", which needs no gendered verb.
  '<1>{actor}</1> {action}': '<1>{actor}</1>: {action}',
  System: 'System',
  'Nothing recorded yet.': 'Nic jeszcze nie zapisano.',
  '{file}, now the cover': '{file}, teraz okładka',
  'the item was accepted; {n} of its tasks left the board':
    'element został zaakceptowany; zadania, które opuściły tablicę: {n}',
  'created the project': 'utworzono projekt',
  'changed project settings': 'zmieniono ustawienia projektu',
  'added a member': 'dodano osobę',
  'changed a member’s roles': 'zmieniono role osoby',
  'removed a member': 'usunięto osobę',
  'created the item': 'utworzono element',
  'edited the item': 'edytowano element',
  'reordered the item': 'zmieniono kolejność elementu',
  'moved the item to another category': 'przeniesiono element do innej kategorii',
  'archived the item': 'zarchiwizowano element',
  'restored the item': 'przywrócono element',
  'item became Ready for Review': 'element przeszedł do stanu „Do przeglądu”',
  'item returned to Open': 'element wrócił do stanu „Otwarty”',
  'accepted the item as Done': 'zaakceptowano element jako „Gotowe”',
  'rejected the item': 'odrzucono element',
  'added a link': 'dodano link',
  'removed a link': 'usunięto link',
  'created the task': 'utworzono zadanie',
  'edited the task': 'edytowano zadanie',
  'completed the task': 'ukończono zadanie',
  'reopened the task': 'ponownie otwarto zadanie',
  'moved the task to another item': 'przeniesiono zadanie do innego elementu',
  'archived the task': 'zarchiwizowano zadanie',
  'restored the task': 'przywrócono zadanie',
  'placed the task on the Workboard': 'umieszczono zadanie na Tablicy',
  'placed the task as out-of-scope work': 'umieszczono zadanie jako pracę poza zakresem',
  'moved the task to another column': 'przeniesiono zadanie do innej kolumny',
  'returned the task to Breakdown': 'zwrócono zadanie do Podziału',
  'added the item to the Workboard scope': 'dodano element do zakresu Tablicy',
  'removed the item from the Workboard scope': 'usunięto element z zakresu Tablicy',
  'created the Workboard': 'utworzono Tablicę',
  'renamed the Workboard': 'zmieniono nazwę Tablicy',
  'archived the Workboard': 'zarchiwizowano Tablicę',
  'added a column': 'dodano kolumnę',
  'changed a column': 'zmieniono kolumnę',
  'deleted a column': 'usunięto kolumnę',
  'requested out-of-scope placement': 'poproszono o pracę poza zakresem',
  'withdrew a placement request': 'wycofano prośbę o pracę poza zakresem',
  'approved a placement request': 'zatwierdzono prośbę o pracę poza zakresem',
  'rejected a placement request': 'odrzucono prośbę o pracę poza zakresem',
  'added an attachment': 'dodano załącznik',
  'removed an attachment': 'usunięto załącznik',
  'added a dependency': 'dodano zależność',
  'removed a dependency': 'usunięto zależność',
  'seeded the demo project': 'utworzono projekt demonstracyjny',

  // A task's status and badges
  'On {board} · {column}': 'Na tablicy {board} · {column}',
  ' · Out of scope': ' · Poza zakresem',
  'Was due {day}': 'Termin minął {day}',
  'Due {day}': 'Termin: {day}',
  'Overdue, was due ': 'Po terminie, termin minął ',
  'Due ': 'Termin: ',

  // The assignee's avatar
  'Assigned to {name}': 'Osoba przypisana: {name}',
  nobody: 'nikt',
  'Assignee of {task}: {name}': 'Osoba przypisana do {task}: {name}',
  '{label}. Click to change.': '{label}. Kliknij, aby zmienić.',
  'Assign {task}': 'Przypisz: {task}',
};

export const plurals: Record<string, PluralForms> = {
  'out-of-scope task': ['zadanie poza zakresem', 'zadania poza zakresem', 'zadań poza zakresem'],
  'pending request': ['oczekująca prośba', 'oczekujące prośby', 'oczekujących próśb'],
};
