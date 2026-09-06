/**
 * Dibuja una tabla simple (encabezado + filas) en el PDFDocument, con salto
 * de página automático cuando el contenido no entra en la página actual.
 *
 * Compartido entre los distintos generadores de PDF del sistema (reportes de
 * negocio, reportes de auditoría) para no duplicar la lógica de layout.
 */
function drawTable(doc, headers, rows, columnWidths) {
  const startX = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const widths = columnWidths || headers.map(() => usableWidth / headers.length);
  const rowHeight = 20;
  const bottomLimit = doc.page.height - doc.page.margins.bottom;
  let y = doc.y;

  const drawRow = (cells, isHeader) => {
    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      y = doc.y;
    }
    let x = startX;
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(isHeader ? '#111' : '#333');
    cells.forEach((cell, i) => {
      doc.text(String(cell ?? ''), x, y, { width: widths[i], ellipsis: true });
      x += widths[i];
    });
    y += rowHeight;
  };

  drawRow(headers, true);
  doc.moveTo(startX, y).lineTo(startX + widths.reduce((a, b) => a + b, 0), y).strokeColor('#ddd').stroke();
  y += 4;

  if (rows.length === 0) {
    doc.font('Helvetica').fontSize(10).fillColor('#888').text('Sin datos', startX, y);
    y += rowHeight;
  } else {
    rows.forEach((row) => drawRow(row, false));
  }

  doc.fillColor('#000');
  doc.x = startX;
  doc.y = y + 10;
}

module.exports = { drawTable };
