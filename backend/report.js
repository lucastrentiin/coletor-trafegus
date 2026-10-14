const fs = require('fs');
const path = require('path');

const esc = v => String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');

const MESES_PT = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

// Nome da aba baseado no periodo consultado (ex.: mes -> "Julho_2026"),
// igual ao padrao usado na planilha dos Gerentes de Contas. Excel limita
// nome de aba a 31 caracteres e proibe \ / ? * [ ] :
function sheetNameForRange(range) {
    const ddmmyyyy = iso => {
        const [y, m, d] = String(iso || '').split('-');
        return d && m && y ? `${d}_${m}_${y}` : String(iso || '');
    };
    let name;
    if (range?.mode === 'MES' && range.start) {
        const [year, month] = range.start.split('-');
        name = `${MESES_PT[Number(month) - 1] || month}_${year}`;
    } else if (range?.mode === 'SEMANA' && range.start) {
        name = `Semana_${ddmmyyyy(range.start)}`;
    } else if (range?.mode === 'PERIODO' && range.start) {
        name = `Periodo_${ddmmyyyy(range.start)}_a_${ddmmyyyy(range.endInclusive || range.start)}`;
    } else if (range?.start) {
        name = `Dia_${ddmmyyyy(range.start)}`;
    } else {
        name = 'Resumo por Cliente';
    }
    return name.replace(/[\\/\?\*\[\]:]/g, '_').slice(0, 31);
}

function save(date, results) {
    let html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Coleta ${esc(date)}</title><style>body{font:14px Arial;margin:30px;background:#f4f6fa}.c{background:#fff;padding:18px;margin:15px 0;border-radius:12px}.ok{color:#087f5b}.bad{color:#c92a2a}table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left}th{background:#111;color:#fff}</style></head><body><h1>Coleta Trafegus</h1><p>Data: ${esc(date)}</p>`;
    for (const r of results) {
        html += `<div class="c"><h2>${esc(r.client.name)} <span class="${r.ok ? 'ok' : 'bad'}">${r.ok ? 'OK' : 'FALHA'}</span></h2>`;
        if (!r.ok) html += `<p class="bad">${esc(r.error)}</p>`;
        else {
            html += '<table><tr><th>Escopo</th><th>Categoria</th><th>Indicador</th><th>Evento</th><th>Quantidade</th></tr>';
            for (const i of r.rows || []) html += `<tr><td>${esc(i.escopo || 'PERIODO')}</td><td>${esc(i.categoria)}</td><td>${esc(i.indicador)}</td><td>${esc(i.evento)}</td><td>${esc(i.quantidade)}</td></tr>`;
            html += '</table>';
        }
        html += '</div>';
    }
    html += '</body></html>';
    const dir = path.join(__dirname, '..', 'reports');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `coleta_${date}.html`);
    fs.writeFileSync(file, html, 'utf8');
    return file;
}

function colLetter(n) {
    let s = '';
    while (n > 0) {
        const r = (n - 1) % 26;
        s = String.fromCharCode(65 + r) + s;
        n = Math.floor((n - 1) / 26);
    }
    return s;
}

const CRC_TABLE = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        t[n] = c >>> 0;
    }
    return t;
})();

function crc32(buf) {
    let c = 0xffffffff;
    for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()) {
    const year = Math.max(1980, date.getFullYear());
    return {
        time: ((date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2)) >>> 0,
        date: (((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate()) >>> 0
    };
}

function zipStore(files) {
    const parts = [];
    const central = [];
    let offset = 0;
    const now = dosDateTime();
    for (const file of files) {
        const name = Buffer.from(file.name, 'utf8');
        const data = Buffer.isBuffer(file.data) ? file.data : Buffer.from(file.data, 'utf8');
        const crc = crc32(data);
        const local = Buffer.alloc(30 + name.length);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4);
        local.writeUInt16LE(0, 6);
        local.writeUInt16LE(0, 8);
        local.writeUInt16LE(now.time & 0xffff, 10);
        local.writeUInt16LE(now.date & 0xffff, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(data.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        name.copy(local, 30);
        parts.push(local, data);

        const cd = Buffer.alloc(46 + name.length);
        cd.writeUInt32LE(0x02014b50, 0);
        cd.writeUInt16LE(20, 4);
        cd.writeUInt16LE(20, 6);
        cd.writeUInt16LE(0, 8);
        cd.writeUInt16LE(0, 10);
        cd.writeUInt16LE(now.time & 0xffff, 12);
        cd.writeUInt16LE(now.date & 0xffff, 14);
        cd.writeUInt32LE(crc, 16);
        cd.writeUInt32LE(data.length, 20);
        cd.writeUInt32LE(data.length, 24);
        cd.writeUInt16LE(name.length, 28);
        cd.writeUInt16LE(0, 30);
        cd.writeUInt16LE(0, 32);
        cd.writeUInt16LE(0, 34);
        cd.writeUInt16LE(0, 36);
        cd.writeUInt32LE(0, 38);
        cd.writeUInt32LE(offset, 42);
        name.copy(cd, 46);
        central.push(cd);
        offset += local.length + data.length;
    }
    const centralData = Buffer.concat(central);
    const eocd = Buffer.alloc(22);
    eocd.writeUInt32LE(0x06054b50, 0);
    eocd.writeUInt16LE(0, 4);
    eocd.writeUInt16LE(0, 6);
    eocd.writeUInt16LE(files.length, 8);
    eocd.writeUInt16LE(files.length, 10);
    eocd.writeUInt32LE(centralData.length, 12);
    eocd.writeUInt32LE(offset, 16);
    eocd.writeUInt16LE(0, 20);
    return Buffer.concat([...parts, centralData, eocd]);
}

function cellXml(ref, value, style = 0) {
    if (value === null || value === undefined || value === '') return `<c r="${ref}" s="${style}"/>`;
    if (typeof value === 'number' && Number.isFinite(value)) return `<c r="${ref}" s="${style}" t="n"><v>${value}</v></c>`;
    return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function worksheetXml(rows, widths, sheetColor = '6D5DFC') {
    const maxCol = Math.max(widths.length, 1);
    const maxRow = Math.max(rows.length, 1);
    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
    xml += `<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">`;
    xml += `<sheetPr><tabColor rgb="FF${sheetColor}"/></sheetPr>`;
    xml += `<dimension ref="A1:${colLetter(maxCol)}${maxRow}"/>`;
    xml += `<sheetViews><sheetView workbookViewId="0" showGridLines="1"><pane xSplit="1" topLeftCell="B2" activePane="topRight" state="frozen"/></sheetView></sheetViews>`;
    xml += `<sheetFormatPr defaultRowHeight="14.25" customHeight="1"/>`;
    xml += '<cols>';
    widths.forEach((w, i) => { xml += `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`; });
    xml += '</cols><sheetData>';
    rows.forEach((row, ri) => {
        const rno = ri + 1;
        const ht = rno === 1 ? ' ht="75" customHeight="1"' : ' ht="14.25" customHeight="1"';
        xml += `<row r="${rno}"${ht}>`;
        row.forEach((value, ci) => {
            let style = 2;
            if (rno === 1) style = 1;
            else if (typeof value === 'number') style = 3;
            else if (ci === 0) style = 2;
            else if (String(value ?? '').length > 70) style = 4;
            xml += cellXml(`${colLetter(ci + 1)}${rno}`, value, style);
        });
        xml += '</row>';
    });
    xml += `</sheetData><autoFilter ref="A1:${colLetter(maxCol)}${maxRow}"/>`;
    xml += '<pageMargins left="0.25" right="0.25" top="0.5" bottom="0.5" header="0.2" footer="0.2"/></worksheet>';
    return xml;
}

function stylesXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>
<fonts count="4">
  <font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>
  <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
  <font><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>
  <font><b/><sz val="11"/><color rgb="FF000000"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="3">
  <fill><patternFill patternType="none"/></fill>
  <fill><patternFill patternType="gray125"/></fill>
  <fill><patternFill patternType="solid"><fgColor rgb="FF000000"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
  <border><left/><right/><top/><bottom/><diagonal/></border>
  <border><left style="thin"><color rgb="FF000000"/></left><right style="thin"><color rgb="FF000000"/></right><top style="thin"><color rgb="FF000000"/></top><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5">
  <xf numFmtId="0" fontId="0" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="top"/></xf>
  <xf numFmtId="0" fontId="1" fillId="2" borderId="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
  <xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
  <xf numFmtId="164" fontId="2" fillId="0" borderId="0" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
  <xf numFmtId="0" fontId="2" fillId="0" borderId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;
}

function contentTypesXml(sheetCount) {
    let xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>`;
    for (let i = 1; i <= sheetCount; i++) xml += `<Override PartName="/xl/worksheets/sheet${i}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`;
    return xml + '</Types>';
}

function rootRelsXml() {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
}

function workbookXml(sheetNames) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews><sheets>${sheetNames.map((name, i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
}

function workbookRelsXml(sheetCount) {
    let xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    for (let i = 1; i <= sheetCount; i++) xml += `<Relationship Id="rId${i}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i}.xml"/>`;
    xml += `<Relationship Id="rId${sheetCount + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
    return xml;
}

function corePropsXml() {
    const now = new Date().toISOString();
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:creator>Coletor Trafegus</dc:creator><cp:lastModifiedBy>Coletor Trafegus</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`;
}

function appPropsXml(sheetNames) {
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Coletor Trafegus</Application><HeadingPairs><vt:vector size="2" baseType="variant"><vt:variant><vt:lpstr>Worksheets</vt:lpstr></vt:variant><vt:variant><vt:i4>${sheetNames.length}</vt:i4></vt:variant></vt:vector></HeadingPairs><TitlesOfParts><vt:vector size="${sheetNames.length}" baseType="lpstr">${sheetNames.map(n => `<vt:lpstr>${esc(n)}</vt:lpstr>`).join('')}</vt:vector></TitlesOfParts></Properties>`;
}

function getRowValue(rows, cat, indicator, scope = 'PERIODO', event = '') {
    const row = rows.find(r => r.categoria === cat && r.indicador === indicator && (r.escopo || 'PERIODO') === scope && (r.evento || '') === event);
    return row ? numberValue(row.quantidade) : null;
}

function accessDetail(rows, indicator, scope) {
    return rows
        .filter(r => r.categoria === 'ACESSOS' && r.indicador === indicator && (r.escopo || 'PERIODO') === scope)
        .sort((a, b) => Number(b.quantidade || 0) - Number(a.quantidade || 0))
        .map(r => `${r.evento || '(SEM LOGIN)'}: ${r.quantidade ?? 0}`)
        .join('; ');
}

const EXPORT_GROUPS = [
    {
        headers: [
            'VIAGENS TOTAL',
            'VIAGENS TOTAL - SISTEMA',
            'VIAGENS SEM CANCELADAS - PERÍODO',
            'VIAGENS SEM CANCELADAS - SISTEMA'
        ],
        values: (rows) => [
            getRowValue(rows, 'VIAGENS', 'TOTAL_PERIODO'),
            getRowValue(rows, 'VIAGENS', 'TOTAL', 'SISTEMA'),
            getRowValue(rows, 'VIAGENS', 'SEM_CANCELADAS_PERIODO'),
            getRowValue(rows, 'VIAGENS', 'TOTAL_NAO_CANCELADAS', 'SISTEMA')
        ]
    },
    {
        headers: [
            'Terminais Ativos',
            'Terminais Ativos - PERÍODO',
            'Terminais Ativos GR/WS - SISTEMA',
            'Terminais Faturados',
            'Terminais Cadastrados',
            'Terminais Cadastrados - PERÍODO',
            'Terminais Cadastrados e Ativos - PERÍODO',
            'Terminais Ativados - PERÍODO',
            'Terminais Inativados - PERÍODO'
        ],
        values: (rows) => [
            getRowValue(rows, 'TERMINAIS', 'ATIVOS_SISTEMA', 'SISTEMA'),
            getRowValue(rows, 'TERMINAIS', 'ATIVOS_PERIODO'),
            getRowValue(rows, 'TERMINAIS', 'ATIVOS_GR_WS_SISTEMA', 'SISTEMA'),
            getRowValue(rows, 'TERMINAIS', 'FATURAMENTO'),
            getRowValue(rows, 'TERMINAIS', 'TOTAL_SISTEMA', 'SISTEMA'),
            getRowValue(rows, 'TERMINAIS', 'CADASTRADOS'),
            getRowValue(rows, 'TERMINAIS', 'CADASTRADOS_ATIVOS'),
            getRowValue(rows, 'TERMINAIS', 'ATIVADOS_NO_PERIODO'),
            getRowValue(rows, 'TERMINAIS', 'INATIVADOS_NO_PERIODO')
        ]
    },
    {
        headers: [
            'EVENTOS TOTAL GERAL',
            'EVENTOS TOTAL GERAL - SISTEMA',
            'EVENTOS TRATAMENTO AUTOMÁTICO',
            'EVENTOS TRATAMENTO AUTOMÁTICO - SISTEMA',
            'EVENTOS TRATAMENTO MANUAL',
            'EVENTOS TRATAMENTO MANUAL - SISTEMA'
        ],
        values: (rows) => [
            getRowValue(rows, 'EVENTOS', 'TOTAL_PERIODO'),
            getRowValue(rows, 'EVENTOS', 'TOTAL_SISTEMA', 'SISTEMA'),
            getRowValue(rows, 'EVENTOS', 'AUTO_PERIODO'),
            getRowValue(rows, 'EVENTOS', 'AUTO_SISTEMA', 'SISTEMA'),
            getRowValue(rows, 'EVENTOS', 'MANUAL_PERIODO'),
            getRowValue(rows, 'EVENTOS', 'MANUAL_SISTEMA', 'SISTEMA')
        ]
    },
    {
        headers: [
            'USUÁRIOS TOTAL CADASTRADO',
            'USUÁRIOS CADASTRADOS PERÍODO',
            'USUÁRIOS CONECTADOS - SISTEMA',
            'USUÁRIOS CONECTADOS PERÍODO',
            'USUÁRIOS TOTAL ACESSOS - SISTEMA',
            'USUÁRIOS TOTAL ACESSOS PERÍODO',
            'Quantidade de Acesso por Usuário - SISTEMA',
            'Quantidade de Acesso por Usuário'
        ],
        values: (rows) => [
            getRowValue(rows, 'USUARIOS', 'TOTAL', 'SISTEMA'),
            getRowValue(rows, 'USUARIOS', 'CADASTRADOS_PERIODO'),
            getRowValue(rows, 'USUARIOS', 'CONECTADOS_SISTEMA', 'SISTEMA'),
            getRowValue(rows, 'USUARIOS', 'CONECTADOS_PERIODO'),
            getRowValue(rows, 'USUARIOS', 'QUANTIDADE_ACESSOS_SISTEMA', 'SISTEMA'),
            getRowValue(rows, 'USUARIOS', 'QUANTIDADE_ACESSOS'),
            accessDetail(rows, 'POR_USUARIO_SISTEMA', 'SISTEMA'),
            accessDetail(rows, 'POR_USUARIO', 'PERIODO')
        ]
    },
    {
        headers: [
            'CHAMADOS BACKLOG ENTRADA',
            'CHAMADOS ABERTOS PERÍODO',
            'CHAMADOS FECHADOS PERÍODO',
            'CHAMADOS BACKLOG SAÍDA'
        ],
        values: (rows) => [
            getRowValue(rows, 'CHAMADOS', 'BACKLOG_ENTRADA'),
            getRowValue(rows, 'CHAMADOS', 'ABERTOS_PERIODO'),
            getRowValue(rows, 'CHAMADOS', 'FECHADOS_PERIODO'),
            getRowValue(rows, 'CHAMADOS', 'BACKLOG_SAIDA')
        ]
    }
];

const EXPORT_HEADERS = ['Cliente', ...EXPORT_GROUPS.flatMap(g => g.headers)];

function numberValue(v) {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : v;
}

function addNumbers(values) {
    const nums = values.map(numberValue).filter(v => typeof v === 'number');
    return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}

function aggregateAccessRows(results, indicator, scope) {
    const map = new Map();
    for (const result of results) {
        for (const r of result.rows || []) {
            if (r.categoria !== 'ACESSOS' || r.indicador !== indicator || (r.escopo || 'PERIODO') !== scope) continue;
            const key = r.evento || '(SEM LOGIN)';
            map.set(key, (map.get(key) || 0) + Number(r.quantidade || 0));
        }
    }
    return [...map.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([login, count]) => `${login}: ${count}`)
        .join('; ');
}

function summaryRow(result) {
    const rows = result.rows || [];
    return [
        result.client.name,
        ...EXPORT_GROUPS.slice(0, 3).flatMap(g => g.values(rows)),
        ...EXPORT_GROUPS.slice(3, 4).flatMap(g => {
            const vals = g.values(rows);
            return vals;
        }),
        ...EXPORT_GROUPS.slice(4).flatMap(g => g.values(rows))
    ];
}

function aggregatedSummaryRow(results) {
    const valid = results.filter(r => r.ok);
    const rowsByGroup = EXPORT_GROUPS.map(group => {
        const indexByHeader = new Map(group.headers.map((h, i) => [h, i]));
        return group.headers.map(header => {
            const idx = indexByHeader.get(header);
            if (header === 'Quantidade de Acesso por Usuário') return aggregateAccessRows(valid, 'POR_USUARIO', 'PERIODO');
            if (header === 'Quantidade de Acesso por Usuário - SISTEMA') return aggregateAccessRows(valid, 'POR_USUARIO_SISTEMA', 'SISTEMA');
            return addNumbers(valid.map(r => group.values(r.rows || [])[idx]));
        });
    }).flat();
    return [valid.map(r => r.client.name).join(' + '), ...rowsByGroup];
}

// Colunas da exportacao "Normal" (nao detalhada) - um subconjunto fixo
// das colunas completas, pedido explicitamente. "Detalhada" continua
// trazendo todas as colunas (EXPORT_HEADERS) como sempre foi.
const NORMAL_HEADERS = [
    'Cliente',
    'VIAGENS TOTAL',
    'Terminais Ativos',
    'Terminais Faturados',
    'Terminais Cadastrados',
    'EVENTOS TOTAL GERAL',
    'EVENTOS TRATAMENTO AUTOMÁTICO',
    'EVENTOS TRATAMENTO MANUAL',
    'USUÁRIOS TOTAL CADASTRADO',
    'USUÁRIOS CADASTRADOS PERÍODO',
    'USUÁRIOS CONECTADOS PERÍODO',
    'USUÁRIOS TOTAL ACESSOS PERÍODO',
    'Quantidade de Acesso por Usuário',
    'CHAMADOS BACKLOG ENTRADA',
    'CHAMADOS ABERTOS PERÍODO',
    'CHAMADOS FECHADOS PERÍODO',
    'CHAMADOS BACKLOG SAÍDA'
];

// Reduz um conjunto (headers completos + linhas completas + larguras
// completas, ja calculados) para so as colunas de NORMAL_HEADERS, na
// ordem pedida - sem recalcular nada, so filtra o que ja foi apurado.
function toNormalView(fullHeaders, rows, fullWidths) {
    const idx = NORMAL_HEADERS.map(h => fullHeaders.indexOf(h));
    const missing = NORMAL_HEADERS.filter((h, i) => idx[i] === -1);
    if (missing.length) throw new Error(`Coluna da exportação normal não encontrada: ${missing.join(', ')}`);
    return {
        headers: NORMAL_HEADERS,
        rows: rows.map(row => idx.map(i => row[i])),
        widths: idx.map(i => fullWidths[i])
    };
}

function summaryWidths() {
    return [
        18.285,
        13, 17, 25, 24,
        18, 22, 25, 22, 22, 22, 28, 20, 25, 26, 30, 24, 25,
        25, 26, 26, 28, 28, 28, 28, 30, 28, 30, 30, 32, 34, 32,
        28, 30, 30, 28, 28, 30, 30, 28, 28, 30, 30
    ];
}

async function exportWorkbook(results, clients, range, mode = 'JUNTO', detailLevel = 'DETALHADA') {
    const fullHeaders = EXPORT_HEADERS;
    const fullWidths = summaryWidths();
    const validResults = results.filter(r => r.ok);
    const normal = String(detailLevel || 'DETALHADA').toUpperCase() === 'NORMAL';

    const separadoRows = results.map(summaryRow);
    const juntoRows = mode === 'JUNTO' && validResults.length > 1
        ? [aggregatedSummaryRow(validResults)]
        : validResults.map(summaryRow);

    const separadoView = normal ? toNormalView(fullHeaders, separadoRows, fullWidths) : { headers: fullHeaders, rows: separadoRows, widths: fullWidths };
    const juntoView = normal ? toNormalView(fullHeaders, juntoRows, fullWidths) : { headers: fullHeaders, rows: juntoRows, widths: fullWidths };

    const sheets = [];

    if (mode === 'SEPARADO') {
        // So a aba principal (todos os clientes juntos, uma linha cada) -
        // sem aba por cliente individual nem aba de Detalhamento, a pedido.
        // Nome da aba reflete o periodo consultado (ex.: "Julho_2026").
        sheets.push({ name: sheetNameForRange(range), rows: [separadoView.headers, ...separadoView.rows], widths: separadoView.widths, color: '6D5DFC' });
    } else {
        sheets.push({ name: 'Resumo', rows: [juntoView.headers, ...juntoView.rows], widths: juntoView.widths, color: '6D5DFC' });
        sheets.push({ name: 'Detalhamento', rows: detailRows(results), widths: [20,12,18,28,46,16,82,16], color: '475569' });
    }

    const files = [
        { name: '[Content_Types].xml', data: contentTypesXml(sheets.length) },
        { name: '_rels/.rels', data: rootRelsXml() },
        { name: 'xl/workbook.xml', data: workbookXml(sheets.map(s => s.name)) },
        { name: 'xl/_rels/workbook.xml.rels', data: workbookRelsXml(sheets.length) },
        { name: 'xl/styles.xml', data: stylesXml() },
        { name: 'docProps/core.xml', data: corePropsXml() },
        { name: 'docProps/app.xml', data: appPropsXml(sheets.map(s => s.name)) }
    ];
    sheets.forEach((sheet, index) => files.push({
        name: `xl/worksheets/sheet${index + 1}.xml`,
        data: worksheetXml(sheet.rows, sheet.widths, sheet.color)
    }));
    return zipStore(files);
}
function detailRows(results) {
    const headers = ['Cliente', 'Escopo', 'Categoria', 'Indicador', 'Evento', 'Quantidade', 'Informação', 'Status'];
    const out = [headers];
    for (const result of results) {
        for (const r of result.rows || []) out.push([
            result.client.name, r.escopo || 'PERIODO', r.categoria, r.indicador,
            r.evento || '', r.quantidade, r.info || '', r.status || 'OK'
        ]);
    }
    return out;
}

module.exports = { save, exportWorkbook };
