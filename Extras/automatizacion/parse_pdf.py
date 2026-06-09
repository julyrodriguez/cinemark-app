import pypdf
import sys

sys.stdout.reconfigure(encoding='utf-8')

pdf_path = 'proyeccion-app/assets/automatizacion/Control semanal - 2004.pdf'
out_path = 'proyeccion-app/assets/automatizacion/parsed_pdf.txt'

reader = pypdf.PdfReader(pdf_path)
print("Total pages:", len(reader.pages))

with open(out_path, 'w', encoding='utf-8') as f:
    for idx, page in enumerate(reader.pages):
        f.write(f"--- PAGE {idx} START ---\n")
        f.write(page.extract_text())
        f.write(f"\n--- PAGE {idx} END ---\n\n")

print("Done! Parsed PDF text saved to proyeccion-app/assets/automatizacion/parsed_pdf.txt")
