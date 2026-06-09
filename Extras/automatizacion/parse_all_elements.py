import zipfile
import sys
import xml.etree.ElementTree as ET

sys.stdout.reconfigure(encoding='utf-8')

docx_path = 'proyeccion-app/assets/automatizacion/Control semanal - 2004.docx'
out_path = 'proyeccion-app/assets/automatizacion/parsed_full_elements.txt'
namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

def get_text(element):
    return ''.join([t.text for t in element.findall('.//w:t', namespaces) if t.text])

def get_checkbox_state(sdt):
    sdtPr = sdt.find('w:sdtPr', namespaces)
    if sdtPr is not None:
        checkbox = sdtPr.find('w:checkbox', namespaces)
        if checkbox is not None:
            checked_el = sdtPr.find('.//w:checked', namespaces)
            if checked_el is not None and checked_el.attrib.get('{http://schemas.openxmlformats.org/wordprocessingml/2006/main}val') == '1':
                return "[x]"
            return "[ ]"
    return None

def process_element(element, f):
    tag = element.tag.split('}')[-1]
    
    if tag == 'sdt':
        # Content Control
        cb_state = get_checkbox_state(element)
        if cb_state:
            # It's a checkbox
            content = element.find('w:sdtContent', namespaces)
            text = get_text(content).strip() if content is not None else ""
            f.write(f"CHECKBOX: {cb_state} {text}\n")
            return
        else:
            # Might be combobox or other block
            sdtPr = element.find('w:sdtPr', namespaces)
            if sdtPr is not None:
                combo = sdtPr.find('w:comboBox', namespaces)
                if combo is not None:
                    content = element.find('w:sdtContent', namespaces)
                    text = get_text(content).strip() if content is not None else ""
                    f.write(f"COMBOBOX: '{text}'\n")
                    return
            # If not a simple combo or check, process content children
            content = element.find('w:sdtContent', namespaces)
            if content is not None:
                for child in content:
                    process_element(child, f)
            return

    if tag == 'p':
        p_text = get_text(element).strip()
        # Find if it contains nested sdts (like inline checkboxes)
        sdts = element.findall('.//w:sdt', namespaces)
        if sdts:
            f.write(f"P-WITH-SDTS: {p_text}\n")
            for sdt in sdts:
                cb = get_checkbox_state(sdt)
                if cb:
                    content = sdt.find('w:sdtContent', namespaces)
                    text = get_text(content).strip() if content is not None else ""
                    f.write(f"  NESTED-CHECKBOX: {cb} {text}\n")
        else:
            if p_text:
                f.write(f"P: {p_text}\n")
        return

    if tag == 'tbl':
        f.write("\n--- START TABLE ---\n")
        for row in element.findall('.//w:tr', namespaces):
            cells_info = []
            for cell in row.findall('.//w:tc', namespaces):
                # Process cell content in isolation to format nicely
                cell_text = get_text(cell).strip()
                cells_info.append(cell_text)
            f.write(" | ".join(cells_info) + "\n")
        f.write("--- END TABLE ---\n\n")
        return

    for child in element:
        process_element(child, f)

with zipfile.ZipFile(docx_path) as z:
    xml_content = z.read('word/document.xml')
    root = ET.fromstring(xml_content)
    body = root.find('w:body', namespaces)
    
    with open(out_path, 'w', encoding='utf-8') as f:
        process_element(body, f)

print("Done! Saved to parsed_full_elements.txt")
