import type { PluralForms } from '../index.ts';

export const texts: Record<string, string> = {
  // The heading of the section, where common's „Archiwizuj” is the button.
  'Archive [heading]': 'Archiwizacja',
  // Settings form
  'Only a Game Director can change settings.': 'Tylko Dyrektor gry może zmieniać ustawienia.',
  'Workboard scope limit': 'Limit zakresu Tablicy',
  'Restrict moving tasks into Done to Testers':
    'Tylko Testerzy mogą przenosić zadania do kolumny „Gotowe”',
  'Save settings': 'Zapisz ustawienia',
  'Settings saved.': 'Ustawienia zapisano.',
  'Your unsaved changes were replaced with the current values.':
    'Niezapisane zmiany zostały zastąpione aktualnymi wartościami.',
  'Could not save': 'Nie udało się zapisać',

  // Members
  Members: 'Członkowie',
  Member: 'Członek',
  'May accept items': 'Może akceptować elementy',
  '(you)': '(ty)',
  '{name} is {role}': '{name} – rola: {role}',
  '{name} may accept items': '{name} może akceptować elementy',
  'Game Directors always may accept': 'Dyrektorzy gry zawsze mogą akceptować',
  'Remove {name}': 'Usuń: {name}',
  'A member needs at least one role. Remove the member instead.':
    'Członek projektu musi mieć co najmniej jedną rolę. Zamiast tego usuń tę osobę.',
  'Could not update the member': 'Nie udało się zaktualizować członka projektu',
  'Could not remove the member': 'Nie udało się usunąć członka projektu',

  // Adding a member
  'Add member': 'Dodaj członka',
  Email: 'E-mail',
  'name@example.com': 'imie@example.com',
  'Anyone with a Google account. Someone who has not signed in yet is invited, and joins the first time they sign in with this address.':
    'Każdy, kto ma konto Google. Osoba, która jeszcze się nie logowała, dostaje zaproszenie i dołącza przy pierwszym logowaniu z tego adresu.',
  '{email} is invited. GameWeld sends no e-mail: tell them to sign in at {address} with that address.':
    'Zaproszono {email}. GameWeld nie wysyła e-maili: przekaż tej osobie, żeby zalogowała się na {address} tym adresem.',

  // Invitations
  'Invited, not signed in yet': 'Zaproszeni, jeszcze niezalogowani',
  'Invited by': 'Zaprasza',
  'Cancel invitation': 'Anuluj zaproszenie',
  'Cancel the invitation for {email}': 'Anuluj zaproszenie dla: {email}',
  'Could not cancel the invitation': 'Nie udało się anulować zaproszenia',
  Roles: 'Role',
  'Could not add the member': 'Nie udało się dodać członka projektu',

  // Archiving the project
  'Archived project': 'Projekt zarchiwizowany',
  'This project is archived and hidden from the active list. Nothing was deleted.':
    'Ten projekt jest zarchiwizowany i ukryty na liście aktywnych. Nic nie zostało usunięte.',
  'Archiving hides the project from the active list. Nothing is deleted, and it can be restored later.':
    'Archiwizacja ukrywa projekt na liście aktywnych. Nic nie jest usuwane, a projekt można później przywrócić.',
  'Restore project': 'Przywróć projekt',
  'Archive project': 'Archiwizuj projekt',
  'Could not change the archive state': 'Nie udało się zmienić stanu archiwizacji',

  // Export
  'Import and export': 'Import i eksport',
  Export: 'Eksport',
  'Everything in the project as one JSON document: settings, members, labels, items, tasks with their checklists, comments and links, Workboards, requests, and the whole activity history. Attachments are listed by name; the files stay here. Or the tasks alone, one per row, for a spreadsheet.':
    'Cały projekt w jednym dokumencie JSON: ustawienia, członkowie, etykiety, elementy, zadania z listami kontrolnymi, komentarzami i linkami, Tablice, prośby oraz cała historia aktywności. Załączniki są wymienione z nazwy; pliki zostają tutaj. Albo same zadania, po jednym w wierszu, do arkusza kalkulacyjnego.',
  'Export the project (JSON)': 'Eksportuj projekt (JSON)',
  'Export the tasks (CSV)': 'Eksportuj zadania (CSV)',

  // Import from Trello. The menu entries are quoted as Trello shows them, with a gloss.
  'Import from Trello': 'Import z Trello',
  'In Trello, open the board’s menu, then “Print, export, and share”, then “Export as JSON”. Archived lists and cards are left out. Everything arrives in the Backlog under Should Have, unplaced: what enters a Workboard is decided here. Card members are not brought over.':
    'W Trello otwórz menu tablicy, potem „Print, export, and share” (Drukuj, eksportuj i udostępnij), a następnie „Export as JSON” (Eksportuj jako JSON). Zarchiwizowane listy i karty są pomijane. Wszystko trafia do Backlogu jako Should Have, poza tablicą: o tym, co wchodzi na Tablicę, decyduje się tutaj. Członkowie kart nie są przenoszeni.',
  'That file is not JSON. In Trello: board menu → Print, export, and share → Export as JSON.':
    'Ten plik nie jest w formacie JSON. W Trello: menu tablicy → Print, export, and share → Export as JSON.',
  'A Trello card becomes': 'Karta Trello staje się',
  '<1>a task.</1> Each list becomes a backlog item holding its cards, which keep their labels, date, checklists, comments, and links.':
    '<1>zadaniem.</1> Każda lista staje się elementem backlogu zawierającym swoje karty, które zachowują etykiety, termin, listy kontrolne, komentarze i linki.',
  '<1>a backlog item.</1> The entries of its checklists become its tasks; its labels and date are written into its description.':
    '<1>elementem backlogu.</1> Pozycje jej list kontrolnych stają się jego zadaniami; jej etykiety i termin są zapisywane w jego opisie.',
  'Category of the tasks': 'Kategoria zadań',
  'Used unless a card’s label names a kind of work, such as “Art” or “Code”.':
    'Stosowana, chyba że etykieta karty wskazuje rodzaj pracy, np. „Art” lub „Code”.',
  'Trello export': 'Eksport z Trello',
  'The import failed': 'Import się nie powiódł',
  'Importing…': 'Importowanie…',
  // The counted nouns stand in the accusative after „Zaimportowano”.
  'Imported {items} and {tasks}': 'Zaimportowano {items} i {tasks}',
  'Open the Backlog': 'Otwórz Backlog',
};

export const plurals: Record<string, PluralForms> = {
  'backlog item': ['element backlogu', 'elementy backlogu', 'elementów backlogu'],
  'new label': ['nową etykietę', 'nowe etykiety', 'nowych etykiet'],
  // English keeps "entries" for every count, so the plural is the key.
  'checklist entries': [
    'pozycję listy kontrolnej',
    'pozycje listy kontrolnej',
    'pozycji listy kontrolnej',
  ],
};
