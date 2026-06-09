import zipfile
import re

docx_path = 'proyeccion-app/assets/automatizacion/Control semanal - 2004.docx'

with zipfile.ZipFile(docx_path) as z:
    content = z.read('word/document.xml').decode('utf-8', errors='ignore')
    
    # Let's search for hex color values in document.xml
    # Colors are usually represented as w:color w:val="HEX" or w:shd w:fill="HEX"
    colors = set(re.findall(r'w:val="([A-Fa-f0-9]{6})"', content))
    shades = set(re.findall(r'w:fill="([A-Fa-f0-9]{6})"', content))
    
    print("Found colors in document.xml:", colors)
    print("Found background fills in document.xml:", shades)
    
    # Let's also check word/styles.xml
    try:
        styles_content = z.read('word/styles.xml').decode('utf-8', errors='ignore')
        style_colors = set(re.findall(r'w:val="([A-Fa-f0-9]{6})"', styles_content))
        print("Found colors in styles.xml:", style_colors)
    except Exception as e:
        print("Error reading styles.xml:", e)
