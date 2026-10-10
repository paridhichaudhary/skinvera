import os
import urllib.request

def download_scin_metadata():
    target_dir = "./ml/dataset"
    os.makedirs(target_dir, exist_ok=True)
    
    # Base URL pointing to the raw repository assets
    base_url = "https://githubusercontent.com"
    
    # List of all files we want to download automatically
    files_to_download = [
        "dataset_schema.md",
        "dataset/scin_cases.csv",
        "dataset/scin_labels.csv"
    ]
    
    for file_path in files_to_download:
        # Get just the file name (e.g., scin_cases.csv) to save it locally
        file_name = os.path.basename(file_path)
        url = f"{base_url}/{file_path}"
        destination = os.path.join(target_dir, file_name)
        
        try:
            print(f"Downloading {file_name} from GitHub...")
            urllib.request.urlretrieve(url, destination)
            print(f"✅ Successfully saved {file_name} inside {target_dir}/")
        except Exception as e:
            print(f"❌ Download failed for {file_name}: {e}")

if __name__ == "__main__":
    download_scin_metadata()