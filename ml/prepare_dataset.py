import pandas as pd
import os
import ast

cases = pd.read_csv("ml/dataset/scin_cases.csv")
labels = pd.read_csv("ml/dataset/scin_labels.csv")

cases["case_id"] = cases["case_id"].astype(str)
labels["case_id"] = labels["case_id"].astype(str)

image_case = {}

for _, case in cases.iterrows():

    for column in ["image_1_path", "image_2_path", "image_3_path"]:

        path = str(case[column])

        if path != "nan":

            filename = os.path.basename(path)
            image_id = os.path.splitext(filename)[0]

            image_case[image_id] = case["case_id"]

rows = []

for image in os.listdir("ml/images"):

    if not image.lower().endswith(".png"):
        continue

    image_id = os.path.splitext(image)[0]

    if image_id.startswith("dataset_images_"):
        image_id = image_id.replace("dataset_images_", "", 1)

    if image_id not in image_case:
        continue

    case_id = image_case[image_id]

    label = labels[labels["case_id"] == case_id]

    if label.empty:
        continue

    value = label.iloc[0]["weighted_skin_condition_label"]

    if pd.isna(value) or value == "{}":
        continue

    try:
        conditions = ast.literal_eval(value)

        if not conditions:
            continue

        # Select highest-confidence condition
        condition = max(
            conditions,
            key=conditions.get
        )

        rows.append({
            "image": image,
            "case_id": case_id,
            "label": condition
        })

    except:
        continue

df = pd.DataFrame(rows)

df.to_csv(
    "ml/dataset/skinvera_dataset.csv",
    index=False
)

print("Images found:", len(os.listdir("ml/images")))
print("Usable images:", len(df))

print("\nClasses:")
print(df["label"].value_counts())

print("\nDataset created successfully!")