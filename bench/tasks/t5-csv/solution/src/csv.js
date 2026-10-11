export function parseCsv(text, { delimiter = ",", header = true } = {}) {
  if (!text || text.length === 0) return [];

  const rows = [];
  let i = 0;
  let currentRow = [];
  let currentField = "";
  let inQuotes = false;
  let physicalLine = 1;
  let rowStartPhysicalLine = 1;

  while (i < text.length) {
    const char = text[i];
    const nextChar = text[i + 1];

    if (inQuotes) {
      if (char === '"' && nextChar === '"') {
        currentField += '"';
        i += 2;
      } else if (char === '"') {
        inQuotes = false;
        i++;
      } else {
        // \r\n conta como uma linha só
        if (char === '\n' || (char === '\r' && nextChar !== '\n')) {
          physicalLine++;
        }
        currentField += char;
        i++;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
      } else if (char === delimiter) {
        currentRow.push(currentField);
        currentField = "";
        i++;
      } else if (char === '\r' || char === '\n') {
        currentRow.push(currentField);
        rows.push({ data: currentRow, line: rowStartPhysicalLine });

        currentRow = [];
        currentField = "";

        if (char === '\r' && nextChar === '\n') {
          i += 2;
        } else {
          i++;
        }

        rowStartPhysicalLine = physicalLine + 1;
        physicalLine++;
      } else {
        currentField += char;
        i++;
      }
    }
  }

  if (inQuotes) {
    throw new Error("UNTERMINATED_QUOTE");
  }

  if (i > 0 && text[i - 1] !== '\n' && text[i - 1] !== '\r') {
    currentRow.push(currentField);
    rows.push({ data: currentRow, line: rowStartPhysicalLine });
  }

  if (rows.length === 0) return [];

  const finalRows = rows.map(r => r.data);
  const expectedLength = finalRows[0].length;

  for (let j = 0; j < finalRows.length; j++) {
    if (finalRows[j].length !== expectedLength) {
      throw new Error("ROW_LENGTH:" + rows[j].line);
    }
  }

  if (header) {
    const headers = finalRows[0];
    return finalRows.slice(1).map(row => {
      const obj = {};
      for (let k = 0; k < headers.length; k++) {
        obj[headers[k]] = row[k];
      }
      return obj;
    });
  }

  return finalRows;
}
