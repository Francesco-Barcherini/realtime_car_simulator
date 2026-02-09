// MQTT Client for receiving data from Raspberry Pi and AI Pipeline

class MQTTClient {
    constructor(onMessageCallback) {
        this.client = null;
        this.connected = false;
        this.onMessageCallback = onMessageCallback;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
    }

    // Connect to MQTT broker
    connect() {
        try {
            // Create MQTT client
            this.client = new Paho.MQTT.Client(
                CONFIG.mqtt.broker,
                CONFIG.mqtt.port,
                CONFIG.mqtt.clientId
            );

            // Set callbacks
            this.client.onConnectionLost = (response) => this.onConnectionLost(response);
            this.client.onMessageArrived = (message) => this.onMessageArrived(message);

            // Connect options
            const options = {
                onSuccess: () => this.onConnect(),
                onFailure: (error) => this.onConnectFailure(error),
                keepAliveInterval: 30,
                timeout: 10,
                useSSL: false
            };

            console.log(`Connecting to MQTT broker at ${CONFIG.mqtt.broker}:${CONFIG.mqtt.port}...`);
            this.client.connect(options);
        } catch (error) {
            console.error('Failed to create MQTT client:', error);
            this.updateStatus(false);
        }
    }

    // Connection successful
    onConnect() {
        console.log('Connected to MQTT broker');
        this.connected = true;
        this.reconnectAttempts = 0;
        this.updateStatus(true);

        // Subscribe to all topics
        this.subscribe(CONFIG.mqtt.topics.mouseSpeed);
        this.subscribe(CONFIG.mqtt.topics.mouseSteering);
        this.subscribe(CONFIG.mqtt.topics.mouseObstacle);
        this.subscribe(CONFIG.mqtt.topics.aiObjects);
    }

    // Connection failed
    onConnectFailure(error) {
        console.error('MQTT connection failed:', error);
        this.connected = false;
        this.updateStatus(false);

        // Retry connection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Retrying connection (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
            setTimeout(() => this.connect(), 5000);
        } else {
            console.error('Max reconnection attempts reached');
        }
    }

    // Connection lost
    onConnectionLost(response) {
        console.log('MQTT connection lost:', response.errorMessage);
        this.connected = false;
        this.updateStatus(false);

        // Attempt to reconnect
        this.reconnectAttempts = 0;
        setTimeout(() => this.connect(), 2000);
    }

    // Subscribe to topic
    subscribe(topic) {
        if (this.client && this.connected) {
            this.client.subscribe(topic);
            console.log(`Subscribed to topic: ${topic}`);
        }
    }

    // Message arrived
    onMessageArrived(message) {
        const topic = message.destinationName;
        const payload = message.payloadString;

        console.log(`Message received on ${topic}:`, payload);

        try {
            const data = JSON.parse(payload);
            this.handleMessage(topic, data);
        } catch (error) {
            console.error('Failed to parse MQTT message:', error);
        }
    }

    // Handle different message types
    handleMessage(topic, data) {
        if (topic === CONFIG.mqtt.topics.mouseSpeed) {
            // Mouse speed control
            this.onMessageCallback('mouseSpeed', data);
        } else if (topic === CONFIG.mqtt.topics.mouseSteering) {
            // Mouse steering control
            this.onMessageCallback('mouseSteering', data);
        } else if (topic === CONFIG.mqtt.topics.mouseObstacle) {
            // User-added obstacle from mouse wheel
            this.onMessageCallback('mouseObstacle', data);
        } else if (topic === CONFIG.mqtt.topics.aiObjects) {
            // AI-detected objects
            this.onMessageCallback('aiObjects', data);
        }
    }

    // Update connection status in UI
    updateStatus(connected) {
        const statusIndicator = document.getElementById('mqtt-status');
        const statusText = document.getElementById('mqtt-status-text');

        if (connected) {
            statusIndicator.classList.remove('disconnected');
            statusIndicator.classList.add('connected');
            statusText.textContent = 'Connected';
        } else {
            statusIndicator.classList.remove('connected');
            statusIndicator.classList.add('disconnected');
            statusText.textContent = 'Disconnected';
        }
    }

    // Disconnect
    disconnect() {
        if (this.client && this.connected) {
            this.client.disconnect();
            this.connected = false;
            this.updateStatus(false);
        }
    }

    // Check if connected
    isConnected() {
        return this.connected;
    }
}
