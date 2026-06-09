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
    print("--- Detailed Row Inspection for Lamps Table ---")
    for r_idx, row in enumerate(lamp_tbl.findall('w:tr', namespaces)):
        cells = row.findall('w:tc', namespaces)
        print(f"Row {r_idx} has {len(cells)} cells:")
        for c_idx, cell in enumerate(cells):
            grid_span_el = cell.find('.//w:gridSpan', namespaces)
            grid_span = int(grid_span_el.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val')) if grid_span_el is not None else 1
            
            tcPr = cell.find('w:tcPr', namespaces)
            vMerge = ""
            if tcPr is not None:
                vMerge_el = tcPr.find('w:vMerge', namespaces)
                if vMerge_el is not None:
                    val = vMerge_el.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val', 'continue')
                    vMerge = f" vMerge={val}"
            
            p_texts = [get_text(p) for p in cell.findall('w:p', namespaces)]
            text = " / ".join([t for t in p_texts if t])
            print(f"  Cell {c_idx}: span={grid_span}{vMerge} text='{text}'")
