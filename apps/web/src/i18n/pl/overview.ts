import type { PluralForms } from '../index.ts';

/** Polish: the project's Overview: its figures, progress by priority and kind, and its map. */
export const texts: Record<string, string> = {
  Overview: 'Przegląd',
  'At a glance': 'W skrócie',
  '{items} and {tasks}, not counting archived ones.': '{items} i {tasks}, bez zarchiwizowanych.',
  Figures: 'Liczby',
  'Backlog items': 'Elementy backlogu',
  '{done} done · {review} ready for review · {open} open':
    '{done} gotowe · {review} do przeglądu · {open} otwarte',
  'Tasks complete': 'Ukończone zadania',
  '{done} of {total}': '{done} z {total}',
  'In progress': 'W toku',
  'On a Workboard, past To Do': 'Na tablicy, za kolumną To Do',
  Waiting: 'Czekające',
  '{todo} in To Do · {unplaced} on no board': '{todo} w To Do · {unplaced} poza tablicą',
  'Flagged, not complete': 'Oznaczone, nieukończone',
  Overdue: 'Po terminie',
  'Past their date': 'Minął ich termin',
  Unassigned: 'Nieprzypisane',
  'Not complete, nobody on it': 'Nieukończone, bez osoby przypisanej',
  'By priority': 'Według priorytetu',
  '{done} of {total} complete': '{done} z {total} ukończonych',
  'items: {done} done, {review} in review, {open} open':
    'elementy: {done} gotowe, {review} w przeglądzie, {open} otwarte',
  'Tasks by kind': 'Zadania według rodzaju',
  '{done} complete · {progress} in progress · {waiting} waiting':
    '{done} ukończone · {progress} w toku · {waiting} czeka',
  'Project map': 'Mapa projektu',
  "Every Backlog item but the Won't Have ones, its area the number of its tasks. Open items take their priority's colour, the strong part the share of their tasks complete; items accepted as Done stand apart, at the end.":
    "Każdy element backlogu poza Won't Have, a jego powierzchnia to liczba zadań. Otwarte elementy mają kolor swojego priorytetu, a mocniejsza część to udział ukończonych zadań. Elementy zaakceptowane jako Gotowe stoją osobno, na końcu.",
  "No items to map yet: Won't Have ones are left out.":
    "Na mapie nie ma jeszcze elementów: elementy Won't Have są pomijane.",
  Legend: 'Legenda',
  'Tasks not complete': 'Zadania nieukończone',
  'Accepted as Done': 'Zaakceptowane jako Gotowe',
  '{n} in progress': '{n} w toku',
  '{n} waiting': '{n} czeka',
  '{n} blocked': '{n} zablokowane',
  'Show the map as a table': 'Pokaż mapę jako tabelę',
  Item: 'Element',
  Priority: 'Priorytet',
  State: 'Stan',
  'on the Workboard': 'na tablicy',
};

export const plurals: Record<string, PluralForms> = {};
