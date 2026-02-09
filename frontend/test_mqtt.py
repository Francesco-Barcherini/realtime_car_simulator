#!/usr/bin/env python3
"""
MQTT Test Publisher
Simulates MQTT messages for testing the frontend without actual hardware
"""

import paho.mqtt.client as mqtt
import json
import time
import random
import math

# MQTT Configuration
BROKER = "localhost"  # Change to your broker IP
PORT = 1883

# Topics
TOPIC_SPEED = "mouse/speed"
TOPIC_STEERING = "mouse/steering"
TOPIC_OBSTACLE = "mouse/obstacle"
TOPIC_AI_OBJECTS = "ai/objects"

def on_connect(client, userdata, flags, rc):
    if rc == 0:
        print("Connected to MQTT broker")
    else:
        print(f"Connection failed with code {rc}")

def simulate_mouse_control(client):
    """Simulate mouse speed and steering inputs"""
    # Simulate varying speed (0-1)
    speed = abs(math.sin(time.time() * 0.5))
    client.publish(TOPIC_SPEED, json.dumps({"speed": speed}))
    print(f"Published speed: {speed:.2f}")
    
    # Simulate steering (-45 to 45 degrees)
    steering = math.sin(time.time() * 0.3) * 45
    client.publish(TOPIC_STEERING, json.dumps({"angle": steering}))
    print(f"Published steering: {steering:.2f}°")

def simulate_user_obstacle(client):
    """Simulate user adding obstacle with mouse wheel"""
    obstacle = {
        "x": random.randint(200, 600),
        "y": random.randint(-50, 100)
    }
    client.publish(TOPIC_OBSTACLE, json.dumps(obstacle))
    print(f"Published user obstacle at ({obstacle['x']}, {obstacle['y']})")

def simulate_ai_objects(client):
    """Simulate AI-detected objects"""
    # Generate 1-3 random objects
    num_objects = random.randint(1, 3)
    objects = []
    
    classes = [
        (2, "car"),
        (1, "bicycle"),
        (3, "motorcycle"),
        (0, "person"),
        (5, "bus"),
        (7, "truck")
    ]
    
    for i in range(num_objects):
        class_id, class_name = random.choice(classes)
        obj = {
            "id": random.randint(1, 100),
            "class": class_id,
            "bbox": [
                random.randint(100, 500),  # x
                random.randint(100, 400),  # y
                random.randint(50, 100),   # w
                random.randint(50, 100)    # h
            ],
            "distance": random.uniform(2.0, 30.0)
        }
        objects.append(obj)
    
    client.publish(TOPIC_AI_OBJECTS, json.dumps(objects))
    print(f"Published {num_objects} AI objects")

def main():
    # Create MQTT client
    client = mqtt.Client(client_id="test_publisher")
    client.on_connect = on_connect
    
    # Connect to broker
    print(f"Connecting to MQTT broker at {BROKER}:{PORT}...")
    client.connect(BROKER, PORT, 60)
    client.loop_start()
    
    print("\nStarting MQTT test publisher...")
    print("Press Ctrl+C to stop\n")
    
    try:
        iteration = 0
        while True:
            iteration += 1
            print(f"\n--- Iteration {iteration} ---")
            
            # Publish mouse control data every iteration
            simulate_mouse_control(client)
            
            # Publish AI objects every 2 seconds
            if iteration % 4 == 0:
                simulate_ai_objects(client)
            
            # Publish user obstacle occasionally
            if iteration % 10 == 0:
                simulate_user_obstacle(client)
            
            time.sleep(0.5)
            
    except KeyboardInterrupt:
        print("\n\nStopping publisher...")
        client.loop_stop()
        client.disconnect()
        print("Disconnected")

if __name__ == "__main__":
    main()
