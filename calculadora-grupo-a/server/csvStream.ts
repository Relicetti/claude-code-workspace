/** Parser CSV mínimo para os CSVs da ANEEL: `;`-delimitado, campos entre aspas,
 * sem quebras de linha dentro de campos (confirmado nas amostras reais baixadas). */

export function parseLine(line: string): string[] {
  return line.split(';').map((f) => {
    const t = f.trim();
    return t.startsWith('"') && t.endsWith('"') ? t.slice(1, -1) : t;
  });
}

/** Números da ANEEL usam vírgula decimal (ex: "1,85", "8,99...E-9"). */
export function parseNumeroBr(v: string): number {
  return Number(v.replace(',', '.'));
}

/** Consome um ReadableStream HTTP como texto (cp1252 ou utf-8), decodifica linha por linha e
 * chama onRow para cada linha de dados (pula o cabeçalho). Não acumula o arquivo inteiro em
 * memória — os CSVs da ANEEL têm dezenas de MB. */
export async function streamCsvRows(
  body: ReadableStream<Uint8Array>,
  encoding: 'utf-8' | 'windows-1252',
  onRow: (fields: string[], rowIndex: number) => void,
): Promise<number> {
  const decoder = new TextDecoder(encoding);
  const reader = body.getReader();
  let buffer = '';
  let rowIndex = 0;
  let sawHeader = false;

  const processBuffer = (flush: boolean) => {
    let newlineIdx: number;
    while ((newlineIdx = buffer.indexOf('\n')) !== -1) {
      const line = buffer.slice(0, newlineIdx).replace(/\r$/, '');
      buffer = buffer.slice(newlineIdx + 1);
      if (!sawHeader) { sawHeader = true; continue; }
      if (line.length === 0) continue;
      onRow(parseLine(line), rowIndex++);
    }
    if (flush && buffer.trim().length > 0) {
      if (sawHeader) onRow(parseLine(buffer.replace(/\r$/, '')), rowIndex++);
      buffer = '';
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    processBuffer(false);
  }
  buffer += decoder.decode();
  processBuffer(true);

  return rowIndex;
}
