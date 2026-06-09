import zipfile
import sys
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')

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
    
    for r_idx, row in enumerate(lamp_tbl.findall('w:tr', namespaces)):
        # Find all w:tc under row, regardless of w:sdt nesting
        cells = row.findall('.//w:tc', namespaces)
        cells_info = []
        for c_idx, cell in enumerate(cells):
            # Check if this cell is inside a w:sdt checkbox or combobox
            # We can traverse up or check if we have checkbox/combobox in ancestors of the cell inside the row
            # To keep it simple, let's see if we can find a w:sdt ancestor
            is_checkbox = False
            is_combobox = False
            checked = False
            
            # ElementTree doesn't have parent pointers, so we can't easily traverse up, 
            # but we can look for w:sdt elements and check which w:tc they contain.
            # Let's check if the row has w:sdt containing checkboxes
            
            p_text = get_text(cell).strip()
            
            # Let's check for checkbox in this specific cell:
            sdt_parent = None
            # Find if there is a w:sdt in the row that contains this cell
            for sdt in row.findall('.//w:sdt', namespaces):
                if cell in sdt.findall('.//w:tc', namespaces):
                    # Found the sdt containing this cell!
                    sdtPr = sdt.find('w:sdtPr', namespaces)
                    if sdtPr is not None:
                        if sdtPr.find('w:checkbox', namespaces) is not None:
                            is_checkbox = True
                            checked_el = sdtPr.find('.//w:checked', namespaces)
                            if checked_el is not None and checked_el.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val') == '1':
                                checked = True
                            elif sdtPr.find('.//w:checkedState', namespaces) is not None:
                                # Sometimes checked value is in checkedState
                                pass
                        elif sdtPr.find('w:comboBox', namespaces) is not None:
                            is_combobox = True
            
            flags = ""
            if is_checkbox:
                flags += f" [CheckboxChecked={checked}]"
            if is_combobox:
                flags += " [Combobox]"
                
            cells_info.append(f"C{c_idx}='{p_text}'{flags}")
        print(f"Row {r_idx}:", " | ".join(cells_info))
