import pandas as pd
import os
import torch
from torch import nn
from torch.utils.data import Dataset, DataLoader
from torchvision import models, transforms
from PIL import Image
from sklearn.model_selection import train_test_split

df = pd.read_csv("ml/dataset/skinvera_dataset.csv")
torch.manual_seed(42)
torch.set_num_threads(1)

# Keep classes having at least 2 images
counts = df["label"].value_counts()
valid_classes = counts[counts >= 2].index

df = df[df["label"].isin(valid_classes)]

print("Training images:", len(df))
print("\nClasses:")
print(df["label"].value_counts())

labels = sorted(df["label"].unique())
label_map = {label: i for i, label in enumerate(labels)}

df["target"] = df["label"].map(label_map)

# Use a simple split because the dataset is very small
train, test = train_test_split(
    df,
    test_size=0.25,
    random_state=42
)

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor()
])


class SkinDataset(Dataset):

    def __init__(self, data):
        self.data = data

    def __len__(self):
        return len(self.data)

    def __getitem__(self, index):

        row = self.data.iloc[index]

        image = Image.open(
            "ml/images/" + row["image"]
        ).convert("RGB")

        image = transform(image)

        return image, int(row["target"])


train_data = SkinDataset(train)
test_data = SkinDataset(test)

train_loader = DataLoader(
    train_data,
    batch_size=4,
    shuffle=True
)

model = models.resnet18(weights="DEFAULT")

model.fc = nn.Linear(
    model.fc.in_features,
    len(labels)
)

loss_function = nn.CrossEntropyLoss()

optimizer = torch.optim.Adam(
    model.parameters(),
    lr=0.0001
)

for epoch in range(10):

    model.train()

    for images, targets in train_loader:

        optimizer.zero_grad()

        output = model(images)

        loss = loss_function(
            output,
            targets
        )

        loss.backward()

        optimizer.step()

    print(
        "Epoch:",
        epoch + 1,
        "Loss:",
        round(loss.item(), 4)
    )

os.makedirs("ml/models", exist_ok=True)

torch.save(
    {
        "model": model.state_dict(),
        "labels": label_map
    },
    "ml/models/skinvera_model.pth"
)

print("\nModel saved!")
print("Classes:", labels)