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
    
    # We will search for all text runs inside the body and print their parent tags and path
    # to understand what elements they are inside
    for parent in body.iter():
        text_tags = parent.findall('w:t', namespaces)
        for t in text_tags:
            if t.text and ('Digital' in t.text or '2200W' in t.text or '3000W' in t.text):
                # Print path of tag
                path = []
                curr = t
                # Since ElementTree doesn't store parent pointers, let's just print surrounding context
                print(f"Found text '{t.text}' under parent tag '{parent.tag.split('}')[-1]}'")
