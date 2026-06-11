/**
 * Sondea tablas candidatas de calidad/defectos directamente en el FDB
 * (solo lectura). Uso: npx tsx scripts/probe-defecto.ts
 */
import 'dotenv/config';
import { withFirebird } from '../src/firebird.js';

async function main() {
  await withFirebird(async (query) => {
    for (const table of ['DEFECTO', 'ERRAVAN', 'PTPAR', 'OBSLOT']) {
      try {
        const cols = await query(
          `SELECT TRIM(RF.RDB$FIELD_NAME) AS COL
           FROM RDB$RELATION_FIELDS RF
           WHERE RF.RDB$RELATION_NAME = ? ORDER BY RF.RDB$FIELD_POSITION`,
          [table]
        );
        const count = await query(`SELECT COUNT(*) AS N FROM ${table}`);
        console.log(`\n=== ${table} (${(count[0] as { N: number }).N} filas) ===`);
        console.log('Columnas:', cols.map((c) => (c as { COL: string }).COL).join(', '));
        const sample = await query(`SELECT FIRST 5 * FROM ${table}`);
        console.dir(sample, { depth: 2 });
      } catch (error) {
        console.log(`\n=== ${table} -> ERROR: ${(error as Error).message}`);
      }
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
