const XLSX = require('xlsx');
const path = require('path');

const autoDir = path.join(__dirname, 'assets', 'automatizacion');

function inspectPlanillaDetailed() {
  const filePath = path.join(autoDir, 'Planilla de Trailers y Publicidades Hoyts.xlsx');
  const workbook = XLSX.readFile(filePath);
  const sheet = workbook.Sheets['Programacion'];
  const data = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
  
  console.log('=== Planilla de Trailers y Publicidades Hoyts.xlsx Structure ===');
  console.log('Total rows:', data.length);
  
  let salaInfo = [];
  
  for (let r = 0; r < data.length; r++) {
    const row = data[r] || [];
    const joined = row.join(' ');
    
    if (/SALA\s+\d+/i.test(joined)) {
      const match = joined.match(/SALA\s+(\d+)/i);
      const salaNum = match[1];
      
      const info = {
        sala: salaNum,
        startRow: r,
        movieRow: r + 1,
        trailerHeaderRow: r + 2,
        trailerRows: []
      };
      
      // Let's grab the next 12 rows to see the trailer layout
      for (let offset = 3; offset < 15; offset++) {
        const nextRow = data[r + offset] || [];
        const nextJoined = nextRow.join(' ');
        if (/SALA\s+\d+/i.test(nextJoined)) {
          break; // Stop at next sala
        }
        info.trailerRows.push({
          rowOffset: offset,
          absoluteRow: r + offset,
          content: nextRow
        });
      }
      salaInfo.push(info);
    }
  }
  
  salaInfo.forEach(info => {
    console.log(`\n--- SALA ${info.sala} (Starts at absolute row ${info.startRow}) ---`);
    console.log(`Movie Row (${info.movieRow}):`, data[info.movieRow].slice(0, 25));
    console.log(`Trailer Header Row (${info.trailerHeaderRow}):`, data[info.trailerHeaderRow].slice(0, 25));
    info.trailerRows.forEach(tr => {
      // Print only if row has content
      const hasContent = tr.content.some(c => c !== "");
      if (hasContent) {
        console.log(`  Row +${tr.rowOffset} (Abs ${tr.absoluteRow}):`, tr.content.slice(0, 25));
      }
    });
  });
}

inspectPlanillaDetailed();
