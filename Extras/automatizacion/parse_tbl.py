import zipfile
import xml.etree.ElementTree as ET

docx_path = 'proyeccion-app/assets/automatizacion/Control semanal - 2004.docx'
namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

def get_text(element):
    return ''.join([t.text for t in element.findall('.//w:t', namespaces) if t.text])

with zipfile.ZipFile(docx_path) as z:
    xml_content = z.read('word/document.xml')
    root = ET.fromstring(xml_content)
    body = root.find('w:body', namespaces)
    
    # Find the table for lamps (it's the second table, index 12 in the previous script)
    tbls = body.findall('.//w:tbl', namespaces)
    print("Found", len(tbls), "tables")
    
    lamp_tbl = tbls[2] # Table 3 in the document
    for r_idx, row in enumerate(lamp_tbl.findall('w:tr', namespaces)):
        cells = row.findall('w:tc', namespaces)
        cells_data = []
        for c_idx, cell in enumerate(cells):
            # Check gridSpan if any
            grid_span_el = cell.find('.//w:gridSpan', namespaces)
            grid_span = grid_span_el.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val') if grid_span_el is not None else 1
            cell_text = " / ".join([get_text(p) for p in cell.findall('w:p', namespaces)])
            cells_data.append(f"C{c_idx}[span={grid_span}]:'{cell_text}'")
        print(f"Row {r_idx}:", " | ".join(cells_data))
