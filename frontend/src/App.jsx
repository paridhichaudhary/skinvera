
import { useEffect, useState } from "react";
import "./App.css";

const API = "http://127.0.0.1:8000";

const initialAnswers = {
  skinType: "",
  concerns: [],
  symptoms: "",
  duration: "",
  irritation: "",
  sensitivity: "",
  routine: "",
  allergies: "",
};

const questions = [
  {
    key: "skinType",
    title: "How would you describe your skin?",
    options: ["Oily", "Dry", "Combination", "Normal", "Not sure"],
  },
  {
    key: "concerns",
    title: "What are your main concerns?",
    options: [
      "Acne or pimples",
      "Dark spots",
      "Dryness",
      "Redness",
      "Uneven texture",
      "Oiliness",
      "Itching",
      "No major concerns",
    ],
    multiple: true,
  },
  {
    key: "symptoms",
    title: "What symptoms have you noticed?",
    options: [
      "Bumps",
      "Flaking",
      "Redness",
      "Itching",
      "Dark marks",
      "None",
    ],
  },
  {
    key: "duration",
    title: "How long have you noticed this?",
    options: [
      "A few days",
      "1–4 weeks",
      "1–6 months",
      "More than 6 months",
      "No concerns",
    ],
  },
  {
    key: "irritation",
    title: "Do you experience skin irritation?",
    options: ["Often", "Sometimes", "Rarely", "Never"],
  },
  {
    key: "sensitivity",
    title: "How sensitive is your skin?",
    options: ["Very sensitive", "Somewhat sensitive", "Not sensitive", "Not sure"],
  },
  {
    key: "routine",
    title: "What is your current skincare routine?",
    options: ["No routine", "Basic cleanser and moisturizer", "Several products"],
  },
];

function App() {
  const [user, setUser] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("skinvera_user")) || null;
    } catch {
      return null;
    }
  });

  const [authMode, setAuthMode] = useState("login");
  const [auth, setAuth] = useState({
    name: "",
    email: "",
    password: "",
  });

  const [answers, setAnswers] = useState(initialAnswers);
  const [questionIndex, setQuestionIndex] = useState(0);
  const [image, setImage] = useState(null);
  const [preview, setPreview] = useState("");
  const [result, setResult] = useState(null);
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [loginHistory, setLoginHistory] = useState([]);
  const [page, setPage] = useState("home");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.token) {
      loadAnalysisHistory(user.token);
      loadLoginHistory(user.token);
    }
  }, [user?.token]);

  function updateAnswer(key, value) {
    setAnswers((previous) => ({ ...previous, [key]: value }));
  }

  function selectConcern(concern) {
    setAnswers((previous) => {
      let concerns = previous.concerns;

      if (concern === "No major concerns") {
        concerns = concerns.includes(concern) ? [] : [concern];
      } else {
        concerns = concerns.filter((item) => item !== "No major concerns");
        concerns = concerns.includes(concern)
          ? concerns.filter((item) => item !== concern)
          : [...concerns, concern];
      }

      return { ...previous, concerns };
    });
  }

  async function handleAuth(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setLoading(true);

    try {
      const endpoint = authMode === "login" ? "/login" : "/signup";

      const response = await fetch(`${API}${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(auth),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Authentication failed.");
      }

      const loggedInUser = {
        ...data.user,
        token: data.token,
      };

      localStorage.setItem("skinvera_user", JSON.stringify(loggedInUser));
      setUser(loggedInUser);
      setPage("home");
      setMessage("Welcome to SkinVera!");
    } catch (err) {
      setError(err.message || "Could not connect to the backend.");
    } finally {
      setLoading(false);
    }
  }

  function logout() {
    localStorage.removeItem("skinvera_user");
    setUser(null);
    setAnalysisHistory([]);
    setLoginHistory([]);
    setPage("home");
    setMessage("You have been logged out.");
  }

  async function loadAnalysisHistory(token = user?.token) {
    if (!token) return;

    try {
      const response = await fetch(`${API}/analyses`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        setError("Your session has expired. Please log in again.");
        return;
      }

      const data = await response.json();

      if (response.ok) {
        setAnalysisHistory(data.analyses || []);
      }
    } catch {
      setError("Could not load saved analysis history.");
    }
  }

  async function loadLoginHistory(token = user?.token) {
    if (!token) return;

    try {
      const response = await fetch(`${API}/login-history`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();

      if (response.ok) {
        setLoginHistory(data.history || []);
      }
    } catch {
      // Login history can be loaded again when the page is opened.
    }
  }

  async function analyzeImage(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setResult(null);

    if (!image) {
      setError("Please choose a skin image first.");
      return;
    }

    if (!answers.skinType) {
      setError("Please answer the skin-type question first.");
      return;
    }

    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("file", image);

      const response = await fetch(`${API}/analyze`, {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "Image analysis failed.");
      }

      const analysis = {
        ...data,
        skin_type: answers.skinType,
        main_concern: answers.concerns.join(", "),
        symptoms: answers.symptoms,
        duration: answers.duration,
        selected_concerns: answers.concerns,
        created_at: new Date().toLocaleString(),
      };

      setResult(analysis);

      if (user?.token) {
        const saveResponse = await fetch(`${API}/analyses`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${user.token}`,
          },
          body: JSON.stringify({
            skin_type: answers.skinType,
            main_concern: answers.concerns.join(", "),
            symptoms: [
              answers.symptoms,
              answers.irritation ? `Irritation: ${answers.irritation}` : "",
              answers.sensitivity ? `Sensitivity: ${answers.sensitivity}` : "",
              answers.routine ? `Routine: ${answers.routine}` : "",
              answers.allergies ? `Allergies: ${answers.allergies}` : "",
            ].filter(Boolean).join("; "),
            duration: answers.duration,
            image_concern: data.concern,
            confidence: data.confidence,
          }),
        });

        const saveData = await saveResponse.json();

        if (!saveResponse.ok) {
          throw new Error(
            saveData.detail || "Analysis completed, but saving failed."
          );
        }

        await loadAnalysisHistory(user.token);
      } else {
        setMessage("Analysis complete. Log in to save it to your history.");
      }

      setPage("results");
    } catch (err) {
      setError(err.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  const isNoConcern =
    answers.concerns.includes("No major concerns") ||
    answers.concerns.length === 0;

  const isUncertain =
    !result ||
    result.concern === "No reliable match detected" ||
    result.confidence < 60;

  const productSuggestions = getProductSuggestions(
    result?.concern,
    answers.skinType,
    answers.concerns
  );

  return (
    <div className="app">
      <header className="navbar">
        <button className="brand" onClick={() => setPage("home")}>
          <span className="brand-mark">S</span>
          <span>SkinVera</span>
        </button>

        <nav>
          <button onClick={() => setPage("home")}>Home</button>
          <button onClick={() => setPage("assessment")}>Skin assessment</button>
          {user && (
            <button onClick={() => setPage("history")}>My history</button>
          )}
          {user ? (
            <button onClick={logout}>Log out</button>
          ) : (
            <button onClick={() => setPage("auth")}>Log in</button>
          )}
        </nav>
      </header>

      <main className="container">
        {message && <div className="notice">{message}</div>}
        {error && (
          <div className="error" role="alert">
            {error}
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}

        {page === "home" && (
          <section className="hero">
            <div className="hero-copy">
              <p className="eyebrow">YOUR SKINCARE COMPANION</p>
              <h1>Understand your skin. Care for it better.</h1>
              <p>
                Explore your skin concerns, answer a few questions, and get
                general skincare suggestions with SkinVera.
              </p>
              <div className="actions">
                <button className="primary" onClick={() => setPage("assessment")}>
                  Start skin assessment
                </button>
                {!user && (
                  <button className="secondary" onClick={() => setPage("auth")}>
                    Create account
                  </button>
                )}
              </div>
              <p className="subtle">
                An educational prototype, not a medical diagnostic service.
              </p>
            </div>

            <div className="hero-card">
              <div className="hero-circle">SV</div>
              <h2>Your skin, your routine</h2>
              <p>
                A questionnaire, experimental image analysis, and general
                product-category guidance in one place.
              </p>
              <div className="mini-stats">
                <span>Skin questionnaire</span>
                <span>Image analysis</span>
                <span>Saved history</span>
              </div>
            </div>
          </section>
        )}

        {page === "auth" && (
          <section className="panel auth-panel">
            <p className="eyebrow">YOUR SKINVERA ACCOUNT</p>
            <h1>{authMode === "login" ? "Welcome back" : "Create your account"}</h1>
            <p className="subtle">
              Your account lets you save and revisit previous analyses.
            </p>

            <form onSubmit={handleAuth} className="form">
              {authMode === "signup" && (
                <label>
                  Full name
                  <input
                    required
                    value={auth.name}
                    onChange={(e) =>
                      setAuth({ ...auth, name: e.target.value })
                    }
                    placeholder="Your name"
                  />
                </label>
              )}

              <label>
                Email address
                <input
                  type="email"
                  required
                  value={auth.email}
                  onChange={(e) =>
                    setAuth({ ...auth, email: e.target.value })
                  }
                  placeholder="you@example.com"
                />
              </label>

              <label>
                Password
                <input
                  type="password"
                  required
                  minLength={8}
                  value={auth.password}
                  onChange={(e) =>
                    setAuth({ ...auth, password: e.target.value })
                  }
                  placeholder="At least 8 characters"
                />
              </label>

              <button className="primary" disabled={loading}>
                {loading
                  ? "Please wait..."
                  : authMode === "login"
                    ? "Log in"
                    : "Create account"}
              </button>
            </form>

            <p className="switch-auth">
              {authMode === "login"
                ? "Don't have an account?"
                : "Already have an account?"}{" "}
              <button
                onClick={() =>
                  setAuthMode(authMode === "login" ? "signup" : "login")
                }
              >
                {authMode === "login" ? "Sign up" : "Log in"}
              </button>
            </p>
          </section>
        )}

        {page === "assessment" && (
          <section className="panel">
            <p className="eyebrow">PERSONALIZED QUESTIONNAIRE</p>
            <h1>Tell us about your skin</h1>
            <p className="subtle">
              Answer the questions and upload an image if you want an
              experimental image analysis.
            </p>

            <div className="progress-track">
              <div
                className="progress-fill"
                style={{
                  width: `${((questionIndex + 1) / questions.length) * 100}%`,
                }}
              />
            </div>

            <p className="subtle">
              Question {questionIndex + 1} of {questions.length}
            </p>

            {questions.map((question, index) => (
              <section
                key={question.key}
                className="question"
                hidden={index !== questionIndex}
              >
                <h2>{question.title}</h2>

                <div className="option-grid">
                  {question.options.map((option) => {
                    const selected = question.multiple
                      ? answers[question.key].includes(option)
                      : answers[question.key] === option;

                    return (
                      <button
                        key={option}
                        type="button"
                        className={`option ${selected ? "selected" : ""}`}
                        onClick={() => {
                          if (question.multiple) {
                            selectConcern(option);
                          } else {
                            updateAnswer(question.key, option);
                          }
                        }}
                      >
                        {option}
                      </button>
                    );
                  })}
                </div>

                {question.key === "concerns" && (
                  <p className="subtle">
                    Select all that apply, or choose “No major concerns.”
                  </p>
                )}
              </section>
            ))}

            <div className="actions question-actions">
              <button
                className="secondary"
                disabled={questionIndex === 0}
                onClick={() => setQuestionIndex((i) => i - 1)}
              >
                Previous
              </button>
              {questionIndex < questions.length - 1 ? (
                <button
                  className="primary"
                  onClick={() => setQuestionIndex((i) => i + 1)}
                >
                  Next question
                </button>
              ) : (
                <span className="subtle">Questionnaire complete</span>
              )}
            </div>

            <div className="divider" />

            <h2>Additional details</h2>

            <label className="field-label">
              Known allergies or products that cause reactions (optional)
              <textarea
                rows="3"
                value={answers.allergies}
                onChange={(e) => updateAnswer("allergies", e.target.value)}
                placeholder="Enter details, or leave blank"
              />
            </label>

            <form onSubmit={analyzeImage} className="upload-form">
              <h2>Upload a skin image</h2>
              <p className="subtle">
                Use a clear, well-lit image. Avoid including identifying
                details where possible.
              </p>

              <label className="upload-box">
                <span>{image ? image.name : "Choose an image"}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const selectedFile = e.target.files?.[0];
                    if (!selectedFile) return;

                    setImage(selectedFile);
                    setPreview(URL.createObjectURL(selectedFile));
                  }}
                />
              </label>

              {preview && (
                <img className="preview-image" src={preview} alt="Selected skin image" />
              )}

              {!user && (
                <p className="subtle">
                  You can try the assessment without an account. Log in to
                  save results to your history.
                </p>
              )}

              <button className="primary" disabled={loading}>
                {loading ? "Analyzing..." : "Analyze skin image"}
              </button>
            </form>
          </section>
        )}

        {page === "results" && result && (
          <section className="panel">
            <p className="eyebrow">YOUR ANALYSIS</p>
            <h1>Skin assessment results</h1>

            <div className="result-card">
              <p className="subtle">Experimental image model result</p>
              <h2>{result.concern}</h2>
              <p>Model confidence: {result.confidence}%</p>
              <p className="subtle">
                Confidence is the model's score, not a measure of medical
                certainty.
              </p>
            </div>

            {isUncertain && (
              <div className="notice">
                The model could not confidently match the image. This does not
                mean your skin is clear or free of a condition.
              </div>
            )}

            <h2>Your questionnaire</h2>
            <div className="detail-list">
              <p><strong>Skin type:</strong> {answers.skinType || "Not provided"}</p>
              <p>
                <strong>Concerns:</strong>{" "}
                {answers.concerns.join(", ") || "Not provided"}
              </p>
              <p><strong>Symptoms:</strong> {answers.symptoms || "Not provided"}</p>
              <p><strong>Duration:</strong> {answers.duration || "Not provided"}</p>
              <p><strong>Irritation:</strong> {answers.irritation || "Not provided"}</p>
              <p><strong>Sensitivity:</strong> {answers.sensitivity || "Not provided"}</p>
            </div>

            <h2>General skincare suggestions</h2>
            <p className="subtle">
              These are general product categories, not a diagnosis or a
              personalized prescription.
            </p>

            <div className="product-grid">
              {productSuggestions.map((product) => (
                <article className="product-card" key={product.title}>
                  <h3>{product.title}</h3>
                  <p>{product.description}</p>
                  <a href={product.url} target="_blank" rel="noreferrer">
                    Explore brand information ↗
                  </a>
                </article>
              ))}
            </div>

            <p className="disclaimer">
              {result.disclaimer ||
                "SkinVera is experimental and does not provide medical diagnoses."}
              {" "}Stop using products that cause irritation and consult a
              qualified dermatologist for persistent, painful, spreading, or
              concerning symptoms.
            </p>

            <div className="actions">
              <button
                className="primary"
                onClick={() => {
                  setResult(null);
                  setImage(null);
                  setPreview("");
                  setAnswers(initialAnswers);
                  setQuestionIndex(0);
                  setPage("assessment");
                }}
              >
                New assessment
              </button>
              {user && (
                <button className="secondary" onClick={() => setPage("history")}>
                  View saved history
                </button>
              )}
            </div>
          </section>
        )}

        {page === "history" && (
          <section className="panel">
            <p className="eyebrow">YOUR ACCOUNT</p>
            <h1>My history</h1>
            <p className="subtle">
              Your analyses are saved to your account. Login history records
              account sign-ins, not skin analyses.
            </p>

            <div className="actions">
              <button
                className="secondary"
                onClick={() => loadAnalysisHistory()}
              >
                Refresh analyses
              </button>
              <button
                className="secondary"
                onClick={() => loadLoginHistory()}
              >
                Refresh logins
              </button>
            </div>

            <h2>Saved skin analyses</h2>

            {analysisHistory.length === 0 ? (
              <p className="empty">No saved analyses yet.</p>
            ) : (
              <div className="history-list">
                {analysisHistory.map((item) => (
                  <article className="history-card" key={item.id}>
                    <h3>{item.image_concern || "Analysis"}</h3>
                    <p><strong>Skin type:</strong> {item.skin_type || "Not specified"}</p>
                    <p><strong>Concerns:</strong> {item.main_concern || "Not specified"}</p>
                    <p><strong>Symptoms:</strong> {item.symptoms || "Not specified"}</p>
                    <p><strong>Duration:</strong> {item.duration || "Not specified"}</p>
                    <p><strong>Confidence:</strong> {item.confidence}%</p>
                    <p className="subtle">
                      {item.created_at || "Date unavailable"}
                    </p>
                  </article>
                ))}
              </div>
            )}

            <h2>Login history</h2>

            {loginHistory.length === 0 ? (
              <p className="empty">No login records available.</p>
            ) : (
              <div className="history-list">
                {loginHistory.map((item) => (
                  <article className="history-card" key={item.id}>
                    <p>Login record #{item.id}</p>
                    <p className="subtle">
                      {item.login_time || "Date unavailable"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}
      </main>

      <footer className="footer">
        <p>SkinVera · Educational skincare prototype</p>
        <p>Not a substitute for professional medical advice.</p>
      </footer>
    </div>
  );
}

function getProductSuggestions(concern, skinType, concerns = []) {
  const suggestions = [
    {
      title: "Gentle cleanser",
      description: "A mild, fragrance-free cleanser can help remove dirt without excessive stripping.",
      url: "https://www.cerave.com/",
    },
    {
      title: "Moisturizer",
      description: "Consider a moisturizer suited to your skin type. Fragrance-free options may suit sensitive skin.",
      url: "https://www.cetaphil.com/",
    },
    {
      title: "Broad-spectrum sunscreen",
      description: "Daily broad-spectrum sun protection helps reduce UV damage and worsening of dark marks.",
      url: "https://www.laroche-posay.com/",
    },
  ];

  const text = `${concern || ""} ${concerns.join(" ")}`.toLowerCase();

  if (skinType === "Oily" || text.includes("acne") || text.includes("pimples")) {
    suggestions.push({
      title: "Oil-free moisturizer options",
      description: "Look for lightweight, non-comedogenic products. Introduce new products gradually.",
      url: "https://www.cerave.com/",
    });
  }

  if (skinType === "Dry" || text.includes("dryness")) {
    suggestions.push({
      title: "Barrier-support moisturizer options",
      description: "Look for ingredients such as ceramides and glycerin to support skin hydration.",
      url: "https://www.cetaphil.com/",
    });
  }

  if (text.includes("dark spots") || text.includes("dark marks")) {
    suggestions.push({
      title: "Dark-mark care information",
      description: "Sunscreen is important for preventing dark marks from becoming more pronounced.",
      url: "https://www.laroche-posay.com/",
    });
  }

  return suggestions;
}

export default App;
