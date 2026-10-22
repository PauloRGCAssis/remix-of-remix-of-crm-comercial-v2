import pandas as pd
import glob
import os
import json

files = sorted(glob.glob("/tmp/user-uploads/Total_Vendas_*_-_2026*.xlsx"))

results = []

for file in files:
    try:
        xl = pd.ExcelFile(file)
        sheet_names = xl.sheet_names
        file_info = {
            "file": os.path.basename(file),
            "sheets": []
        }
        for sheet_name in sheet_names:
            # Read first 20 rows to find headers and see structure
            df = pd.read_excel(file, sheet_name=sheet_name, header=None, nrows=20)
            
            # Check for header row like the parser does
            header_idx = -1
            headers = []
            for i, row in df.iterrows():
                row_str = [str(c).lower() for c in row if pd.notnull(c)]
                if any("vendedor" in s or "cliente" in s or "produto" in s for s in row_str):
                    header_idx = i
                    headers = [str(c) for c in row]
                    break
            
            sheet_info = {
                "name": sheet_name,
                "header_idx": header_idx,
                "headers": headers,
                "row_count_approx": len(pd.read_excel(file, sheet_name=sheet_name)),
                "sample_data": df.iloc[header_idx+1:header_idx+4].values.tolist() if header_idx != -1 else []
            }
            file_info["sheets"].append(sheet_info)
        results.append(file_info)
    except Exception as e:
        results.append({"file": os.path.basename(file), "error": str(e)})

print(json.dumps(results, indent=2))
