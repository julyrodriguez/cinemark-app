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
    tbls = body.findall('.//w:tbl', namespaces)
    
    lamp_tbl = tbls[2]
    
    # Let's inspect the tblGrid
    tbl_grid = lamp_tbl.find('w:tblGrid', namespaces)
    col_widths = []
    if tbl_grid is not None:
        for grid_col in tbl_grid.findall('w:gridCol', namespaces):
            col_widths.append(int(grid_col.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}w', 0)))
    print("tblGrid column widths:", col_widths)
    
    # For each row, let's map cell sizes to columns by tracking visual column indices based on cell widths or spans
    for r_idx, row in enumerate(lamp_tbl.findall('w:tr', namespaces)):
        cells_info = []
        for c_idx, cell in enumerate(row.findall('w:tc', namespaces)):
            tcPr = cell.find('w:tcPr', namespaces)
            tcW_el = tcPr.find('w:tcW', namespaces) if tcPr is not None else None
            width = int(tcW_el.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}w', 0)) if tcW_el is not None else 0
            grid_span_el = tcPr.find('w:gridSpan', namespaces) if tcPr is not None else None
            grid_span = int(grid_span_el.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val')) if grid_span_el is not None else 1
            
            p_text = " / ".join([get_text(p) for p in cell.findall('w:p', namespaces) if get_text(p)])
            cells_info.append(f"C{c_idx}[w={width}, span={grid_span}]='{p_text}'")
        print(f"Row {r_idx}:", " | ".join(cells_info))
