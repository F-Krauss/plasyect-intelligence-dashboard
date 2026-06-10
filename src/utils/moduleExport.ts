import { zipSync } from 'fflate';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

type ExportTable = {
  name: string;
  rows: string[][];
};

type ModuleExportOptions = {
  rootId: string;
  moduleName: string;
  tenantName: string;
  fileBaseName: string;
};

const encoder = new TextEncoder();

const xmlEscape = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

const cleanText = (value: string | null | undefined) =>
  (value || '').replace(/\s+/g, ' ').trim();

const safeFileName = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80) || 'plasyect_export';

const sheetName = (value: string, index: number) => {
  const cleaned = value.replace(/[\\/*?:[\]]/g, ' ').replace(/\s+/g, ' ').trim();
  return (cleaned || `Tabla ${index + 1}`).slice(0, 31);
};

const uniqueSheetNames = (tables: ExportTable[]) => {
  const seen = new Map<string, number>();

  return tables.map((table, index) => {
    const base = sheetName(table.name, index);
    const count = seen.get(base) || 0;
    seen.set(base, count + 1);
    if (count === 0) return base;

    const suffix = ` ${count + 1}`;
    return `${base.slice(0, 31 - suffix.length)}${suffix}`;
  });
};

const colName = (index: number) => {
  let value = index + 1;
  let name = '';
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
};

const downloadBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const findTableName = (table: HTMLTableElement, index: number) => {
  const caption = cleanText(table.caption?.innerText);
  if (caption) return caption;

  const panel = table.closest('section, article, div');
  const heading = panel?.querySelector('h1, h2, h3, h4');
  return cleanText((heading as HTMLElement | null)?.innerText) || `Tabla ${index + 1}`;
};

const tableRows = (table: HTMLTableElement) =>
  Array.from(table.rows)
    .map(row => Array.from(row.cells).map(cell => cleanText(cell.innerText)))
    .filter(row => row.some(Boolean));

const fallbackRows = (root: HTMLElement, moduleName: string, tenantName: string) => {
  const headings = Array.from(root.querySelectorAll('h1, h2, h3, h4'))
    .map(node => cleanText((node as HTMLElement).innerText))
    .filter(Boolean);
  const textLines = cleanText(root.innerText)
    .split(/(?<=[.!?])\s+|\n+/)
    .map(cleanText)
    .filter(line => line.length >= 8)
    .filter((line, index, lines) => lines.indexOf(line) === index)
    .slice(0, 80);

  return [
    ['Campo', 'Valor'],
    ['Modulo', moduleName],
    ['Tenant', tenantName],
    ['Fecha exportacion', new Date().toLocaleString()],
    ...headings.map((heading, index) => [`Encabezado ${index + 1}`, heading]),
    ...textLines.map((line, index) => [`Contenido ${index + 1}`, line])
  ];
};

const collectTables = ({ rootId, moduleName, tenantName }: ModuleExportOptions): ExportTable[] => {
  const root = document.getElementById(rootId);
  if (!root) throw new Error(`No existe el modulo exportable: ${rootId}`);

  const tables = Array.from(root.querySelectorAll('table'))
    .map((table, index) => ({
      name: findTableName(table, index),
      rows: tableRows(table)
    }))
    .filter(table => table.rows.length > 0);

  if (tables.length > 0) return tables;

  return [{
    name: 'Resumen',
    rows: fallbackRows(root, moduleName, tenantName)
  }];
};

const worksheetXml = (rows: string[][]) => {
  const body = rows.map((row, rowIndex) => {
    const cells = row.map((value, colIndex) => {
      const cellRef = `${colName(colIndex)}${rowIndex + 1}`;
      return `<c r="${cellRef}" t="inlineStr"><is><t>${xmlEscape(value)}</t></is></c>`;
    }).join('');
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join('');

  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetData>${body}</sheetData>
</worksheet>`;
};

const workbookXml = (sheetNames: string[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    ${sheetNames.map((name, index) => `<sheet name="${xmlEscape(name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}
  </sheets>
</workbook>`;

const workbookRelsXml = (tables: ExportTable[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  ${tables.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}
</Relationships>`;

const contentTypesXml = (tables: ExportTable[]) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  ${tables.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>`;

const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>`;

const coreXml = (moduleName: string) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title>${xmlEscape(moduleName)}</dc:title>
  <dc:creator>Plasyect Intelligence Dashboard</dc:creator>
  <dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created>
</cp:coreProperties>`;

const appXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
  <Application>Plasyect Intelligence Dashboard</Application>
</Properties>`;

export const exportModuleAsXlsx = (options: ModuleExportOptions) => {
  const tables = collectTables(options);
  const names = uniqueSheetNames(tables);
  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': encoder.encode(contentTypesXml(tables)),
    '_rels/.rels': encoder.encode(rootRelsXml),
    'xl/workbook.xml': encoder.encode(workbookXml(names)),
    'xl/_rels/workbook.xml.rels': encoder.encode(workbookRelsXml(tables)),
    'docProps/core.xml': encoder.encode(coreXml(options.moduleName)),
    'docProps/app.xml': encoder.encode(appXml)
  };

  tables.forEach((table, index) => {
    files[`xl/worksheets/sheet${index + 1}.xml`] = encoder.encode(worksheetXml(table.rows));
  });

  const zipped = zipSync(files);
  downloadBlob(
    new Blob([zipped], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }),
    `${safeFileName(options.fileBaseName)}.xlsx`
  );
};

export const exportModuleAsPdf = (options: ModuleExportOptions) => {
  const tables = collectTables(options);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 38;

  doc.setFontSize(14);
  doc.text(options.moduleName, 36, y);
  y += 18;
  doc.setFontSize(8);
  doc.text(`Tenant: ${options.tenantName}`, 36, y);
  doc.text(`Exportado: ${new Date().toLocaleString()}`, pageWidth - 36, y, { align: 'right' });
  y += 18;

  tables.forEach((table, index) => {
    if (index > 0) {
      doc.addPage();
      y = 38;
    }

    doc.setFontSize(10);
    doc.text(table.name, 36, y);
    y += 8;

    const [headRow, ...bodyRows] = table.rows;
    autoTable(doc, {
      head: [headRow || ['Campo', 'Valor']],
      body: bodyRows.length ? bodyRows : [['Sin registros', '']],
      startY: y,
      margin: { left: 36, right: 36 },
      styles: { fontSize: 6, cellPadding: 3, overflow: 'linebreak' },
      headStyles: { fillColor: [15, 23, 42], textColor: [255, 255, 255] },
      alternateRowStyles: { fillColor: [248, 250, 252] }
    });
  });

  doc.save(`${safeFileName(options.fileBaseName)}.pdf`);
};
