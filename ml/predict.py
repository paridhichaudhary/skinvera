import torch
from torchvision import models, transforms
from PIL import Image
from torch import nn
import sys

model_data = torch.load(
    "ml/models/skinvera_model.pth",
    map_location="cpu"
)

labels = model_data["labels"]

model = models.resnet18(weights=None)

model.fc = nn.Linear(
    model.fc.in_features,
    len(labels)
)

model.load_state_dict(model_data["model"])
model.eval()

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor()
])

image_path = sys.argv[1]

image = Image.open(image_path).convert("RGB")
image = transform(image).unsqueeze(0)

with torch.no_grad():

    output = model(image)

    probabilities = torch.softmax(output, dim=1)

    confidence, prediction = torch.max(
        probabilities,
        1
    )

label_list = list(labels.keys())

print("\nSkinVera Prediction")
print("-------------------")
print("Predicted class:", label_list[prediction.item()])
print("Note: Experimental model output, not a medical diagnosis.")
print("Confidence:", round(confidence.item() * 100, 2), "%")