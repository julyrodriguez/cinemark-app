import sys
import zipfile
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')

docx_path = 'proyeccion-app/assets/automatizacion/Control semanal - 2004.docx'
out_path = 'proyeccion-app/assets/automatizacion/parsed_docx.txt'

namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

def get_text(element):
    return ''.join([t.text for t in element.findall('.//w:t', namespaces) if t.text])

with zipfile.ZipFile(docx_path) as z:
    xml_content = z.read('word/document.xml')
    root = ET.fromstring(xml_content)
    body = root.find('w:body', namespaces)
    
    with open(out_path, 'w', encoding='utf-8') as f:
        for idx, child in enumerate(body):
            tag = child.tag.split('}')[-1]
            if tag == 'p':
                p_text = get_text(child)
                f.write(f"P[{idx}]: {p_text}\n")
            elif tag == 'tbl':
                f.write(f"\n--- TABLE[{idx}] START ---\n")
                for row_idx, row in enumerate(child.findall('w:tr', namespaces)):
                    cells = []
                    for col_idx, cell in enumerate(row.findall('w:tc', namespaces)):
                        # A cell can have multiple paragraphs
                        cell_text = " / ".join([get_text(p) for p in cell.findall('w:p', namespaces)])
                        cells.append(cell_text)
                    f.write(f"ROW[{row_idx}]: " + " | ".join(cells) + "\n")
                f.write(f"--- TABLE[{idx}] END ---\n\n")

print("Done! Parsed docx text saved to proyeccion-app/assets/automatizacion/parsed_docx.txt")
