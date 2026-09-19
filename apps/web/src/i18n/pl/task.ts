import type { PluralForms } from '../index.ts';

/** Polish: the task's window and what it holds: checklist, comments, attachments, links. */
export const texts: Record<string, string> = {
  // The task's window
  Task: 'Zadanie',
  'Task: {title}': 'Zadanie: {title}',
  '{category} task': 'Zadanie: {category}',
  'completed {date}': 'ukończono {date}',
  'Could not load the task': 'Nie udało się wczytać zadania',
  'Mark complete': 'Oznacz jako ukończone',
  'Marks the task complete': 'Oznacza zadanie jako ukończone',
  'Marks the task complete and moves its card to Done on {board}':
    'Oznacza zadanie jako ukończone i przenosi jego kartę do kolumny Gotowe na tablicy {board}',
  'Task resources': 'Zasoby zadania',
  'Close task': 'Zamknij zadanie',
  'Unsaved changes': 'Niezapisane zmiany',
  'The title or description has changes that are not saved.':
    'Tytuł lub opis zawiera niezapisane zmiany.',
  'Discard and close': 'Odrzuć zmiany i zamknij',
  'Keep editing': 'Edytuj dalej',

  // Title, description, category, assignee
  'What is the desired result, and how could someone check it?':
    'Jaki ma być rezultat i jak można go sprawdzić?',
  'Free-form notes, links to references, anything useful.':
    'Dowolne notatki, linki do materiałów, wszystko, co się przyda.',
  'Click to edit the title': 'Kliknij, aby edytować tytuł',
  'Click to edit the description': 'Kliknij, aby edytować opis',
  'Edit task': 'Edytuj zadanie',
  'Category cannot be changed while the task is on a Workboard':
    'Kategorii nie można zmienić, dopóki zadanie jest na Tablicy',
  'Assigned to {name}.': 'Przypisano: {name}.',
  'Unassigned.': 'Usunięto przypisanie.',

  // Reopen
  Reopen: 'Otwórz ponownie',
  'Reopen task': 'Otwórz zadanie ponownie',
  'Reopening marks the task unfinished. If its backlog item is Ready for Review or accepted as Done, the item returns to Open and any acceptance is kept in history.':
    'Ponowne otwarcie oznacza zadanie jako nieukończone. Jeśli jego element backlogu ma stan Do przeglądu albo został zaakceptowany jako Gotowe, element wraca do stanu Otwarty, a akceptacja pozostaje w historii.',

  // Game Director actions
  'Game Director actions': 'Działania Dyrektora gry',
  'Move task to another item': 'Przenieś zadanie do innego elementu',
  'Move to another backlog item': 'Przenieś do innego elementu backlogu',
  'Choose an item…': 'Wybierz element…',
  'Move task': 'Przenieś zadanie',
  'This task is deleted and excluded from its item’s completion check. Restoring an unfinished task adds it back to the active Workboard when its item is in scope.':
    'To zadanie jest usunięte i nie liczy się przy sprawdzaniu ukończenia jego elementu. Przywrócenie nieukończonego zadania umieszcza je z powrotem na aktywnej Tablicy, jeśli jego element jest w zakresie.',
  'Deleting removes the task from the Workboard and its item’s completion checks without counting it as done. History is kept and the task can be restored.':
    'Usunięcie zdejmuje zadanie z Tablicy i wyłącza je ze sprawdzania ukończenia jego elementu, nie licząc go jako wykonanego. Historia zostaje, a zadanie można przywrócić.',
  'Restore task': 'Przywróć zadanie',
  'Confirm deletion': 'Potwierdź usunięcie',
  'Delete task': 'Usuń zadanie',

  // Labels, due date, blocked
  None: 'Brak',
  Unblock: 'Odblokuj',
  'What is it waiting for? (optional)': 'Na co czeka? (opcjonalnie)',
  'Why the task is blocked': 'Dlaczego zadanie jest zablokowane',
  'Flag as blocked': 'Oznacz jako zablokowane',
  'Flag as blocked…': 'Oznacz jako zablokowane…',
  '+ Add label': '+ Dodaj etykietę',
  'Add label': 'Dodaj etykietę',
  'No labels in this project yet.': 'W tym projekcie nie ma jeszcze etykiet.',
  'Label name': 'Nazwa etykiety',
  'Takes the label off every task that carries it':
    'Zdejmuje etykietę ze wszystkich zadań, które ją mają',
  'Delete label': 'Usuń etykietę',
  'Edit label {name}': 'Edytuj etykietę {name}',
  'New label…': 'Nowa etykieta…',
  'New label name': 'Nazwa nowej etykiety',
  'Label colour': 'Kolor etykiety',
  red: 'czerwony',
  orange: 'pomarańczowy',
  yellow: 'żółty',
  green: 'zielony',
  teal: 'morski',
  blue: 'niebieski',
  purple: 'fioletowy',
  gray: 'szary',

  // Checklist
  'Checklist: {done} of {total} done': 'Lista kontrolna: wykonano {done} z {total}',
  'Checklist progress': 'Postęp listy kontrolnej',
  'Rename {title}': 'Zmień nazwę: {title}',
  'Remove {title}': 'Usuń: {title}',
  'Item text': 'Treść punktu',
  'Click to rename': 'Kliknij, aby zmienić nazwę',
  'Add checklist item': 'Dodaj punkt listy kontrolnej',
  'Add a step… (paste a list to add several)': 'Dodaj krok… (wklej listę, aby dodać kilka naraz)',
  'New checklist item': 'Nowy punkt listy kontrolnej',

  // Comments
  'No comments yet.': 'Nie ma jeszcze komentarzy.',
  Rejected: 'Odrzucono',
  edited: 'edytowano',
  'Edit comment': 'Edytuj komentarz',
  'Delete comment': 'Usuń komentarz',
  'Comment text': 'Treść komentarza',
  'Add comment': 'Dodaj komentarz',
  'Notes for the team, review findings, build references…':
    'Uwagi dla zespołu, wnioski z przeglądu, odnośniki do buildów…',
  'Mention a member': 'Wspomnij osobę',
  'Markdown works here: **bold**, lists, links. Type @ to mention someone.':
    'Działa tu Markdown: **pogrubienie**, listy, linki. Wpisz @, aby o kimś wspomnieć.',
  image: 'obraz',

  // Attachments
  'Upload failed': 'Nie udało się przesłać pliku',
  'Could not delete the attachment': 'Nie udało się usunąć załącznika',
  'No attachments yet.': 'Nie ma jeszcze załączników.',
  cover: 'okładka',
  'Remove cover': 'Usuń okładkę',
  'Use as cover': 'Ustaw jako okładkę',
  'Delete attachment {name}': 'Usuń załącznik {name}',
  'Add attachment': 'Dodaj załącznik',
  'Uploading…': 'Przesyłanie…',
  'Images, documents, builds… anything useful.':
    'Obrazy, dokumenty, buildy… wszystko, co się przyda.',
  'Drop a PNG, JPEG, GIF, or WebP image on a card to make it the cover.':
    'Upuść na kartę obraz PNG, JPEG, GIF lub WebP, aby ustawić go jako okładkę.',

  // Links, and the side panels' titles (ResourcePanel shows the English title it is given)
  'No links yet.': 'Nie ma jeszcze linków.',
  'Remove link {name}': 'Usuń link {name}',
  'Add link': 'Dodaj link',
  URL: 'Adres URL',
  Label: 'Etykieta',
  Optional: 'Opcjonalnie',
  Dependencies: 'Zależności',
};

export const plurals: Record<string, PluralForms> = {};
