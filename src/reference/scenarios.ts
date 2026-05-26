export interface Scenario {
  id: string;
  label: string;
  role: string;
  starterPrompt: string;
}

export const SCENARIOS: Scenario[] = [
  {
    id: 'restaurant',
    label: '🍜 Restaurant',
    role: 'a friendly server in a casual Korean restaurant',
    starterPrompt: 'Greet the customer and ask if they are ready to order.',
  },
  {
    id: 'cafe',
    label: '☕ Café',
    role: 'a barista in a small Seoul café',
    starterPrompt: 'Greet the customer and ask what they would like.',
  },
  {
    id: 'transit',
    label: '🚇 Transit',
    role: 'a station attendant at a Korean subway station',
    starterPrompt: 'Greet a confused tourist who looks like they need directions.',
  },
];

export function findScenario(id: string): Scenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
