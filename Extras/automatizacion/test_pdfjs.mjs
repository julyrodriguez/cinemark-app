import * as fs from 'fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const data = new Uint8Array(fs.readFileSync('c:/Users/USUARIO/Desktop/Aplicaciones/aplicacionProye3/proyeccion-app/assets/automatizacion/SessionsbyScreen.pdf'));

const loadingTask = getDocument({ data });
const pdf = await loadingTask.promise;

const page = await pdf.getPage(1);
const content = await page.getTextContent();

console.log("--- SHOWTIMES ITEMS ---");
for (const item of content.items) {
  if (item.transform[5] < 660 && item.transform[5] > 500) {
    console.log(`X: ${item.transform[4].toFixed(2)} | Y: ${item.transform[5].toFixed(2)} | width: ${item.width.toFixed(2)} | str: '${item.str}'`);
  }
}
