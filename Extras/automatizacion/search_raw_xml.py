import zipfile

docx_path = 'proyeccion-app/assets/automatizacion/Control semanal - 2004.docx'

with zipfile.ZipFile(docx_path) as z:
    for name in z.namelist():
        if name.endswith('.xml'):
            content = z.read(name).decode('utf-8', errors='ignore')
            print(f"File {name}:")
            for term in ['elevada', 'Broadsign', 'Sonido', 'Sabado']:
                cnt = content.count(term)
                if cnt > 0:
                    print(f"  Contains term '{term}' {cnt} times")
