# Frontend Testing Guide

## Quick Start

1. **Start a local web server**:
   ```bash
   cd frontend
   python3 -m http.server 8000
   ```

2. **Open in browser**:
   ```
   http://localhost:8000
   ```

3. **Test keyboard controls**:
   - Use arrow keys to control the car
   - Observe velocity and steering changes in HUD

## Testing with MQTT

### Option 1: Local MQTT Broker

1. **Install Mosquitto**:
   ```bash
   # macOS
   brew install mosquitto
   
   # Linux
   sudo apt-get install mosquitto mosquitto-clients
   ```

2. **Configure for WebSockets** (edit mosquitto.conf):
   ```
   listener 1883
   listener 9001
   protocol websockets
   allow_anonymous true
   ```

3. **Start broker**:
   ```bash
   mosquitto -c /path/to/mosquitto.conf
   ```

4. **Update config.js**:
   ```javascript
   mqtt: {
       broker: 'localhost',
       port: 9001,
       // ...
   }
   ```

### Option 2: Test Publisher

1. **Install Python MQTT client**:
   ```bash
   pip install paho-mqtt
   ```

2. **Run test publisher**:
   ```bash
   python test_mqtt.py
   ```

3. **Observe**:
   - MQTT status should show "Connected"
   - Objects should appear on screen
   - Speed/steering should change automatically

## Manual Testing Checklist

- [ ] Page loads without errors
- [ ] Canvas renders correctly
- [ ] Road scrolls when moving forward
- [ ] Keyboard controls work (all 4 arrows)
- [ ] HUD updates (speed, steering, score)
- [ ] Random obstacles spawn
- [ ] Collision detection works
- [ ] Game over screen appears on collision
- [ ] Restart button works
- [ ] MQTT connection status updates
- [ ] AI objects appear when published
- [ ] Mouse control affects car movement

## Debugging

### Check Browser Console
Open Developer Tools (F12) and check for:
- JavaScript errors
- MQTT connection messages
- Message received logs

### Common Issues

1. **MQTT won't connect**:
   - Check broker is running
   - Verify WebSocket port (9001)
   - Check firewall settings
   - Ensure broker allows WebSocket connections

2. **Objects don't appear**:
   - Check MQTT messages in console
   - Verify message format matches expected structure
   - Check obstacle manager logic

3. **Controls don't work**:
   - Ensure page has focus (click on canvas)
   - Check browser console for errors

## Performance Testing

- Target: 60 FPS
- Monitor with browser DevTools Performance tab
- Test with many obstacles (20+)
- Check memory usage over time
