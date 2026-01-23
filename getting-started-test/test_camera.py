from time import sleep
from picamera import PiCamera

camera = PiCamera()
camera.resolution = (1920, 1080)
camera.start_preview()
sleep(100)
camera.capture('foo.jpg')