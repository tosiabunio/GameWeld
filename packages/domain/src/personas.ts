import type { ProjectRole } from './roles.ts';

/**
 * Mock sign-in personas (T1). They exist only in local and test configurations and are seeded
 * as ordinary users with identities under the "mock" provider.
 */
export interface Persona {
  key: string;
  displayName: string;
  email: string;
  roles: readonly ProjectRole[];
}

export const PERSONAS: readonly Persona[] = [
  {
    key: 'director',
    displayName: 'Dana Director',
    email: 'director@gameweld.local',
    roles: ['director'],
  },
  {
    key: 'developer',
    displayName: 'Devin Developer',
    email: 'developer@gameweld.local',
    roles: ['developer'],
  },
  { key: 'tester', displayName: 'Tess Tester', email: 'tester@gameweld.local', roles: ['tester'] },
];

export function findPersona(key: string): Persona | undefined {
  return PERSONAS.find((p) => p.key === key);
}
