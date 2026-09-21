import type { PluralForms } from '../index.ts';

/**
 * Polish: what surrounds every page (the top bar, quick open, the bell, the display and filter
 * menus) and the pages outside a project: signing in, the projects, a new one, the profile.
 */
export const texts: Record<string, string> = {
  // Top bar
  'Your profile and picture': 'Twój profil i zdjęcie',
  'Switch persona': 'Zmień personę',
  'Sign out': 'Wyloguj się',

  // Signing in
  'Sign-in failed': 'Logowanie nie powiodło się',
  'Production Management System': 'System zarządzania produkcją',
  'Sign in as': 'Zaloguj się jako',
  'Mock sign-in is enabled for local development. Pick a persona.':
    'Logowanie próbne jest włączone na potrzeby lokalnego rozwoju. Wybierz personę.',
  'Sign in': 'Logowanie',
  'Sign in with {provider}': 'Zaloguj się przez: {provider}',
  'GameWeld is by invitation. Use the address you were invited with.':
    'Do GameWeld wchodzi się na zaproszenie. Użyj adresu, na który przyszło zaproszenie.',
  '{email} has not been invited. Ask a Game Director of your project to invite this address, or sign in with the account that was invited.':
    'Adres {email} nie ma zaproszenia. Poproś Dyrektora gry swojego projektu o zaproszenie tego adresu albo zaloguj się kontem, które zaproszono.',
  'This account has not been invited. Ask a Game Director of your project to invite you.':
    'To konto nie ma zaproszenia. Poproś Dyrektora gry swojego projektu o zaproszenie.',
  'Your provider has not verified this account’s e-mail address, so it cannot be matched to an invitation.':
    'Dostawca logowania nie potwierdził adresu e-mail tego konta, więc nie można go dopasować do zaproszenia.',
  'The sign-in took too long or was started in another browser. Please try again.':
    'Logowanie trwało zbyt długo albo rozpoczęto je w innej przeglądarce. Spróbuj ponownie.',
  'The sign-in provider cannot be reached right now. Please try again in a moment.':
    'Dostawca logowania jest teraz nieosiągalny. Spróbuj ponownie za chwilę.',
  'No sign-in provider is configured for this instance.':
    'W tej instancji nie skonfigurowano żadnego sposobu logowania.',

  // Projects
  Projects: 'Projekty',
  'Archived projects': 'Zarchiwizowane projekty',
  'Show active': 'Pokaż aktywne',
  'Show archived': 'Pokaż zarchiwizowane',
  'New project': 'Nowy projekt',
  'No archived projects.': 'Brak zarchiwizowanych projektów.',
  'You are not a member of any project yet. Create one to become its Game Director.':
    'Nie należysz jeszcze do żadnego projektu. Utwórz projekt, aby zostać jego Dyrektorem gry.',
  'Your roles: {roles}': 'Twoje role: {roles}',
  'scope limit {limit}': 'limit zakresu {limit}',
  'Done restricted to Testers': '„Gotowe” tylko dla Testerów',

  // A new project
  'Could not create the project': 'Nie udało się utworzyć projektu',
  "You become the project's Game Director. Settings can be changed later.":
    'Zostajesz Dyrektorem gry tego projektu. Ustawienia można zmienić później.',
  'Workboard scope limit': 'Limit zakresu Tablicy',
  "Maximum number of backlog items included in the active Workboard's scope.":
    'Największa liczba elementów backlogu w zakresie aktywnej Tablicy.',
  'Create project': 'Utwórz projekt',

  // The profile
  'Your profile': 'Twój profil',
  'Close profile': 'Zamknij profil',
  Picture: 'Zdjęcie',
  'Shown in the top bar, on the cards assigned to you, and when someone picks an assignee. Without a picture, your initials are used.':
    'Widoczne na górnym pasku, na przypisanych do Ciebie kartach i przy wyborze osoby przypisanej. Bez zdjęcia pokazywane są Twoje inicjały.',
  'Choose a PNG, JPEG, GIF, or WebP picture.': 'Wybierz obraz PNG, JPEG, GIF lub WebP.',
  'Picture saved.': 'Zapisano zdjęcie.',
  'Picture removed; your initials are shown instead.':
    'Usunięto zdjęcie; zamiast niego widać Twoje inicjały.',
  'Upload a new picture': 'Prześlij nowe zdjęcie',
  'Upload a picture': 'Prześlij zdjęcie',
  'Change the circle': 'Zmień kadr',
  'Remove picture': 'Usuń zdjęcie',
  Language: 'Język',
  'Kept in this browser. The page reloads in the new language.':
    'Zapamiętywany w tej przeglądarce. Strona wczyta się ponownie w nowym języku.',

  // API tokens, in the profile
  'API tokens': 'Tokeny API',
  'A token lets a script or an AI assistant use GameWeld as you, with your permissions, through the <1>API</1>. Anyone who has it can do what it allows, so keep it as you would a password.':
    'Token pozwala skryptowi albo asystentowi AI korzystać z GameWeld w Twoim imieniu, z Twoimi uprawnieniami, przez <1>API</1>. Kto go ma, może zrobić wszystko, na co token pozwala, więc chroń go jak hasło.',
  'Your new token “{name}”. Copy it now: it is not shown again.':
    'Twój nowy token „{name}”. Skopiuj go teraz: nie zostanie pokazany ponownie.',
  'To use it from Claude Code, run this in a terminal:':
    'Aby używać go w Claude Code, uruchom to w terminalu:',
  'Then, in Claude Code, add the GameWeld skill:': 'Następnie dodaj w Claude Code skill GameWeld:',
  Copy: 'Kopiuj',
  Copied: 'Skopiowano',
  'Your tokens': 'Twoje tokeny',
  'Read only': 'Tylko odczyt',
  'Read and write': 'Odczyt i zapis',
  'Made {date}': 'Utworzony {date}',
  'last used {date}': 'ostatnio użyty {date}',
  'never used': 'jeszcze nieużyty',
  Revoke: 'Unieważnij',
  'Revoke {name}': 'Unieważnij „{name}”',
  'What it is for, such as “Claude on my laptop”': 'Do czego służy, np. „Claude na moim laptopie”',
  Access: 'Dostęp',
  'Make a token': 'Utwórz token',
  // A change made through a token, in the history and the bell.
  'via {token}': 'przez {token}',

  // Cropping the picture
  'This picture could not be shown. Try another file.':
    'Nie udało się pokazać tego obrazu. Spróbuj użyć innego pliku.',
  'Choose the part of the picture inside the circle: drag the picture or use the arrow keys; plus and minus zoom.':
    'Wybierz część obrazu wewnątrz okręgu: przeciągnij obraz lub użyj klawiszy strzałek; plus i minus zmieniają powiększenie.',
  Zoom: 'Powiększenie',
  'Save picture': 'Zapisz zdjęcie',

  // A project's page
  'Project not found, or you are not a member.':
    'Nie znaleziono projektu albo do niego nie należysz.',
  'Could not load the project': 'Nie udało się wczytać projektu',
  'Project settings': 'Ustawienia projektu',
  'Project sections': 'Sekcje projektu',

  // Quick open
  'Quick open': 'Szybkie otwieranie',
  'Quick open ({shortcut})': 'Szybkie otwieranie ({shortcut})',
  'Find a task, an item, a section, a project…': 'Znajdź zadanie, element, sekcję, projekt…',
  'Find a project…': 'Znajdź projekt…',
  Results: 'Wyniki',
  'Nothing found.': 'Nic nie znaleziono.',
  Tasks: 'Zadania',
  'Backlog items': 'Elementy backlogu',
  'Go to': 'Przejdź do',
  'All projects': 'Wszystkie projekty',
  complete: 'ukończone',
  accepted: 'zaakceptowany',
  'ready for review': 'do przeglądu',

  // The bell. In a sentence, <1> is who did it and <2> the task or item; the present tense
  // keeps the verbs free of the person's gender.
  Notifications: 'Powiadomienia',
  'Notifications: {waiting} waiting for you, {unread} unread':
    'Powiadomienia: czekające na Ciebie: {waiting}, nieprzeczytane: {unread}',
  'Waiting for you': 'Czeka na Ciebie',
  'Mark all read': 'Oznacz wszystkie jako przeczytane',
  'Nothing yet. You will hear when a task is given to you, someone comments on your work, or a decision you asked for is made.':
    'Na razie nic. Damy znać, gdy ktoś przydzieli Ci zadanie lub skomentuje Twoją pracę albo gdy zapadnie decyzja, na którą czekasz.',
  '<1>{who}</1> asks to place <2>{task}</2> on the Workboard':
    '<1>{who}</1> prosi o umieszczenie <2>{task}</2> na Tablicy',
  '<2>{item}</2> is ready for review': '<2>{item}</2> czeka na przegląd',
  'a task': 'zadanie',
  'an item': 'element',
  '<1>{who}</1> assigned <2>{task}</2> to you': '<1>{who}</1> przypisuje Ci <2>{task}</2>',
  '<1>{who}</1> took <2>{task}</2> off your hands': '<1>{who}</1> zdejmuje z Ciebie <2>{task}</2>',
  '<1>{who}</1> commented on <2>{subject}</2>': '<1>{who}</1> komentuje <2>{subject}</2>',
  '<1>{who}</1> flagged <2>{task}</2> as blocked':
    '<1>{who}</1> oznacza <2>{task}</2> jako zablokowane',
  '<1>{who}</1> mentioned you on <2>{subject}</2>':
    '<1>{who}</1> wspomina o Tobie w <2>{subject}</2>',
  'Your request to place <2>{task}</2> was approved':
    'Zatwierdzono Twoją prośbę o umieszczenie <2>{task}</2> na Tablicy',
  'Your request to place <2>{task}</2> was rejected':
    'Odrzucono Twoją prośbę o umieszczenie <2>{task}</2> na Tablicy',
  '<1>{who}</1> accepted <2>{item}</2>': '<1>{who}</1> akceptuje <2>{item}</2>',
  '<1>{who}</1> sent <2>{item}</2> back from review':
    '<1>{who}</1> odsyła <2>{item}</2> z przeglądu',
  '“{detail}”': '„{detail}”',
  unread: 'nieprzeczytane',
  'just now': 'przed chwilą',
  '{n} min ago': '{n} min temu',
  '{n} h ago': '{n} godz. temu',

  // Display options
  'Display options': 'Opcje wyświetlania',
  Display: 'Widok',
  'Collapse empty columns': 'Zwijaj puste kolumny',
  'Small cover images': 'Małe okładki',
  'Center columns': 'Wyśrodkuj kolumny',
  'Center cards': 'Wyśrodkuj karty',
  'Only for you, in this browser.': 'Tylko dla Ciebie, w tej przeglądarce.',

  // Search and filters of cards
  'Search titles…': 'Szukaj w tytułach…',
  'Search titles': 'Szukaj w tytułach',
  'Close search': 'Zamknij wyszukiwanie',
  Filters: 'Filtry',
  Anyone: 'Ktokolwiek',
  Type: 'Typ',
  'Any type': 'Dowolny typ',
  Label: 'Etykieta',
  'Any label': 'Dowolna etykieta',
  'Backlog item': 'Element backlogu',
  'Any item': 'Dowolny element',
  'Blocked only': 'Tylko zablokowane',
  'Out of scope only': 'Tylko poza zakresem',
  'Only for you, until you leave or reload.':
    'Tylko dla Ciebie, do opuszczenia lub ponownego wczytania strony.',
  // The noun comes from the page in English ("items", "tasks"); the count says enough.
  'Showing {shown} of {total} {noun}. Reordering is off while filtering.':
    'Widoczne: {shown} z {total}. Podczas filtrowania nie można zmieniać kolejności.',
  'Clear filters': 'Wyczyść filtry',
};

export const plurals: Record<string, PluralForms> = {
  // The projects page counts "backlog items" with the same English word for any number.
  'backlog items': ['element backlogu', 'elementy backlogu', 'elementów backlogu'],
};
