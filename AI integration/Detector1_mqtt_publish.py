from AWSIoTPythonSDK.MQTTLib import AWSIoTMQTTClient
import json

# Debugging: Print to check script execution
print("Starting AWS IoT MQTT Client...")

# MQTT Client Setup
client = AWSIoTMQTTClient("BorderAI")
client.configureEndpoint("AWS_IOT_ENDPOINT", 8883)  # Replace with your endpoint

# Provide the correct path to certificate files
client.configureCredentials(
    os.getenv("ROOT_CA_PATH"),
    os.getenv("PRIVATE_KEY_PATH"),
    os.getenv("CERTIFICATE_PATH")
)

print(" Certificates loaded successfully.")

# Connect to AWS IoT
print(" Connecting to AWS IoT...")
client.connect()
print(" Successfully connected to AWS IoT!")

# Function to send an alert
def send_alert(lat, lon):
    message = {
        "alert": "Human detected at the border!",
        "latitude": lat,
        "longitude": lon
    }
    print(" Sending Alert:", message)
    client.publish("Detector1_alerts", json.dumps(message), 1)
    print(" Alert Sent!")

# Example: Send an alert
send_alert(34.56, 76.12)
