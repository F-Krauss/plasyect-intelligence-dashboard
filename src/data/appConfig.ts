import { Stage, Tenant } from '../types';

export const TENANTS: Tenant[] = [
  { id: 'plasyect_matriz', name: 'Plasyect Matriz - EVA Sandalias', location: 'León, Gto. Planta Central', primaryColor: 'indigo' }
];

export const STAGES: Stage[] = [
  { id: 'alta_pedido', name: 'Alta de Pedido', order: 1, color: 'bg-blue-600', description: 'Registro inicial de volumen, modelo, tallas y cotización.' },
  { id: 'almacen', name: 'Almacén', order: 2, color: 'bg-cool-gray-500', description: 'Pesaje de compuesto EVA, pigmentos y agente soplante (expansor).' },
  { id: 'inyeccion', name: 'Inyección', order: 3, color: 'bg-amber-500', description: 'Fusión e inyección a alta presión y vulcanización.' },
  { id: 'estabilizacion', name: 'Estabilización', order: 4, color: 'bg-purple-500', description: 'Estabilización de dimensiones (encogimiento natural del EVA).' },
  { id: 'aduana', name: 'Aduana', order: 5, color: 'bg-rose-500', description: 'Verificación de densidad, peso, dureza Shore A y liberación.' },
  { id: 'banda', name: 'Banda', order: 6, color: 'bg-indigo-500', description: 'Recorte de rebabas, marcado láser, empaque e identificación.' },
  { id: 'embarque', name: 'Embarque', order: 7, color: 'bg-emerald-500', description: 'Paletizado final y entrega a transporte cliente.' },
  { id: 'facturacion', name: 'Facturación', order: 8, color: 'bg-teal-500', description: 'Cierre de lote y facturación del embarque.' }
];
