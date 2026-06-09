import zipfile
import xml.etree.ElementTree as ET

docx_path = 'proyeccion-app/assets/automatizacion/Control semanal - 2004.docx'
namespaces = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}

def get_node_repr(node):
    tag = node.tag.split('}')[-1]
    text = node.text.strip() if node.text else ""
    attribs = " ".join([f"{k.split('}')[-1]}='{v}'" for k, v in node.attrib.items()])
    repr_str = f"<{tag} {attribs}>"
    if text:
        repr_str += f"'{text}'"
    return repr_str

def dump_node(node, indent=0):
    repr_str = get_node_repr(node)
    print("  " * indent + repr_str)
    for child in node:
        dump_node(child, indent + 1)

with zipfile.ZipFile(docx_path) as z:
    xml_content = z.read('word/document.xml')
    root = ET.fromstring(xml_content)
    body = root.find('w:body', namespaces)
    tbls = body.findall('.//w:tbl', namespaces)
    
    lamp_tbl = tbls[2]
    
    # Let's inspect Row 4 in detail
    rows = lamp_tbl.findall('w:tr', namespaces)
    row_4 = rows[4]
    print("--- DUMPING XML FOR ROW 4 OF LAMPS TABLE ---")
    dump_node(row_4)
