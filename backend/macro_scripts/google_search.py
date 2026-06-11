import pyautogui
import time

pyautogui.hotkey("ctrl", "t")
time.sleep(0.5)
pyautogui.typewrite("why did dinosaurs go extinct?")
pyautogui.press("enter")
