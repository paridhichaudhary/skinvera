import os
import io
import sqlite3
from datetime import datetime, timedelta, timezone

import torch
import torch.nn as nn
from PIL import Image, UnidentifiedImageError
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr
from pwdlib import PasswordHash
from jose import jwt, JWTError
from torchvision import models, transforms

from database.db import get_db, init_db


# -------------------- APP SETUP --------------------

app = FastAPI(title="SkinVera API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173"
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"]
)

init_db()

password_hash = PasswordHash.recommended()
security = HTTPBearer(auto_error=False)

SECRET_KEY = os.getenv(
    "SKINVERA_SECRET_KEY",
    "change-this-secret-before-deployment"
)
ALGORITHM = "HS256"
TOKEN_MINUTES = 60 * 24


# -------------------- AUTHENTICATION --------------------

def hash_password(password: str) -> str:
    return password_hash.hash(password)


def verify_password(password: str, hashed: str) -> bool:
    return password_hash.verify(password, hashed)


def create_token(user_id: int, email: str) -> str:
    expires = datetime.now(timezone.utc) + timedelta(
        minutes=TOKEN_MINUTES
    )

    payload = {
        "sub": str(user_id),
        "email": email,
        "exp": expires
    }

    return jwt.encode(
        payload,
        SECRET_KEY,
        algorithm=ALGORITHM
    )


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
):
    if credentials is None:
        raise HTTPException(
            status_code=401,
            detail="Please log in to access this feature."
        )

    try:
        payload = jwt.decode(
            credentials.credentials,
            SECRET_KEY,
            algorithms=[ALGORITHM]
        )

        user_id = int(payload["sub"])

    except (JWTError, TypeError, ValueError, KeyError):
        raise HTTPException(
            status_code=401,
            detail="Invalid or expired login session."
        )

    connection = get_db()

    try:
        user = connection.execute(
            "SELECT id, name, email FROM users WHERE id = ?",
            (user_id,)
        ).fetchone()

        if user is None:
            raise HTTPException(
                status_code=401,
                detail="User not found."
            )

        return dict(user)

    finally:
        connection.close()


# -------------------- REQUEST MODELS --------------------

class SignupData(BaseModel):
    name: str
    email: EmailStr
    password: str


class LoginData(BaseModel):
    email: EmailStr
    password: str


class SaveAnalysisData(BaseModel):
    skin_type: str = ""
    main_concern: str = ""
    symptoms: str = ""
    duration: str = ""
    image_concern: str = ""
    confidence: float = 0.0


# -------------------- SIGNUP --------------------

@app.post("/signup")
def signup(data: SignupData):
    name = data.name.strip()
    email = str(data.email).lower()
    password = data.password

    if not name:
        raise HTTPException(
            status_code=400,
            detail="Name is required."
        )

    if len(password) < 8:
        raise HTTPException(
            status_code=400,
            detail="Password must contain at least 8 characters."
        )

    connection = get_db()

    try:
        existing = connection.execute(
            "SELECT id FROM users WHERE email = ?",
            (email,)
        ).fetchone()

        if existing:
            raise HTTPException(
                status_code=409,
                detail="An account with this email already exists."
            )

        cursor = connection.execute(
            """
            INSERT INTO users (name, email, password_hash)
            VALUES (?, ?, ?)
            """,
            (name, email, hash_password(password))
        )

        connection.commit()

        user_id = cursor.lastrowid

        return {
            "message": "Account created successfully",
            "token": create_token(user_id, email),
            "user": {
                "id": user_id,
                "name": name,
                "email": email
            }
        }

    except sqlite3.IntegrityError:
        raise HTTPException(
            status_code=409,
            detail="Could not create account. Please check your details."
        )

    finally:
        connection.close()


# -------------------- LOGIN --------------------

@app.post("/login")
def login(data: LoginData):
    email = str(data.email).lower()
    connection = get_db()

    try:
        user = connection.execute(
            "SELECT * FROM users WHERE email = ?",
            (email,)
        ).fetchone()

        if user is None or not verify_password(
            data.password,
            user["password_hash"]
        ):
            raise HTTPException(
                status_code=401,
                detail="Incorrect email or password."
            )

        connection.execute(
            "INSERT INTO login_history (user_id) VALUES (?)",
            (user["id"],)
        )
        connection.commit()

        return {
            "message": "Login successful",
            "token": create_token(user["id"], user["email"]),
            "user": {
                "id": user["id"],
                "name": user["name"],
                "email": user["email"]
            }
        }

    finally:
        connection.close()


# -------------------- CURRENT USER --------------------

@app.get("/me")
def get_me(user=Depends(get_current_user)):
    return {"user": user}


# -------------------- LOGIN HISTORY --------------------

@app.get("/login-history")
def get_login_history(user=Depends(get_current_user)):
    connection = get_db()

    try:
        rows = connection.execute(
            """
            SELECT id, user_id, login_time
            FROM login_history
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT 100
            """,
            (user["id"],)
        ).fetchall()

        return {"history": [dict(row) for row in rows]}

    finally:
        connection.close()


# -------------------- MODEL LOADING --------------------

BASE_DIR = os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))
)

MODEL_PATH = os.path.join(
    BASE_DIR, "ml", "models", "skinvera_model.pth"
)

device = torch.device(
    "cuda" if torch.cuda.is_available() else "cpu"
)

transform = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor()
])

model = None
labels = []

if not os.path.exists(MODEL_PATH):
    print("SkinVera model file not found:", MODEL_PATH)

else:
    try:
        checkpoint = torch.load(
            MODEL_PATH,
            map_location=device,
            weights_only=False
        )

        if not isinstance(checkpoint, dict):
            raise ValueError("Invalid model checkpoint format.")

        # Your checkpoint previously showed the keys:
        # "model" and "labels".
        state_dict = checkpoint.get(
            "model",
            checkpoint.get(
                "model_state_dict",
                checkpoint.get("state_dict")
            )
        )

        labels = checkpoint.get("labels", [])

        if state_dict is None:
            raise ValueError(
                "No model weights found in the checkpoint."
            )

        if isinstance(labels, dict):
            labels = [
                name
                for name, index in sorted(
                    labels.items(),
                    key=lambda item: item[1]
                )
            ]

        if not isinstance(labels, (list, tuple)) or not labels:
            raise ValueError(
                "The checkpoint does not contain valid class labels."
            )

        labels = [str(label) for label in labels]

        # Assumes the checkpoint was trained using ResNet-18.
        model = models.resnet18(weights=None)
        model.fc = nn.Linear(
            model.fc.in_features,
            len(labels)
        )

        model.load_state_dict(state_dict)
        model.to(device)
        model.eval()

        print("SkinVera model loaded successfully.")
        print("Model classes:", labels)
        print("Running on:", device)

    except Exception as error:
        print(
            "SkinVera model could not be loaded:",
            repr(error)
        )
        model = None


# -------------------- IMAGE ANALYSIS --------------------

@app.post("/analyze")
async def analyze_image(file: UploadFile = File(...)):
    if model is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "The SkinVera model is not ready. "
                "Check the backend terminal for the model loading error."
            )
        )

    if (
        not file.content_type
        or not file.content_type.startswith("image/")
    ):
        raise HTTPException(
            status_code=400,
            detail="Please upload an image file."
        )

    try:
        contents = await file.read()

        if len(contents) > 10 * 1024 * 1024:
            raise HTTPException(
                status_code=413,
                detail="Image must be smaller than 10 MB."
            )

        image = Image.open(
            io.BytesIO(contents)
        ).convert("RGB")

        image_tensor = transform(image).unsqueeze(0).to(device)

        with torch.no_grad():
            output = model(image_tensor)

            probabilities = torch.softmax(output, dim=1)

            confidence, predicted = torch.max(
                probabilities, dim=1
            )

        confidence_value = float(confidence.item() * 100)
        index = int(predicted.item())

        concern = (
            labels[index]
            if 0 <= index < len(labels)
            else "Unknown concern"
        )

        if confidence_value < 60:
            concern = "No reliable match detected"

        return {
            "concern": concern,
            "confidence": round(confidence_value, 2),
            "disclaimer": (
                "Experimental model output, not a medical diagnosis. "
                "A low-confidence result does not establish that skin is clear."
            )
        }

    except UnidentifiedImageError:
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid image."
        )

    finally:
        await file.close()


# -------------------- SAVE ANALYSIS HISTORY --------------------

@app.post("/analyses")
def save_analysis(
    data: SaveAnalysisData,
    user=Depends(get_current_user)
):
    connection = get_db()

    try:
        cursor = connection.execute(
            """
            INSERT INTO analyses (
                user_id, skin_type, main_concern, symptoms,
                duration, image_concern, confidence
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                user["id"],
                data.skin_type,
                data.main_concern,
                data.symptoms,
                data.duration,
                data.image_concern,
                data.confidence
            )
        )

        connection.commit()

        row = connection.execute(
            "SELECT * FROM analyses WHERE id = ?",
            (cursor.lastrowid,)
        ).fetchone()

        return {
            "message": "Analysis saved successfully",
            "analysis": dict(row)
        }

    finally:
        connection.close()


# -------------------- GET SAVED ANALYSES --------------------

@app.get("/analyses")
def get_analyses(user=Depends(get_current_user)):
    connection = get_db()

    try:
        rows = connection.execute(
            """
            SELECT
                id, skin_type, main_concern, symptoms,
                duration, image_concern, confidence, created_at
            FROM analyses
            WHERE user_id = ?
            ORDER BY id DESC
            LIMIT 100
            """,
            (user["id"],)
        ).fetchall()

        return {"analyses": [dict(row) for row in rows]}

    finally:
        connection.close()


# -------------------- HEALTH CHECK --------------------

@app.get("/")
def home():
    return {
        "message": "SkinVera API is running",
        "model_loaded": model is not None
    }