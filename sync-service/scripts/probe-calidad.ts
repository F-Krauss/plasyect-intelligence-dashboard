import 'dotenv/config';
import { withFirebird } from '../src/firebird.js';

async function main() {
  await withFirebird(async (query) => {
    console.log('\n=== FACDET por FA_CALIDAD ===');
    console.table(await query(
      `SELECT FA_CALIDAD, COUNT(*) AS N FROM FACDET GROUP BY FA_CALIDAD`
    ));

    console.log('\n=== PTLOTCAB por LC_CALIDAD ===');
    console.table(await query(
      `SELECT LC_CALIDAD, COUNT(*) AS N, SUM(LC_PARLOT) AS PARES
       FROM PTLOTCAB GROUP BY LC_CALIDAD`
    ));

    console.log('\n=== PTLOTDET por LD_CALIDAD ===');
    console.table(await query(
      `SELECT LD_CALIDAD, COUNT(*) AS N, SUM(LD_PARES) AS PARES
       FROM PTLOTDET GROUP BY LD_CALIDAD`
    ));

    console.log('\n=== PTLOTCAB columnas ===');
    const cols = await query(
      `SELECT TRIM(RF.RDB$FIELD_NAME) AS COL FROM RDB$RELATION_FIELDS RF
       WHERE RF.RDB$RELATION_NAME = 'PTLOTCAB' ORDER BY RF.RDB$FIELD_POSITION`
    );
    console.log(cols.map((c) => (c as { COL: string }).COL).join(', '));

    console.log('\n=== PTLOTCAB muestra calidad <> 1 ===');
    console.dir(await query(`SELECT FIRST 3 * FROM PTLOTCAB WHERE LC_CALIDAD <> 1`), { depth: 2, maxStringLength: 50 });

    console.log('\n=== PIOCHAS (PCH_DEFECTO) ===');
    console.table(await query(`SELECT COUNT(*) AS N FROM PIOCHAS`));
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
