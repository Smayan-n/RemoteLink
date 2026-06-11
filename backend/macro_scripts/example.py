"""Example script macro — save a binding with nickname 'example' to run this."""

import sys
import pyautogui

remote_id = sys.argv[1] if len(sys.argv) > 1 else "?"
btn_id = sys.argv[2] if len(sys.argv) > 2 else "?"
print(f"Example script ran for remote={remote_id} btn={btn_id}")

# pyautogui.press("f")
