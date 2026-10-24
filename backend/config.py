import os
import shutil
from pathlib import Path
from dotenv import load_dotenv

# Load .env from root project directory
ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
TAVILY_API_KEY = os.getenv("TAVILY_API_KEY", "")
HF_TOKEN = os.getenv("HF_TOKEN", os.getenv("HUGGINGFACE_API_KEY", ""))
FINSEC_MODEL_ID = os.getenv("FINSEC_MODEL_ID", "elsiddik/finsec_detector")
KAALASTRA_PORT = int(os.getenv("KAALASTRA_PORT", "8000"))
MODEL_NAME = "gemini-3.5-flash-lite"
CANDIDATE_MODELS = ["gemini-3.5-flash-lite", "gemini-3.5-flash", "gemini-2.5-flash"]

def get_semgrep_path() -> str:
    """Resolve pysemgrep or semgrep binary path on Windows/Unix."""
    # Check PATH first
    which_semgrep = shutil.which("semgrep")
    if which_semgrep:
        return which_semgrep
    
    which_pysemgrep = shutil.which("pysemgrep")
    if which_pysemgrep:
        return which_pysemgrep

    # Common Windows python user scripts location
    user_appdata = os.path.expanduser(r"~\AppData\Roaming\Python\Python310\Scripts")
    pysemgrep_win = os.path.join(user_appdata, "pysemgrep.exe")
    if os.path.exists(pysemgrep_win):
        return pysemgrep_win
        
    semgrep_win = os.path.join(user_appdata, "semgrep.exe")
    if os.path.exists(semgrep_win):
        return semgrep_win

    return "semgrep"

