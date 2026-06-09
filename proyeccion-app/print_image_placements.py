import os
from pypdf import PdfReader

def check_placements():
    pdf_path = os.path.join("assets", "automatizacion", "chequeo de copias", "AMARGA NAVIDAD 2D CAS.pdf")
    reader = PdfReader(pdf_path)
    page = reader.pages[0]
    
    # We inspect the page inline images and XObject placements by looking at the page contents.
    # A simple way to do this in python is parsing the contents stream of the page.
    # In pypdf, we can use the page's "/Contents" stream and look for "Do" operators.
    # Let's inspect the operator list or content stream.
    
    print("Page resources XObject list:")
    xobjects = page["/Resources"]["/XObject"]
    for k in xobjects:
        obj = xobjects[k]
        print(f"XObject Name: {k}, Subtype: {obj['/Subtype']}, Width: {obj.get('/Width')}, Height: {obj.get('/Height')}")
        
    print("\nPage Content Stream Analysis:")
    contents = page.get_contents()
    if contents:
        # If it is a list of streams or a single stream
        if not isinstance(contents, list):
            contents = [contents]
        for c in contents:
            data = c.get_data().decode('latin-1')
            lines = data.split('\n')
            # Look for lines containing "Do" or containing transform matrices followed by Do
            # e.g., "q 100 0 0 100 50 100 cm /Im1 Do Q"
            for i, line in enumerate(lines):
                if "Do" in line:
                    # Print current line and surrounding lines to understand the context
                    start = max(0, i - 2)
                    end = min(len(lines), i + 2)
                    print(f"Line {i}: {line}")
                    for j in range(start, end):
                        print(f"  [{j}]: {lines[j]}")

if __name__ == "__main__":
    check_placements()
