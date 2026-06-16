import 'dotenv/config';
import { withFirebird } from '../src/firebird.js';

async function main() {
  await withFirebird(async (query) => {
    const cols = await query(
      `SELECT TRIM(RF.RDB$RELATION_NAME) AS TABLA, TRIM(RF.RDB$FIELD_NAME) AS COL
       FROM RDB$RELATION_FIELDS RF
       JOIN RDB$RELATIONS R ON R.RDB$RELATION_NAME = RF.RDB$RELATION_NAME
       WHERE R.RDB$SYSTEM_FLAG = 0 AND R.RDB$VIEW_BLR IS NULL
         AND (RF.RDB$FIELD_NAME LIKE '%DEF%' OR RF.RDB$FIELD_NAME LIKE '%CALID%'
              OR RF.RDB$FIELD_NAME LIKE '%SEGUND%' OR RF.RDB$FIELD_NAME LIKE '%MERMA%'
              OR RF.RDB$FIELD_NAME LIKE '%RECHAZ%' OR RF.RDB$FIELD_NAME LIKE '%SCRAP%')
       ORDER BY 1, 2`
    );
    console.log('Columnas candidatas de calidad/defecto:');
    for (const c of cols) console.log(`  ${(c as { TABLA: string }).TABLA}.${(c as { COL: string }).COL}`);

    // Inspecciona las tablas que aparezcan, con conteo
    const tables = [...new Set(cols.map((c) => (c as { TABLA: string }).TABLA))];
    for (const t of tables) {
      try {
        const n = await query(`SELECT COUNT(*) AS N FROM ${t}`);
        console.log(`\n${t}: ${(n[0] as { N: number }).N} filas`);
        if ((n[0] as { N: number }).N > 0) {
          const sample = await query(`SELECT FIRST 3 * FROM ${t}`);
          console.dir(sample, { depth: 2, maxStringLength: 60 });
        }
      } catch (error) {
        console.log(`${t}: ERROR ${(error as Error).message}`);
      }
    }
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
