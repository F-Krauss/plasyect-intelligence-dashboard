import type { BootstrapData, Tenant, UserSession } from './domain.js';

export const defaultUser: UserSession = {
  username: 'Luis Felipe Bedia',
  email: 'lf.bedia@gmail.com',
  role: 'DIRECTOR_GENERAL',
  require2FA: true,
  has2FAVerified: true
};

const tenants: Tenant[] = [
  { id: 'plasyect_matriz', name: 'Plasyect Matriz - EVA Sandalias', location: 'Leon, Gto. Planta Central', primaryColor: 'indigo' }
];

export const seedData: BootstrapData = {
  tenants,
  users: [defaultUser],
  clients: [],
  models: [],
  orders: [],
  batches: [],
  machines: [],
  bands: [],
  defects: [],
  audits: [],
  ocrDocuments: []
};
