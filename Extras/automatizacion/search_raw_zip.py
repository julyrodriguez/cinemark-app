import zipfile

docx_path = 'proyeccion-app/assets/automatizacion/Control semanal - 2004.docx'

with zipfile.ZipFile(docx_path) as z:
    for name in z.namelist():
        content = z.read(name)
        # Search inside content
        for term in [b'broad', b'Broad', b'elevada', b'Elevada', b'sonido', b'Sonido', b'sabado', b'Sabado', b'saba', b'Saba', b'S\xc3\xa1bado', b's\xc3\xa1bado']:
            if term in content:
                print(f"File {name} contains term '{term}'")
