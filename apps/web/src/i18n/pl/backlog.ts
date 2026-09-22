import type { PluralForms } from '../index.ts';

/** Polish: the Backlog, the Breakdown with its review and dependencies, My tasks, and the lanes. */
export const texts: Record<string, string> = {
  // Backlog
  '{items} · {count} on the Workboard': '{items} · {count} na Tablicy',
  'Open {title} in the Breakdown': 'Otwórz „{title}” w Podziale',
  'Open in the Breakdown': 'Otwórz w Podziale',
  'Move {title} up': 'Przesuń „{title}” w górę',
  'Move up': 'Przesuń w górę',
  'Move {title} down': 'Przesuń „{title}” w dół',
  'Move down': 'Przesuń w dół',
  'Move {title} to category': 'Przenieś „{title}” do kategorii',
  'Completed tasks / all tasks': 'Ukończone zadania / wszystkie zadania',
  '{completed}/{total} tasks': '{completed}/{total} zadań',
  'No tasks yet': 'Brak zadań',
  'On {name}': 'Na tablicy {name}',
  'Awaiting acceptance': 'Czeka na akceptację',
  Accepted: 'Zaakceptowany',
  'Uploading…': 'Przesyłanie…',
  'Scope limit reached ({count}/{limit})': 'Osiągnięto limit zakresu ({count}/{limit})',
  'Add to {board} · next in priority': 'Dodaj do tablicy {board} · następny według priorytetu',
  'Add to {board} · “{title}” is next in priority':
    'Dodaj do tablicy {board} · następny według priorytetu jest „{title}”',
  'Add to {board}': 'Dodaj do tablicy {board}',
  'Add {title} to Workboard': 'Dodaj „{title}” do Tablicy',
  'Activate {title}': 'Aktywuj „{title}”',
  'Joins the scope of <1>{board}</1>; its unfinished tasks enter the To Do columns, and tasks added later in the Breakdown join the board too.':
    'Dołącza do zakresu tablicy <1>{board}</1>; jego nieukończone zadania trafiają do kolumn „To Do”, a zadania dodane później w Podziale również dołączą do tablicy.',
  Activate: 'Aktywuj',
  'Add item to {category}': 'Dodaj element do kategorii {category}',
  'New backlog item': 'Nowy element backlogu',
  'New item in {category}': 'Nowy element w kategorii {category}',

  // Breakdown: the list of items and an item's page
  'Backlog items': 'Elementy backlogu',
  'No backlog items yet. Add some on the Backlog tab.':
    'Brak elementów backlogu. Dodaj je w zakładce Backlog.',
  'Choose a backlog item to see its breakdown.':
    'Wybierz element backlogu, aby zobaczyć jego podział.',
  'Could not load the item': 'Nie udało się wczytać elementu',
  Archived: 'Zarchiwizowany',
  '{completed}/{total} tasks complete': 'Ukończono {completed}/{total} zadań',
  Tasks: 'Zadania',
  'Grouped by nature; any combination is fine and no category is required. While the item is on the Workboard, new tasks go straight to its To Do columns.':
    'Pogrupowane według rodzaju; każda kombinacja jest dobra i żadna kategoria nie jest wymagana. Gdy element jest na Tablicy, nowe zadania trafiają od razu do jego kolumn „To Do”.',
  'Item resources': 'Zasoby elementu',
  Dependencies: 'Zależności',
  'Restore item': 'Przywróć element',
  'Archive item': 'Archiwizuj element',
  'Archived item': 'Zarchiwizowany element',
  'This item is hidden from the Backlog. Restore it to plan it again.':
    'Ten element jest ukryty w Backlogu. Przywróć go, aby znów go planować.',
  'Archiving hides the item from the Backlog. Tasks placed on a Workboard must be returned or finished first.':
    'Archiwizacja ukrywa element w Backlogu. Zadania umieszczone na Tablicy trzeba najpierw z niej zdjąć lub ukończyć.',
  'Click to edit the title': 'Kliknij, aby edytować tytuł',
  'Edit item': 'Edytuj element',
  'No description yet.': 'Brak opisu.',
  'Click to edit the description': 'Kliknij, aby edytować opis',
  'No description yet. Click to add one.': 'Brak opisu. Kliknij, aby go dodać.',
  'What should players experience? How will the team know this is ready?':
    'Czego mają doświadczyć gracze? Po czym zespół pozna, że to jest gotowe?',
  'No description.': 'Brak opisu.',
  'Free-form. Describe the intended result however suits the team; nothing here is required.':
    'Dowolna forma. Opisz zamierzony efekt tak, jak pasuje zespołowi; nic tutaj nie jest wymagane.',
  'Dismiss writing prompt': 'Ukryj podpowiedź',
  Dismiss: 'Ukryj',

  // Breakdown: an item's tasks, by category
  'Could not place the task': 'Nie udało się umieścić zadania',
  'Could not add the task': 'Nie udało się dodać zadania',
  'This item is accepted. Adding or reopening a task returns it to Open; the acceptance stays in history.':
    'Ten element jest zaakceptowany. Dodanie lub ponowne otwarcie zadania przywraca mu stan Otwarty; akceptacja pozostaje w historii.',
  'This item is Ready for Review. Adding or reopening a task returns it to Open.':
    'Ten element jest w stanie Do przeglądu. Dodanie lub ponowne otwarcie zadania przywraca mu stan Otwarty.',
  '{category} tasks': 'Zadania: {category}',
  'Expand {category} tasks': 'Rozwiń zadania: {category}',
  'Collapse {category} tasks': 'Zwiń zadania: {category}',
  'No {category} tasks.': 'Brak zadań w kategorii „{category}”.',
  'Could not assign the task': 'Nie udało się przypisać zadania',
  'Could not complete the task': 'Nie udało się ukończyć zadania',
  'Mark {title} complete': 'Oznacz „{title}” jako ukończone',
  'Mark complete': 'Oznacz jako ukończone',
  'Add to Workboard': 'Dodaj do Tablicy',
  'Place as exception': 'Umieść jako wyjątek',
  'Placement requested': 'Prośba o pracę poza zakresem',
  'Could not withdraw the request': 'Nie udało się wycofać prośby',
  'Request placement of {title}': 'Poproś o pracę poza zakresem: „{title}”',
  'Request placement on Workboard': 'Poproś o pracę poza zakresem',
  'Could not send the request': 'Nie udało się wysłać prośby',
  'Asks a Game Director to place this task on the Workboard although its item is outside the scope.':
    'Prosi Dyrektora gry o umieszczenie tego zadania na Tablicy, mimo że jego element jest poza zakresem.',
  'Why now? (optional)': 'Dlaczego teraz? (opcjonalnie)',
  Reason: 'Powód',
  'Send request': 'Wyślij prośbę',
  'Hide deleted tasks': 'Ukryj usunięte zadania',
  'Show {count} {tasks}': 'Pokaż {count} {tasks}',
  'Add {category} task': 'Dodaj zadanie: {category}',
  'New {category} task': 'Nowe zadanie: {category}',

  // Review and acceptance
  Review: 'Przegląd',
  '<1>Ready for Review.</1> Every task is complete; the item awaits acceptance.':
    '<1>Do przeglądu.</1> Wszystkie zadania są ukończone; element czeka na akceptację.',
  ' A Game Director or a member with the acceptance permission accepts it.':
    ' Akceptuje go Dyrektor gry lub osoba z uprawnieniem do akceptacji.',
  'Accept as Done': 'Zaakceptuj jako Gotowe',
  'Accept item': 'Zaakceptuj element',
  'Reject item': 'Odrzuć element',
  'Note (optional)': 'Notatka (opcjonalnie)',
  'What needs to change': 'Co trzeba zmienić',
  'Accepted work is finished: the item leaves the Workboard with all its tasks, freeing a place in the scope of {board}. The tasks stay complete and remain here in the Breakdown.':
    'Zaakceptowana praca jest zakończona: element opuszcza Tablicę wraz ze wszystkimi zadaniami, zwalniając miejsce w zakresie tablicy {board}. Zadania pozostają ukończone i są nadal widoczne tutaj, w Podziale.',
  'Accepted work is finished: the item leaves the Workboard with all its tasks. The tasks stay complete and remain here in the Breakdown.':
    'Zaakceptowana praca jest zakończona: element opuszcza Tablicę wraz ze wszystkimi zadaniami. Zadania pozostają ukończone i są nadal widoczne tutaj, w Podziale.',
  'The rejection is recorded as a comment. Then reopen a task or add a follow-up task in the Breakdown; the item stays Ready for Review until a task changes.':
    'Odrzucenie zostaje zapisane jako komentarz. Następnie otwórz ponownie zadanie albo dodaj kolejne w Podziale; element pozostaje w stanie Do przeglądu, dopóki jakieś zadanie się nie zmieni.',
  'Confirm acceptance': 'Potwierdź akceptację',
  'Record rejection': 'Zapisz odrzucenie',
  '<1>Accepted</1> by {name} on {date}': '<1>Zaakceptowano</1> przez {name}, {date}',
  '“{note}”': '„{note}”',
  'Acceptance history': 'Historia akceptacji',
  'Accepted by {name} on {date}': 'Zaakceptowano przez {name}, {date}',
  'Current acceptance by {name} on {date}': 'Obecna akceptacja: {name}, {date}',
  'superseded {date}': 'unieważniona {date}',

  // Dependencies
  'Depends on': 'Zależy od',
  'Nothing. Dependencies are informational: they never block work.':
    'Od niczego. Zależności mają charakter informacyjny: nigdy nie blokują pracy.',
  'Remove dependency on {title}': 'Usuń zależność od „{title}”',
  'Add dependency': 'Dodaj zależność',
  'Item this one depends on': 'Element, od którego zależy ten',
  'Add a dependency…': 'Dodaj zależność…',
  'Needed by': 'Wymagany przez',

  // My tasks
  'Could not load your tasks': 'Nie udało się wczytać zadań',
  'Priority {place} of {total}': 'Priorytet {place} z {total}',
  'Assigned to you': 'Przypisane do ciebie',
  'No unfinished tasks are assigned to you in this project.':
    'W tym projekcie nie masz przypisanych nieukończonych zadań.',
  '{count} {tasks}. Drag the cards into the order you mean to work in; the order is yours alone.':
    '{count} {tasks}. Ułóż karty w kolejności, w jakiej chcesz pracować; tę kolejność widzisz tylko ty.',
  'My tasks, in my order': 'Moje zadania, w mojej kolejności',

  // Lanes of cards
  Column: 'Kolumna',
  'Visible column': 'Widoczna kolumna',
  'Show earlier columns, {count} hidden': 'Pokaż wcześniejsze kolumny, ukrytych: {count}',
  '← {count} more': '← jeszcze {count}',
  'Show later columns, {count} hidden': 'Pokaż dalsze kolumny, ukrytych: {count}',
  '{count} more →': 'jeszcze {count} →',
  'Expand {lane}, {cards}': 'Rozwiń: {lane}, {cards}',
  'Expand {lane}': 'Rozwiń: {lane}',
  'Collapse {lane}': 'Zwiń: {lane}',
  'No matching cards': 'Brak pasujących kart',
  'No cards yet': 'Brak kart',
  'Show {count} more': 'Pokaż kolejne ({count})',
  'Show {count} older': 'Pokaż starsze ({count})',
  'Show the rest ({count})': 'Pokaż resztę ({count})',
  'Show fewer': 'Pokaż mniej',
};

export const plurals: Record<string, PluralForms> = {
  // The Backlog's count says "items" in English whatever the number, so that is the key.
  items: ['element', 'elementy', 'elementów'],
  // An adjective takes the noun's form, so the pair is counted as one.
  'unfinished task': ['nieukończone zadanie', 'nieukończone zadania', 'nieukończonych zadań'],
  'deleted task': ['usunięte zadanie', 'usunięte zadania', 'usuniętych zadań'],
};
