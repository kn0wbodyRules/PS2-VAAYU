"""Point every Drive path at a throwaway folder BEFORE config is imported anywhere."""

import os
import sys
import tempfile
from pathlib import Path

_ROOT = tempfile.mkdtemp(prefix="vaayu_test_drive_")
os.environ["VAAYU_DRIVE_ROOT"] = _ROOT
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
