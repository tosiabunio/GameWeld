import type { PluralForms } from '../index.ts';

/**
 * Polish: the vocabulary every screen shares. The product's own terms follow one glossary, so
 * that a thing is called the same everywhere:
 *
 *   Backlog → Backlog · Breakdown → Podział · Workboard → Tablica · My tasks → Moje zadania
 *   backlog item → element · task → zadanie · scope → zakres · out of scope → poza zakresem
 *   Must/Should/Could/Won't Have stay as they are: teams say them in English
 *   Open → Otwarty · Ready for Review → Do przeglądu · Done → Gotowe
 *   Code → Kod · Assets → Assety · Content → Treść
 *   Game Director → Dyrektor gry · Developer → Deweloper · Tester → Tester
 *   assignee → osoba przypisana · label → etykieta · checklist → lista kontrolna
 */
export const texts: Record<string, string> = {
  // Domain labels (packages/domain), looked up by their English text.
  'Must Have': 'Must Have',
  'Should Have': 'Should Have',
  'Could Have': 'Could Have',
  "Won't Have": "Won't Have",
  'Ready for Review': 'Do przeglądu',
  Open: 'Otwarty',
  Done: 'Gotowe',
  Code: 'Kod',
  Assets: 'Assety',
  Content: 'Treść',
  'Game Director': 'Dyrektor gry',
  Developer: 'Deweloper',
  Tester: 'Tester',

  // Sections
  Backlog: 'Backlog',
  Breakdown: 'Podział',
  Workboard: 'Tablica',
  'My tasks': 'Moje zadania',
  Settings: 'Ustawienia',

  // Verbs and small words used everywhere
  Save: 'Zapisz',
  Cancel: 'Anuluj',
  Add: 'Dodaj',
  Edit: 'Edytuj',
  Delete: 'Usuń',
  Remove: 'Usuń',
  Restore: 'Przywróć',
  Close: 'Zamknij',
  Rename: 'Zmień nazwę',
  Archive: 'Archiwizuj',
  Accept: 'Zaakceptuj',
  Reject: 'Odrzuć',
  Approve: 'Zatwierdź',
  Withdraw: 'Wycofaj',
  Import: 'Importuj',
  'Loading…': 'Wczytywanie…',
  'Saved.': 'Zapisano.',
  'Saving…': 'Zapisywanie…',
  'Something went wrong': 'Coś poszło nie tak',
  Title: 'Tytuł',
  Name: 'Nazwa',
  Description: 'Opis',
  Category: 'Kategoria',
  Assignee: 'Osoba przypisana',
  Unassigned: 'Nieprzypisane',
  Labels: 'Etykiety',
  'Due date': 'Termin',
  Blocked: 'Zablokowane',
  Checklist: 'Lista kontrolna',
  Comments: 'Komentarze',
  Comment: 'Komentarz',
  Attachments: 'Załączniki',
  Links: 'Linki',
  History: 'Historia',
  Complete: 'Ukończone',
  Unplaced: 'Poza tablicą',
  Deleted: 'Usunięte',
  'Out of scope': 'Poza zakresem',
  No: 'Nie',
  Yes: 'Tak',
};

export const plurals: Record<string, PluralForms> = {
  task: ['zadanie', 'zadania', 'zadań'],
  item: ['element', 'elementy', 'elementów'],
  card: ['karta', 'karty', 'kart'],
  day: ['dzień', 'dni', 'dni'],
  comment: ['komentarz', 'komentarze', 'komentarzy'],
  link: ['link', 'linki', 'linków'],
  label: ['etykieta', 'etykiety', 'etykiet'],
  request: ['prośba', 'prośby', 'próśb'],
  member: ['osoba', 'osoby', 'osób'],
  project: ['projekt', 'projekty', 'projektów'],
};
