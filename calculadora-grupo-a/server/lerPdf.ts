// Texto de um PDF em linhas visuais (itens agrupados pela altura, em ordem da esquerda para a direita),
// células separadas por " | ". Usa o pdfjs (JS puro), sem binários no servidor.
export async function linhasDoPdf(conteudo: Buffer): Promise<string[]> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  const doc = await pdfjs.getDocument({ data: new Uint8Array(conteudo), useSystemFonts: true, isEvalSupported: false }).promise;
  const linhas: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const porY = new Map<number, { x: number; s: string }[]>();
    for (const it of tc.items) {
      if (!('str' in it) || !it.str.trim()) continue;
      const y = Math.round(it.transform[5]);
      const k = [...porY.keys()].find((q) => Math.abs(q - y) <= 2) ?? y;
      if (!porY.has(k)) porY.set(k, []);
      porY.get(k)!.push({ x: it.transform[4], s: it.str.trim() });
    }
    for (const y of [...porY.keys()].sort((a, b) => b - a)) linhas.push(porY.get(y)!.sort((a, b) => a.x - b.x).map((i) => i.s).join(' | '));
  }
  await doc.destroy();
  return linhas;
}
